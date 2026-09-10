-- =====================================================================
-- Миграция: 20260907000005_harden_close_order_rpc.sql
-- Описание: защита от двойной оплаты заказа в RPC close_order:
--           1) считается сумма уже существующих income-платежей по
--              order_id (already_paid);
--           2) остаток к оплате = orders.price - already_paid;
--           3) остаток <= 0 — платёж не создаётся, ошибка (заказ уже
--              оплачен);
--           4) сумма закрывающего платежа должна быть ровно равна
--              остатку (меньше и больше нельзя).
--           Проверка статуса «Готово к выдаче» и атомарность сохранены.
-- Применение: Supabase SQL Editor (или supabase db push).
-- =====================================================================

-- Идемпотентность: пересоздаём функцию при повторном применении.
drop function if exists public.close_order(uuid, uuid, numeric, text);

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

-- Вызов — только авторизованным пользователям CRM.
revoke execute on function public.close_order(uuid, uuid, numeric, text) from anon;
grant execute on function public.close_order(uuid, uuid, numeric, text) to authenticated;
