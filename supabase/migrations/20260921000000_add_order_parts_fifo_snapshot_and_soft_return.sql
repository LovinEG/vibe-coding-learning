-- =====================================================================
-- Миграция: 20260921000000_add_order_parts_fifo_snapshot_and_soft_return.sql
-- Stage 4 / Phase 4A: схема для атомарного FIFO-списания и soft-возврата.
--
-- Добавляется ТОЛЬКО структура (RPC и frontend — следующие фазы):
--   1) purchase_cost_total — точная себестоимость позиции заказа:
--      Σ (quantity_i × purchase_price партии_i) по FIFO-аллокациям.
--      order_parts.purchase_price остаётся производным снимком
--      (round(purchase_cost_total / quantity, 2) — взвешенное среднее)
--      исключительно для обратной совместимости UI и финансового отчёта,
--      поэтому итог заказа нельзя считать через округлённый unit-price;
--   2) returned_at / returned_by — soft-return: позиция не удаляется,
--      а помечается возвращённой (момент и автор). Это сохраняет
--      stock_movements.order_part_id навсегда (FK ON DELETE SET NULL
--      больше не «обнуляет» историю движений) и делает повторный возврат
--      невозможным: RPC Phase 4B блокирует возврат по returned_at is not null;
--   3) partial index idx_order_parts_active — быстрые выборки активных
--      (не возвращённых) деталей заказа.
--
-- Что НЕ меняется:
--   * RLS и политики order_parts — новые колонки наследуют существующие
--     политики (чтение — authenticated, запись — inventory.manage);
--   * order_parts.purchase_price / markup / client_price / price_at_time —
--     типы и значения не затрагиваются;
--   * stock_movements, stock_batches, v_part_stock, receive_stock_batch —
--     не затрагиваются;
--   * RPC use_part_on_order / return_part_from_order — Phase 4B;
--   * frontend, finance, timeline — Phase 4C.
--
-- Идемпотентность: add column if not exists, create index if not exists,
-- DO-блок для FK и безопасный backfill (при повторном прогоне строк
-- с purchase_cost_total is null и purchase_price is not null и markup
-- is not null уже нет → UPDATE затрагивает 0 строк).
-- Применение: Supabase SQL Editor (или supabase db push).
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Колонки: снимок себестоимости и soft-return.
-- ---------------------------------------------------------------------
alter table public.order_parts
  add column if not exists purchase_cost_total numeric(12, 2),
  add column if not exists returned_at         timestamptz,
  add column if not exists returned_by         uuid;

-- FK returned_by → profiles(id) отдельным DO-блоком: ADD COLUMN IF NOT
-- EXISTS пропускает уже существующую колонку целиком, поэтому наличие
-- ограничения гарантируем по имени (идемпотентный повторный прогон).
do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'order_parts_returned_by_fkey'
      and conrelid = 'public.order_parts'::regclass
  ) then
    alter table public.order_parts
      add constraint order_parts_returned_by_fkey
      foreign key (returned_by) references public.profiles (id) on delete set null;
  end if;
end $$;
-- ---------------------------------------------------------------------
-- 2. Комментарии колонок.
-- ---------------------------------------------------------------------
comment on column public.order_parts.purchase_cost_total is
  'Точная себестоимость позиции: Σ (quantity × purchase_price партии) по FIFO-аллокациям (stock_movements). Источник истины для COGS; purchase_price — производное взвешенное среднее для legacy/UI.';

comment on column public.order_parts.returned_at is
  'Момент soft-возврата детали из заказа (stock_movements: return в те же партии). NULL — деталь активна; not null блокирует повторный возврат и исключает позицию из активных выборок.';

comment on column public.order_parts.returned_by is
  'Кто выполнил soft-возврат детали (profiles.id, auth.uid() из RPC). NULL — деталь активна либо автор не определён (legacy).';

-- ---------------------------------------------------------------------
-- 3. Legacy-backfill точной себестоимости.
--    До Phase 4B у строк нет FIFO-аллокаций, но есть ручная закупка
--    за единицу и наценка: purchase_price × quantity — точная и
--    единственная доступная себестоимость этих позиций.
--    Строки без purchase_price (legacy «розничная цена», unknownCount
--    в финансовом отчёте) намеренно остаются NULL.
-- ---------------------------------------------------------------------
update public.order_parts
set purchase_cost_total = round(purchase_price * quantity, 2)
where purchase_cost_total is null
  and purchase_price is not null
  and markup is not null;

-- ---------------------------------------------------------------------
-- 4. Partial index активных деталей заказа.
--    Дополняет существующий idx_order_parts_order_id (20240101000200):
--    он обслуживает все выборки, новый — только активные.
-- ---------------------------------------------------------------------
create index if not exists idx_order_parts_active
  on public.order_parts (order_id)
  where returned_at is null;
-- ---------------------------------------------------------------------
-- Проверка после применения (выполнить вручную в SQL Editor):
--
--   -- 1) Колонки и типы:
--   select column_name, data_type, numeric_precision, numeric_scale,
--          is_nullable, column_default
--   from information_schema.columns
--   where table_schema = 'public' and table_name = 'order_parts'
--   order by ordinal_position;
--
--   -- 2) FK на profiles:
--   select conname, pg_get_constraintdef(oid)
--   from pg_constraint
--   where conname = 'order_parts_returned_by_fkey';
--
--   -- 3) Partial index:
--   select indexname, indexdef
--   from pg_indexes
--   where schemaname = 'public' and tablename = 'order_parts';
--
--   -- 4) Backfill: сколько строк получили себестоимость и сколько
--   --    legacy-строк осталось без неё (ожидаемо — только без purchase_price):
--   select count(*) filter (where purchase_cost_total is not null) as with_cost,
--          count(*) filter (where purchase_cost_total is null)     as without_cost
--   from public.order_parts;
--
--   -- 5) RLS не изменился (2 политики: read для authenticated,
--   --    write для inventory.manage):
--   select polname, polcmd
--   from pg_policy
--   where polrelid = 'public.order_parts'::regclass;
-- ---------------------------------------------------------------------