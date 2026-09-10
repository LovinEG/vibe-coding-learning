-- =====================================================================
-- Миграция: 20260907000004_create_close_order_rpc.sql
-- Описание: RPC public.close_order — атомарное закрытие заказа:
--           1) проверяется, что заказ в статусе «Готово к выдаче»;
--           2) создаётся income payment, привязанный к order_id
--              (баланс кассы обновляет существующий триггер
--              trg_payments_update_cash_register);
--           3) статус заказа меняется на «Закрыт», пишется closed_at;
--           4) в order_status_history добавляется событие 'closed'.
--           Всё выполняется в одной транзакции. SECURITY DEFINER —
--           чтобы обойти RLS payments (finance.manage) атомарно.
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
  v_order       public.orders;
  v_profile_id  uuid;
  v_payment_id  uuid;
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

  v_profile_id := auth.uid();

  -- 3. Income-платёж, привязанный к заказу. Баланс кассы увеличивает
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

  -- 4. Закрытие заказа: статус + момент закрытия.
  update public.orders
    set status    = 'Закрыт',
        closed_at = now()
    where id = p_order_id;

  -- 5. Событие в хронологии заказа.
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
