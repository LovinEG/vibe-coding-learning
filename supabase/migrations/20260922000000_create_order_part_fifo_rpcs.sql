-- =====================================================================
-- Миграция: 20260922000000_create_order_part_fifo_rpcs.sql
-- Stage 4 / Phase 4B: атомарное FIFO-списание детали на заказ и
-- soft-возврат детали из заказа.
--
-- Создаются две RPC (единая DB-транзакция вместо цепочки неатомарных
-- INSERT/UPDATE из фронтенда):
--   1) public.use_part_on_order(order_id, part_id, quantity, markup)
--      — списание детали на заказ: FIFO по stock_batches, точная
--        себестоимость, движение 'expense' на КАЖДУЮ затронутую партию,
--        снимок COGS в order_parts, инкремент orders.price, события
--        таймлайна part_added;
--   2) public.return_part_from_order(order_part_id)
--      — soft-возврат: возврат ровно тех партий/количеств, что были
--        списаны, движения 'return', снятие суммы с orders.price,
--        returned_at/returned_by (позиция НЕ удаляется), событие
--        таймлайна part_removed.
--
-- МОДЕЛЬ FIFO (ключевое отличие от прежнего поведения):
--   * доступность партии считается из журнала:
--       net_out(batch) = Σ expense + Σ defect - Σ return   (income НЕ
--       участвует: income — это сам факт создания партии, он не расход);
--       available(batch) = greatest(0, least(batch.quantity,
--                                          batch.quantity - net_out));
--   * порядок списания: batch.created_at asc nulls first, batch.id asc
--     (детерминированный тай-брейк при одинаковых таймстампах);
--   * FIFO работает только через stock_batches; остатка без партии не
--     существует. Если партий недостаточно — ошибка недостаточного
--     остатка (22023);
--   * Σ сегментов точно равна запрошенному количеству (проверяется
--     ассертом — списание не может «потерять» или «создать» остаток).
--
-- МОДЕЛЬ ДЕНЕГ (без округления на итог):
--   * purchase_cost_total = Σ(qty_i × purchase_price_i) — точная COGS;
--   * purchase_price      = round(purchase_cost_total / quantity, 2) —
--     производное взвешенное среднее ТОЛЬКО для legacy/UI;
--   * client_price        = round(purchase_price + markup, 2) — цена
--     единицы для UI;
--   * price_at_time = client_price (обратная совместимость);
--   * orders.price += purchase_cost_total + markup * quantity
--     (ТОЧНАЯ сумма, а НЕ client_price * quantity);
--   * возврат делает orders.price -= (purchase_cost_total + markup*quantity)
--     по сохранённому снимку позиции — цена восстанавливается ровно.
--
-- ЗАЩИТА ОТ OVERSELL И ГОНОК:
--   * порядок блокировок одинаков в обеих RPC:
--       orders → order_parts → parts → stock_batches;
--   * parts ... for update сериализует всех писателей склада по одной
--     запчасти (и списание, и возврат);
--   * доступность считается ПОСЛЕ взятия блокировки, внутри транзакции;
--   * повторный возврат невозможен: order_parts.returned_at проверяется
--     под блокировкой строки позиции (второй параллельный вызов видит
--     уже проставленный returned_at и падает 22023).
--
--   ВНИМАНИЕ (locking protocol gap): receive_stock_batch (Phase 3) пока
--   НЕ берёт parts FOR UPDATE перед созданием партии. До отдельной
--   следующей миграции, которая добавит ту же блокировку в
--   receive_stock_batch, приход и списание одной запчасти могут
--   конкурентно расходиться по остатку. Phase 4B эту миграцию не
--   затрагивает (Phase 3 уже в production) — требуется отдельный шаг.
--
-- РОЛИ И ПРАВА: используются как есть — authenticated + inventory.manage
-- (has_permission), плюс shift-guard для manager (can_perform_work_operation),
-- как в close_order / receive_stock_batch. RLS и политики НЕ меняются:
-- функции security definer с явной проверкой права.
--
-- ЧТО НЕ МЕНЯЕТСЯ:
--   * RLS/policies, finance-страницы, UI, timeline-схема;
--   * VIEW public.v_part_stock (формула списания ей соответствует);
--   * public.receive_stock_batch (но см. примечание о locking protocol
--     выше — потребуется отдельная миграция для parts FOR UPDATE);
--   * migration 20260921000000_add_order_parts_fifo_snapshot_and_soft_return
--     (уже применена в production и не переписывается);
--   * frontend (Phase 4C).
--
-- Идемпотентность: drop function if exists + create or replace +
-- повторяемые revoke/grant. Применение: Supabase SQL Editor
-- (или supabase db push).
-- =====================================================================

-- ---------------------------------------------------------------------
-- 0. Идемпотентность: пересоздаём функции при повторном применении.
-- ---------------------------------------------------------------------
drop function if exists public.use_part_on_order(uuid, uuid, integer, numeric);
drop function if exists public.return_part_from_order(uuid);

-- ---------------------------------------------------------------------
-- 1. use_part_on_order — атомарное FIFO-списание детали на заказ.
-- ---------------------------------------------------------------------
create or replace function public.use_part_on_order(
  p_order_id  uuid,
  p_part_id   uuid,
  p_quantity  integer,
  p_markup    numeric
)
returns public.order_parts
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile_id   uuid       := auth.uid();
  v_order        public.orders;
  v_part         public.parts;
  v_seg          record;
  v_remaining    integer    := p_quantity;
  v_take         integer;
  v_cost_total   numeric    := 0;
  v_pp_snapshot  numeric(10, 2);
  v_client_total numeric;
  v_cp_snapshot  numeric(10, 2);
  v_op           public.order_parts;
begin
  -- 1. Авторизация: только авторизованные пользователи CRM.
  if v_profile_id is null then
    raise exception 'Требуется авторизация'
      using errcode = '42501';
  end if;

  -- 2. Право: управление складом (has_permission учитывает admin-обход).
  if not public.has_permission('inventory.manage') then
    raise exception 'Недостаточно прав: требуется inventory.manage'
      using errcode = '42501';
  end if;

  -- 3. Shift-guard: manager — только в открытую смену и в рабочее окно.
  if public.current_role_code() = 'manager'
     and not public.can_perform_work_operation() then
    raise exception 'Операции со складом доступны менеджеру только в открытую смену в рабочее время 11:00–17:30 (Europe/Minsk)'
      using errcode = '42501';
  end if;

  -- 4. Валидация аргументов.
  if p_quantity is null or p_quantity <= 0 then
    raise exception 'Количество должно быть целым числом больше нуля'
      using errcode = '22023';
  end if;

  if p_markup is null or p_markup < 0 or p_markup <> p_markup then
    raise exception 'Наценка должна быть неотрицательным числом'
      using errcode = '22023';
  end if;

  -- 5. Блокировка заказа и проверка терминального статуса.
  select * into v_order from public.orders where id = p_order_id for update;

  if not found then
    raise exception 'Заказ не найден'
      using errcode = '22023';
  end if;

  if v_order.status in ('Закрыт', 'Отменён', 'Выдан') then
    raise exception 'Нельзя добавить деталь в заказ со статусом «%»', v_order.status
      using errcode = '22023';
  end if;

  -- 6. Блокировка запчасти — КЛЮЧЕВОЙ момент защиты от oversell.
  --    SELECT ... FOR UPDATE на parts сериализует всех писателей склада
  --    по данной запчасти. Это НЕ FOR UPDATE поверх агрегата —
  --    блокируется родительская строка parts, а не результат SUM.
  select * into v_part from public.parts where id = p_part_id for update;

  if not found then
    raise exception 'Запчасть не найдена'
      using errcode = '22023';
  end if;

  -- 7. FIFO-аллокация по партиям.
  --    Доступность партии считается из журнала по её batch_id:
  --      net_out = Σ expense + Σ defect − Σ return   (income = 0);
  --      available = greatest(0, batch.quantity − net_out).
  --    Порядок: created_at asc nulls first, id asc (детерминизм).
  drop table if exists tmp_fifo_segments;
  create temp table tmp_fifo_segments (
    batch_id       uuid,
    supplier_id    uuid,
    purchase_price numeric(10, 2),
    segment_qty    integer
  ) on commit drop;

  for v_seg in
    select
      b.id            as batch_id,
      b.purchase_price,
      b.supplier_id,
      greatest(
        0,
        b.quantity - coalesce((
          select sum(
            case m.movement_type
              when 'expense' then  m.quantity
              when 'defect'  then  m.quantity
              when 'return'  then -m.quantity
              else 0
            end
          )
          from public.stock_movements m
          where m.batch_id = b.id
        ), 0)
      ) as avail
    from public.stock_batches b
    where b.part_id = p_part_id
    order by b.created_at asc nulls first, b.id asc
  loop
    exit when v_remaining <= 0;
    if v_seg.avail <= 0 then
      continue;
    end if;

    v_take := least(v_seg.avail, v_remaining);

    -- Если у реально используемого сегмента нет закупочной цены — отказ.
    if v_seg.purchase_price is null then
      raise exception
        'У партии % отсутствует закупочная цена — невозможно определить себестоимость. Укажите закупочную цену партии и повторите списание.',
        v_seg.batch_id
        using errcode = '22023';
    end if;

    insert into tmp_fifo_segments
      (batch_id, supplier_id, purchase_price, segment_qty)
    values
      (v_seg.batch_id, v_seg.supplier_id, v_seg.purchase_price, v_take);

    v_cost_total := v_cost_total + (v_take * v_seg.purchase_price);
    v_remaining  := v_remaining - v_take;
  end loop;

  -- 8. Проверка: запрос полностью покрыт остатками (без oversell).
  if v_remaining > 0 then
    raise exception
      'Недостаточно остатка на складе: запрошено %, доступно %',
      p_quantity, (p_quantity - v_remaining)
      using errcode = '22023';
  end if;

  -- 9. Снимок COGS и денег (точный итог, без округления на сумму заказа).
  v_pp_snapshot  := round(v_cost_total / p_quantity, 2);
  v_client_total := v_cost_total + (p_markup * p_quantity);
  v_cp_snapshot  := round(v_client_total / p_quantity, 2);

  -- 10. Создание позиции заказа (одна строка на весь quantity).
  insert into public.order_parts (
    order_id, part_id, quantity,
    price_at_time, purchase_price, markup, client_price,
    master_id, added_by,
    purchase_cost_total
  ) values (
    p_order_id, p_part_id, p_quantity,
    v_cp_snapshot, v_pp_snapshot, p_markup, v_cp_snapshot,
    v_profile_id, v_profile_id,
    v_cost_total
  )
  returning * into v_op;

  -- 11. Движения 'expense' — по одному на каждый FIFO-сегмент.
  --     order_part_id сохраняется навсегда (soft-return не удаляет строку).
  insert into public.stock_movements (
    movement_type, part_id, quantity, profile_id,
    order_id, batch_id, supplier_id, purchase_price, order_part_id
  )
  select
    'expense',
    p_part_id,
    segment_qty,
    v_profile_id,
    p_order_id,
    batch_id,
    supplier_id,
    purchase_price,
    v_op.id
  from tmp_fifo_segments;

  -- 12. Инкремент orders.price ровно на client_total.
  --     client_total = purchase_cost_total + markup × quantity >= 0,
  --     поэтому greatest не нужен — точное сложение с заблокированным
  --     значением v_order.price.
  update public.orders
    set price = coalesce(v_order.price, 0) + v_client_total
    where id = p_order_id;

  -- 13. Событие таймлайна part_added (order_events) в той же транзакции.
  --     Подтранзакция: сбой журналирования не откатывает списание.
  begin
    insert into public.order_events (
      order_id, type, message, author_id, metadata
    ) values (
      p_order_id,
      'part_added',
      'Добавлена деталь: ' || v_part.name || ', ' || p_quantity || ' шт.',
      v_profile_id,
      jsonb_build_object(
        'part_id', p_part_id,
        'name', v_part.name,
        'quantity', p_quantity,
        'order_part_id', v_op.id
      )
    );
  exception
    when others then
      raise warning 'use_part_on_order: событие таймлайна не записано (order_id=%): %',
        p_order_id, sqlerrm;
  end;

  return v_op;
end;
$$;

comment on function public.use_part_on_order(uuid, uuid, integer, numeric) is
  'Атомарное FIFO-списание детали на заказ: блокировка parts, FIFO по stock_batches, точный COGS в order_parts.purchase_cost_total, expense-движения на каждую партию, инкремент orders.price на точный client_total, событие part_added. Требует authenticated и inventory.manage.';

-- ---------------------------------------------------------------------
-- 2. return_part_from_order — атомарный soft-возврат детали из заказа.
-- ---------------------------------------------------------------------
create or replace function public.return_part_from_order(
  p_order_part_id uuid
)
returns public.order_parts
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile_id  uuid    := auth.uid();
  v_op          public.order_parts;
  v_order       public.orders;
  v_part        public.parts;
  v_refund      numeric;
  v_expense_sum integer;
begin
  -- 1. Авторизация.
  if v_profile_id is null then
    raise exception 'Требуется авторизация'
      using errcode = '42501';
  end if;

  -- 2. Право: управление складом.
  if not public.has_permission('inventory.manage') then
    raise exception 'Недостаточно прав: требуется inventory.manage'
      using errcode = '42501';
  end if;

  -- 3. Shift-guard.
  if public.current_role_code() = 'manager'
     and not public.can_perform_work_operation() then
    raise exception 'Операции со складом доступны менеджеру только в открытую смену в рабочее время 11:00–17:30 (Europe/Minsk)'
      using errcode = '42501';
  end if;

  -- 4. Блокировка позиции заказа (защита от двойного возврата).
  --    FOR UPDATE на order_parts: второй параллельный вызов видит
  --    уже проставленный returned_at и падает.
  select * into v_op from public.order_parts where id = p_order_part_id for update;

  if not found then
    raise exception 'Позиция заказа не найдена'
      using errcode = '22023';
  end if;

  if v_op.returned_at is not null then
    raise exception 'Деталь уже возвращена на склад (%) — повторный возврат невозможен', v_op.returned_at
      using errcode = '22023';
  end if;

  -- 5. Блокировка заказа и проверка терминального статуса.
  select * into v_order from public.orders where id = v_op.order_id for update;

  if not found then
    raise exception 'Заказ не найден'
      using errcode = '22023';
  end if;

  if v_order.status in ('Закрыт', 'Отменён', 'Выдан') then
    raise exception 'Нельзя вернуть деталь из заказа со статусом «%»', v_order.status
      using errcode = '22023';
  end if;

  -- 6. Блокировка запчасти — та же точка сериализации, что и в
  --    use_part_on_order. Возврат и списание одной запчасти не могут
  --    идти одновременно: кто первым взял parts FOR UPDATE, тот и работает.
  select * into v_part from public.parts where id = v_op.part_id for update;

  if not found then
    raise exception 'Запчасть не найдена'
      using errcode = '22023';
  end if;

  -- 7. Проверка консистентности позиции перед любыми INSERT/UPDATE.
  --    Автоматический возврат поддерживается только для позиций,
  --    созданных FIFO-RPC: с точной себестоимостью, наценкой и полным
  --    набором expense-движений по партиям с batch_id и purchase_price.
  --    Legacy/неконсистентные позиции не поддерживают возврат — raise.
  if v_op.purchase_cost_total is null or v_op.markup is null then
    raise exception
      'Позиция не поддерживает автоматический возврат: отсутствует точная себестоимость или наценка (legacy/неконсистентная позиция)'
      using errcode = '22023';
  end if;

  select coalesce(sum(m.quantity), 0)
    into v_expense_sum
    from public.stock_movements m
    where m.order_part_id = p_order_part_id
      and m.movement_type = 'expense';

  if v_expense_sum = 0 then
    raise exception
      'Позиция не поддерживает автоматический возврат: нет исходных expense-движений (legacy/неконсистентная позиция)'
      using errcode = '22023';
  end if;

  if v_expense_sum <> v_op.quantity then
    raise exception
      'Позиция не поддерживает автоматический возврат: сумма quantity expense-движений (%) не равна количеству позиции % (legacy/неконсистентная позиция)',
      v_expense_sum, v_op.quantity
      using errcode = '22023';
  end if;

  if exists (
    select 1
    from public.stock_movements m
    where m.order_part_id = p_order_part_id
      and m.movement_type = 'expense'
      and (m.batch_id is null or m.purchase_price is null)
  ) then
    raise exception
      'Позиция не поддерживает автоматический возврат: у исходных expense-движений отсутствует batch_id или purchase_price (legacy/неконсистентная позиция)'
      using errcode = '22023';
  end if;

  -- 8. Зеркальные return-движения для каждого исходного expense.
  --    Сохраняются part_id, quantity, batch_id, supplier_id,
  --    purchase_price, order_id, order_part_id — возврат идёт ровно
  --    в те же партии, что были списаны, в тех же количествах.
  insert into public.stock_movements (
    movement_type, part_id, quantity, profile_id,
    order_id, batch_id, supplier_id, purchase_price, order_part_id
  )
  select
    'return',
    m.part_id,
    m.quantity,
    v_profile_id,
    m.order_id,
    m.batch_id,
    m.supplier_id,
    m.purchase_price,
    m.order_part_id
  from public.stock_movements m
  where m.order_part_id = p_order_part_id
    and m.movement_type = 'expense';

  -- 9. Soft-return: пометка позиции (БЕЗ удаления).
  update public.order_parts
    set returned_at = now(),
        returned_by = v_profile_id
    where id = p_order_part_id
    returning * into v_op;

  -- 10. Уменьшение orders.price на точную сумму позиции.
  --     purchase_cost_total и markup проверены NOT NULL на шаге 7,
  --     coalesce не нужен. v_order.price заблокирован FOR UPDATE;
  --     если он меньше возвращаемой суммы — raise (без greatest).
  v_refund := v_op.purchase_cost_total + (v_op.markup * v_op.quantity);

  if v_order.price is null or v_order.price < v_refund then
    raise exception
      'Итоговая стоимость заказа (%) меньше возвращаемой суммы (%) — возврат невозможен',
      v_order.price, v_refund
      using errcode = '22023';
  end if;

  update public.orders
    set price = v_order.price - v_refund
    where id = v_op.order_id;

  -- 11. Событие таймлайна part_removed в той же транзакции.
  begin
    insert into public.order_events (
      order_id, type, message, author_id, metadata
    ) values (
      v_op.order_id,
      'part_removed',
      'Возвращена деталь: ' || v_part.name || ', ' || v_op.quantity || ' шт.',
      v_profile_id,
      jsonb_build_object(
        'part_id', v_op.part_id,
        'name', v_part.name,
        'quantity', v_op.quantity,
        'order_part_id', v_op.id
      )
    );
  exception
    when others then
      raise warning 'return_part_from_order: событие таймлайна не записано (order_part_id=%): %',
        p_order_part_id, sqlerrm;
  end;

  return v_op;
end;
$$;

comment on function public.return_part_from_order(uuid) is
  'Атомарный soft-возврат детали из заказа: зеркальные return-движения в те же партии, returned_at/returned_by (без удаления order_parts), уменьшение orders.price на точную сумму, событие part_removed. Защита от двойного возврата по returned_at. Требует authenticated и inventory.manage.';

-- ---------------------------------------------------------------------
-- 3. Права: только authenticated, PUBLIC и anon лишаются EXECUTE.
-- ---------------------------------------------------------------------
revoke all on function public.use_part_on_order(uuid, uuid, integer, numeric) from public;
revoke all on function public.use_part_on_order(uuid, uuid, integer, numeric) from anon;
grant execute on function public.use_part_on_order(uuid, uuid, integer, numeric) to authenticated;

revoke all on function public.return_part_from_order(uuid) from public;
revoke all on function public.return_part_from_order(uuid) from anon;
grant execute on function public.return_part_from_order(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- 4. PostgREST: сброс кэша схемы.
-- ---------------------------------------------------------------------
notify pgrst, 'reload schema';

-- ---------------------------------------------------------------------
-- Проверка после применения (выполнить вручную в SQL Editor):
--
--   -- 1) Функции существуют и security definer:
--   select proname, prokind, prosecdef
--   from pg_proc
--   where proname in ('use_part_on_order', 'return_part_from_order');
--
--   -- 2) Права: только authenticated имеет EXECUTE.
--   select proacl
--   from pg_proc
--   where proname in ('use_part_on_order', 'return_part_from_order');
--
--   -- 3) Тест списания (замените UUID на реальные):
--   --   select * from public.use_part_on_order(
--   --     '<order-uuid>', '<part-uuid>', 3, 5.00
--   --   );
--   --   -- Проверить: order_parts.purchase_cost_total, stock_movements
--   --   -- (несколько expense с разными batch_id), orders.price.
--   --
--   -- 4) Тест возврата:
--   --   select * from public.return_part_from_order('<order_part-uuid>');
--   --   -- Проверить: returned_at not null, stock_movements return,
--   --   --            orders.price уменьшен, order_parts строка на месте.
--   --
--   -- 5) Двойной возврат:
--   --   select * from public.return_part_from_order('<тот же uuid>');
--   --   -- Ожидание: 22023 «Деталь уже возвращена».
--   --
--   -- 6) Oversell: запросить больше остатка — ожидание 22023.
--   --
--   -- 7) Терминальный статус: добавить деталь в «Закрыт» — 22023.
-- ---------------------------------------------------------------------