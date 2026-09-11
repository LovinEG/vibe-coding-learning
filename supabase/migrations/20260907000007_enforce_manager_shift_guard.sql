-- =====================================================================
-- Миграция: 20260907000007_enforce_manager_shift_guard.sql
-- Описание: ЭТАП 2 — серверный guard обязательной смены для роли manager.
--           Цель: manager не может выполнять рабочие write-операции
--           вне открытой смены или вне окна [11:00, 17:30) Europe/Minsk
--           даже при прямом вызове Supabase API/RPC.
--
-- Правила:
--   - admin / user / technician: поведение БД НЕ меняется;
--   - чтение (SELECT) нигде не ограничивается сменой;
--   - guard: public.current_role_code() <> 'manager'
--       OR public.can_perform_work_operation();
--   - finance-таблицы (payments/cash_operations/cash_registers) и склад
--     (inventory.manage) не трогаются — manager и так не имеет этих прав;
--   - RPC close_order: guard до любых изменений; защита от двойной
--     оплаты и расчёт остатка сохранены; admin закрывает без смены.
--
-- Затронутые таблицы (write-политики):
--   orders (RLS включается впервые + политики),
--   clients, devices (открытые «public» политики заменены),
--   order_services, order_status_history, tasks (guard добавлен).
--
-- Старые shift-маркеры cash_operations, frontend и can_perform_work_
-- operation() не изменяются.
--
-- Применение: Supabase SQL Editor (или supabase db push).
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Хелпер-предикат guard для write-политик.
--    true для admin/user/technician (и ролей без профиля — они не manager);
--    для manager — только can_perform_work_operation().
-- ---------------------------------------------------------------------
create or replace function public.work_shift_write_allowed()
returns boolean
language sql
stable
as $$
  select public.current_role_code() is distinct from 'manager'
     or public.can_perform_work_operation();
$$;

grant execute on function public.work_shift_write_allowed() to authenticated;
revoke execute on function public.work_shift_write_allowed() from anon;

-- ---------------------------------------------------------------------
-- 2. orders: RLS включается впервые (таблица legacy, политик не было).
--    SELECT — authenticated (сохраняет текущее чтение приложения);
--    INSERT/UPDATE/DELETE — authenticated + shift guard.
-- ---------------------------------------------------------------------
alter table public.orders enable row level security;

drop policy if exists "Allow authenticated to read orders" on public.orders;
create policy "Allow authenticated to read orders"
  on public.orders for select to authenticated using (true);

drop policy if exists "Allow authenticated to insert orders" on public.orders;
create policy "Allow authenticated to insert orders"
  on public.orders for insert to authenticated
  with check (public.work_shift_write_allowed());

drop policy if exists "Allow authenticated to update orders" on public.orders;
create policy "Allow authenticated to update orders"
  on public.orders for update to authenticated
  using (public.work_shift_write_allowed())
  with check (public.work_shift_write_allowed());

drop policy if exists "Allow authenticated to delete orders" on public.orders;
create policy "Allow authenticated to delete orders"
  on public.orders for delete to authenticated
  using (public.work_shift_write_allowed());

-- ---------------------------------------------------------------------
-- 3. clients / devices: открытые «public» политики (включая anon)
--    заменены на authenticated + shift guard.
-- ---------------------------------------------------------------------
drop policy if exists "Allow public access to clients" on public.clients;
drop policy if exists "Allow authenticated to read clients" on public.clients;
create policy "Allow authenticated to read clients"
  on public.clients for select to authenticated using (true);
create policy "Allow authenticated to insert clients"
  on public.clients for insert to authenticated
  with check (public.work_shift_write_allowed());
create policy "Allow authenticated to update clients"
  on public.clients for update to authenticated
  using (public.work_shift_write_allowed())
  with check (public.work_shift_write_allowed());
create policy "Allow authenticated to delete clients"
  on public.clients for delete to authenticated
  using (public.work_shift_write_allowed());

drop policy if exists "Allow public access to devices" on public.devices;
drop policy if exists "Allow authenticated to read devices" on public.devices;
create policy "Allow authenticated to read devices"
  on public.devices for select to authenticated using (true);
create policy "Allow authenticated to insert devices"
  on public.devices for insert to authenticated
  with check (public.work_shift_write_allowed());
create policy "Allow authenticated to update devices"
  on public.devices for update to authenticated
  using (public.work_shift_write_allowed())
  with check (public.work_shift_write_allowed());
create policy "Allow authenticated to delete devices"
  on public.devices for delete to authenticated
  using (public.work_shift_write_allowed());

-- ---------------------------------------------------------------------
-- 4. order_services: политика «manage for all using (true)» заменена
--    на write-политики со shift guard (чтение сохранено).
-- ---------------------------------------------------------------------
drop policy if exists "Allow authenticated to manage order services"
  on public.order_services;
create policy "Allow authenticated to insert order services"
  on public.order_services for insert to authenticated
  with check (public.work_shift_write_allowed());
create policy "Allow authenticated to update order services"
  on public.order_services for update to authenticated
  using (public.work_shift_write_allowed())
  with check (public.work_shift_write_allowed());
create policy "Allow authenticated to delete order services"
  on public.order_services for delete to authenticated
  using (public.work_shift_write_allowed());

-- ---------------------------------------------------------------------
-- 5. order_status_history: insert-политика получает shift guard
--    (события логируются фронтендом; RPC close_order вставляет через
--    security definer и guard'ом RLS не ограничен).
-- ---------------------------------------------------------------------
drop policy if exists "Allow authenticated to insert order status history"
  on public.order_status_history;
create policy "Allow authenticated to insert order status history"
  on public.order_status_history
  for insert
  to authenticated
  with check (public.work_shift_write_allowed());

-- ---------------------------------------------------------------------
-- 6. tasks: к существующему has_permission('tasks.manage') добавлен
--    shift guard (manager имеет tasks.manage по сиду RBAC).
-- ---------------------------------------------------------------------
drop policy if exists "Allow task managers to write tasks" on public.tasks;
create policy "Allow task managers to write tasks"
  on public.tasks for all to authenticated
  using (
    public.has_permission('tasks.manage')
    and public.work_shift_write_allowed()
  )
  with check (
    public.has_permission('tasks.manage')
    and public.work_shift_write_allowed()
  );

-- ---------------------------------------------------------------------
-- 7. RPC close_order: серверный shift guard для manager добавлен
--    ДО любых изменений. Защита от двойной оплаты, расчёт остатка и
--    проверка статуса «Готово к выдаче» сохранены. Admin закрывает
--    без смены. RLS на payments/order_status_history внутри
--    security definer не применяется (как и раньше).
-- ---------------------------------------------------------------------
drop function if exists public.close_order(uuid, numeric, uuid, text);

create or replace function public.close_order(
  p_order_id         uuid,
  p_cash_register_id uuid,
  p_amount           numeric,
  p_payment_method   text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order        public.orders;
  v_profile_id   uuid;
  v_payment_id   uuid;
  v_already_paid numeric(12, 2);
  v_price        numeric(12, 2);
  v_remaining    numeric(12, 2);
begin
  if auth.uid() is null then
    raise exception 'Требуется авторизация' using errcode = '42501';
  end if;

  -- SERVER-SIDE SHIFT GUARD: manager закрывает заказ только в открытую
  -- смену и в рабочее время [11:00, 17:30) Europe/Minsk. Admin — без
  -- смены. Проверка до любых изменений (атомарность сохраняется).
  if public.current_role_code() = 'manager'
     and not public.can_perform_work_operation() then
    raise exception 'Заказ можно закрыть только в открытую смену в рабочее время 11:00–17:30 (Europe/Minsk)'
      using errcode = '42501';
  end if;

  -- 1. Валидация аргументов.
  if p_payment_method not in ('cash', 'card', 'transfer') then
    raise exception 'Недопустимый способ оплаты: %', p_payment_method
      using errcode = '22023';
  end if;

  if p_amount is null or p_amount <= 0 then
    raise exception 'Сумма оплаты должна быть больше нуля'
      using errcode = '22023';
  end if;

  if not exists (
    select 1 from public.cash_registers where id = p_cash_register_id
  ) then
    raise exception 'Касса не найдена'
      using errcode = '22023';
  end if;

  -- 2. Заказ должен существовать и быть готов к выдаче.
  select *
    into v_order
    from public.orders
    where id = p_order_id;

  if not found then
    raise exception 'Заказ не найден'
      using errcode = '22023';
  end if;

  if v_order.status is distinct from 'Готово к выдаче' then
    raise exception 'Заказ можно закрыть только в статусе «Готово к выдаче» (текущий: %)', v_order.status
      using errcode = '22023';
  end if;

  -- 3. Защита от двойной оплаты: сколько уже оплачено по заказу
  --    (income-платежи, включая проведённые ранее вручную).
  select coalesce(sum(p.amount), 0)
    into v_already_paid
    from public.payments p
    where p.order_id = p_order_id
      and p.type = 'income';

  v_price     := coalesce(v_order.price, 0);
  v_remaining := v_price - v_already_paid;

  -- Заказ уже полностью оплачен: новый платёж не создаём.
  if v_remaining <= 0 then
    raise exception 'Заказ уже полностью оплачен (итоговая стоимость %, оплачено %). Повторная оплата не требуется',
      v_price, v_already_paid
      using errcode = '22023';
  end if;

  -- Сумма закрывающего платежа — ровно остаток: меньше и больше нельзя.
  if p_amount is null or p_amount <> v_remaining then
    raise exception 'Сумма оплаты должна быть ровно равна остатку к оплате: % (итоговая стоимость %, уже оплачено %)',
      v_remaining, v_price, v_already_paid
      using errcode = '22023';
  end if;

  v_profile_id := auth.uid();

  -- 4. Income-платёж, привязанный к заказу. Баланс кассы увеличивает
  --    существующий триггер trg_payments_update_cash_register (AFTER INSERT).
  insert into public.payments (
    cash_register_id, order_id, client_id, type, amount,
    payment_method, comment, created_by
  ) values (
    p_cash_register_id,
    v_order.id,
    v_order.client_id,
    'income',
    p_amount,
    p_payment_method,
    'Оплата и закрытие заказа ' || v_order.order_number,
    v_profile_id
  )
  returning id into v_payment_id;

  -- 5. Закрытие заказа: статус + момент закрытия.
  update public.orders
    set status    = 'Закрыт',
        closed_at = now()
    where id = p_order_id;

  -- 6. Событие в хронологии заказа.
  insert into public.order_status_history (
    order_id, status, title, comment, created_by
  ) values (
    p_order_id,
    'closed',
    'Заказ закрыт',
    'Оплачено ' || to_char(p_amount, 'FM999999990.00') || ' (' || p_payment_method || ')',
    v_profile_id
  );

  return v_payment_id;
end;
$$;

grant execute on function public.close_order(uuid, numeric, uuid, text) to authenticated;
revoke execute on function public.close_order(uuid, numeric, uuid, text) from anon;
