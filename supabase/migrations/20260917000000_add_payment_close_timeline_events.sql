-- =====================================================================
-- Миграция: 20260917000000_add_payment_close_timeline_events.sql
-- Stage 3 (продолжение): таймлайн заказа получает события оплаты и
-- закрытия заказа.
--
-- Что делает: RPC public.close_order (актуальная версия из
--   20260907000007_enforce_manager_shift_guard.sql) пересоздаётся с той же
--   бизнес-логикой и в конце, В ТОЙ ЖЕ ТРАНЗАКЦИИ, пишет два события в
--   public.order_events:
--     * payment_added — «Оплата: <сумма> BYN (<способ>)»,
--       metadata: { payment_id, amount, method };
--     * order_closed  — «Заказ закрыт»,
--       metadata: { payment_id, amount, method, total_amount }.
--
-- Почему в RPC, а не на фронтенде: закрытие заказа и создание
--   income-платежа — одна атомарная RPC-операция (там же меняется статус,
--   closed_at и легаси-история). Отдельные frontend INSERT после RPC могли
--   бы потеряться (закрытая модалка, обрыв сети) и рассинхронизировать
--   таймлайн с фактом оплаты, поэтому события пишутся в том же
--   DB-транзакционном контексте, что платёж и закрытие.
--
-- Дубли с order_status_history: RPC по-прежнему пишет легаси-строку
--   'closed' (нужна легаси-UI и отчётам). Фронтенд собирает единую ленту
--   (getOrderEvents → mergeWithLegacyHistory) и схлопывает легаси 'closed'
--   с order_events.order_closed по каноническому типу в окне 5 секунд —
--   в интерфейсе запись одна. Дубликатов нет, изменения UI не требуются.
--
-- RLS: расширение политик НЕ нужно. close_order — security definer
--   (владелец таблицы, RLS не применяется), поэтому INSERT в order_events
--   разрешён без правки политики. Публичная INSERT-политика order_events
--   намеренно НЕ расширяется: payment_added / order_closed пишет только
--   серверная RPC, подделать событие из браузера нельзя. Оба типа уже
--   разрешены constraint-ом order_events_type_check из
--   20260915000000_create_order_events.sql — ALTER не нужен.
--
-- Атомарность: все проверки (auth, shift guard, статус, остаток к оплате)
--   выполняются ДО любых изменений, порядок операций прежний.
--   Журналирование таймлайна обёрнуто в подтранзакцию с перехватом
--   ошибки: сбой записи события не откатывает платёж и закрытие
--   (атомарность RPC сохраняется), проблема уходит в WARNING.
--
-- Finance/business logic не меняется: касса, сумма, способ оплаты,
--   статус, closed_at и легаси-история — как были.
--
-- Применение: Supabase SQL Editor (или supabase db push).
-- Идемпотентно: drop function if exists + create or replace.
-- =====================================================================

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
  -- Человекочитаемый способ оплаты для текста события таймлайна
  -- (в metadata уходит машинный код cash/card/transfer, как в payments).
  v_method_label text;
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

  v_method_label := case p_payment_method
    when 'cash'     then 'Наличные'
    when 'card'     then 'Карта'
    when 'transfer' then 'Перевод'
    else p_payment_method
  end;

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

  -- 6. Событие в хронологии заказа (легаси-таблица, как было).
  insert into public.order_status_history (
    order_id, status, title, comment, created_by
  ) values (
    p_order_id,
    'closed',
    'Заказ закрыт',
    'Оплачено ' || to_char(p_amount, 'FM999999990.00') || ' (' || p_payment_method || ')',
    v_profile_id
  );

  -- 7. События таймлайна (order_events, Stage 3) — в ТОЙ ЖЕ транзакции,
  --    что платёж, статус и легаси-история (никаких frontend INSERT после
  --    RPC). Ключи metadata: amount — сумма закрывающего платежа,
  --    total_amount — итоговая сумма оплаты по заказу после закрытия,
  --    method — машинный код способа оплаты (cash/card/transfer).
  --    Подтранзакция с перехватом ошибки: сбой журналирования не должен
  --    откатывать закрытие заказа (и не ломает атомарность RPC) — платёж,
  --    статус и closed_at уже записаны в этой же транзакции.
  begin
    insert into public.order_events (
      order_id, type, message, author_id, metadata
    ) values (
      p_order_id,
      'payment_added',
      'Оплата: ' || to_char(p_amount, 'FM999999990.00') || ' BYN (' || v_method_label || ')',
      v_profile_id,
      jsonb_build_object(
        'payment_id', v_payment_id,
        'amount',     p_amount,
        'method',     p_payment_method
      )
    );

    insert into public.order_events (
      order_id, type, message, author_id, metadata
    ) values (
      p_order_id,
      'order_closed',
      'Заказ закрыт',
      v_profile_id,
      jsonb_build_object(
        'payment_id',   v_payment_id,
        'amount',       p_amount,
        'method',       p_payment_method,
        'total_amount', v_price
      )
    );
  exception
    when others then
      raise warning 'close_order: события таймлайна не записаны (order_id=%, payment_id=%): %',
        p_order_id, v_payment_id, sqlerrm;
  end;

  return v_payment_id;
end;
$$;

grant execute on function public.close_order(uuid, uuid, numeric, text) to authenticated;
revoke execute on function public.close_order(uuid, uuid, numeric, text) from anon;

-- ---------------------------------------------------------------------
-- RLS/policy public.order_events: изменений нет (см. шапку миграции).
--   INSERT выполняет security definer-функция public.close_order, для
--   которой RLS владельца таблицы не применяется. Публичная INSERT-
--   политика из 20260916000000_allow_order_events_technician_and_parts.sql
--   остаётся без типов payment_added / order_closed — из браузера эти
--   события подделать нельзя. Constraint order_events_type_check уже
--   допускает оба типа, поэтому отдельная migration не требуется.
-- ---------------------------------------------------------------------