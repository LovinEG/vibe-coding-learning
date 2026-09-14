-- =====================================================================
-- Миграция: 20260920000000_create_receive_stock_batch_rpc.sql
-- Stage 4 / Phase 3: атомарный приход запчастей на склад.
--
-- RPC public.receive_stock_batch — одна транзакция вместо двух
-- последовательных INSERT из фронтенда (stock_batches → stock_movements):
--   1) проверяется, что пользователь авторизован (auth.uid());
--   2) проверяется право inventory.manage (has_permission);
--   3) валидируются аргументы: quantity > 0, purchase_price >= 0
--      (NULL = цена не указана — колонка nullable, UI оставляет поле пустым);
--   4) вставляется партия поставки (stock_batches) и берётся её id;
--   5) вставляется движение 'income' (stock_movements) с part_id,
--      quantity, profile_id = auth.uid(), batch_id, supplier_id
--      и purchase_price;
--   6) возвращается созданная партия.
--
-- Зачем: прежний двухшаговый flow не был атомарным — если второй INSERT
-- падал, партия оставалась без движения, а остаток склада
-- (VIEW v_part_stock = income + return - expense - defect) не
-- увеличивался. Теперь сервер гарантирует «партия + движение» целиком
-- либо ничего (ошибка в середине откатывает всю транзакцию функции).
--
-- Что НЕ меняется:
--   * parts.stock_quantity — deprecated, не читается и не пишется;
--   * VIEW public.v_part_stock — как есть (остаток растёт сам за счёт
--     нового income-движения);
--   * RLS и политики таблиц — не трогаются (функция security definer
--     с явной проверкой права, как close_order / open_shift);
--   * UI (StockBatchModal) и контракт src/data/stockBatches.js
--     addStockBatch({ partId, supplierId, quantity, purchasePrice });
--   * order_parts / parts / finance / timeline — не затрагиваются.
--
-- Идемпотентность: drop function + create or replace, повторяемые
-- revoke/grant. Применение: Supabase SQL Editor (или supabase db push).
-- =====================================================================

-- Идемпотентность: пересоздаём функцию при повторном применении.
drop function if exists public.receive_stock_batch(uuid, uuid, integer, numeric);

create or replace function public.receive_stock_batch(
  p_part_id        uuid,
  p_supplier_id    uuid,
  p_quantity       integer,
  p_purchase_price numeric
)
returns public.stock_batches
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile_id uuid := auth.uid();
  v_batch      public.stock_batches;
begin
  -- 1. Только авторизованные пользователи CRM.
  if v_profile_id is null then
    raise exception 'Требуется авторизация'
      using errcode = '42501';
  end if;

  -- 2. Управление складом проверяет сервер, а не только UI
  --    (has_permission учитывает admin-обход).
  if not public.has_permission('inventory.manage') then
    raise exception 'Недостаточно прав: требуется inventory.manage'
      using errcode = '42501';
  end if;

  -- 3. Валидация аргументов.
  if p_part_id is null then
    raise exception 'Не указана запчасть'
      using errcode = '22023';
  end if;

  if not exists (
    select 1 from public.parts where id = p_part_id
  ) then
    raise exception 'Запчасть не найдена'
      using errcode = '22023';
  end if;

  if p_quantity is null or p_quantity <= 0 then
    raise exception 'Количество должно быть больше нуля'
      using errcode = '22023';
  end if;

  -- purchase_price: NULL — цена не указана (колонка nullable,
  -- StockBatchModal передаёт null при пустом поле). Если значение есть,
  -- оно не может быть отрицательным. Сравнение p <> p отсекает NaN
  -- (NaN в numeric проходит проверку знака, но ломает расчёты).
  if p_purchase_price is not null
     and (p_purchase_price <> p_purchase_price or p_purchase_price < 0) then
    raise exception 'Закупочная цена не может быть отрицательной'
      using errcode = '22023';
  end if;

  if p_supplier_id is not null
     and not exists (
       select 1 from public.suppliers where id = p_supplier_id
     ) then
    raise exception 'Поставщик не найден'
      using errcode = '22023';
  end if;

  -- 4. Партия поставки.
  insert into public.stock_batches (
    part_id, supplier_id, quantity, purchase_price
  ) values (
    p_part_id, p_supplier_id, p_quantity, p_purchase_price
  )
  returning * into v_batch;

  -- 5. Движение 'income' по этой же партии: остаток v_part_stock
  --    считается из журнала, поэтому связь batch_id обязательна.
  --    profile_id — только auth.uid() (не приходит с клиента).
  insert into public.stock_movements (
    movement_type, part_id, quantity, profile_id,
    batch_id, supplier_id, purchase_price
  ) values (
    'income', p_part_id, p_quantity, v_profile_id,
    v_batch.id, p_supplier_id, p_purchase_price
  );

  -- 6. Возвращаем созданную партию (PostgREST отдаёт её как объект).
  return v_batch;
end;
$$;

comment on function public.receive_stock_batch(uuid, uuid, integer, numeric) is
  'Атомарный приход запчасти: партия stock_batches + движение income в одной транзакции. Требует authenticated и inventory.manage.';

-- Вызов — только авторизованным пользователям CRM.
revoke execute on function public.receive_stock_batch(uuid, uuid, integer, numeric) from anon;
grant execute on function public.receive_stock_batch(uuid, uuid, integer, numeric) to authenticated;

-- ---------------------------------------------------------------------
-- Проверка после применения (выполнить вручную в SQL Editor):
--
--   select * from public.receive_stock_batch(
--     'b0000000-0000-4000-8000-000000000001',  -- part_id
--     'a0000000-0000-4000-8000-000000000001',  -- supplier_id
--     5,                                        -- quantity
--     1234.56                                   -- purchase_price
--   );
--
--   -- Последнее движение связано с созданной партией:
--   select m.id, m.movement_type, m.quantity, m.batch_id, m.supplier_id,
--          m.purchase_price, m.profile_id
--   from public.stock_movements m
--   order by m.created_at desc
--   limit 1;
--
--   select quantity_on_hand from public.v_part_stock
--   where part_id = 'b0000000-0000-4000-8000-000000000001';
-- ---------------------------------------------------------------------

-- ---------------------------------------------------------------------
-- PostgREST: сброс кэша схемы, чтобы .rpc('receive_stock_batch') был
-- доступен сразу после применения миграции.
-- ---------------------------------------------------------------------
notify pgrst, 'reload schema';