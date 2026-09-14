-- =====================================================================
-- Миграция: 20260918000000_normalize_stock_movements_schema.sql
-- Stage 4 / Phase 1: нормализация журнала склада public.stock_movements.
--
-- Аддитивно и идемпотентно:
--   * новые nullable-колонки: order_id, comment, batch_id, supplier_id,
--     purchase_price, order_part_id;
--   * FK на orders / stock_batches / suppliers / order_parts
--     (ON DELETE SET NULL — история движений не теряется при удалении
--     связанного объекта);
--   * индексы под новые связи;
--   * безопасный backfill существующих income-движений (только
--     однозначное сопоставление, остальное остаётся NULL).
--
-- Что НЕ меняется:
--   * movement_type, quantity, profile_id, created_at;
--   * parts, order_parts, stock_batches (структура и данные);
--   * RLS и политики — новые колонки наследуют текущие политики
--     (чтение — authenticated, запись — inventory.manage / admin);
--   * frontend — Phase 1 только готовит схему, генерация движений
--     переключается на RPC в следующих фазах.
--
-- Применение: Supabase SQL Editor (или supabase db push).
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Колонки. Все nullable: существующие движения остаются валидными,
--    связи проставляются только там, где они однозначны.
--    order_id / comment могли быть добавлены ранее миграцией
--    20240101000400_add_stock_movements_meta.sql (на production её
--    результат отсутствовал) — add column if not exists сохраняет
--    идемпотентность. Старые миграции не переписываются.
-- ---------------------------------------------------------------------
alter table public.stock_movements add column if not exists order_id       uuid;
alter table public.stock_movements add column if not exists comment        text;
alter table public.stock_movements add column if not exists batch_id       uuid;
alter table public.stock_movements add column if not exists supplier_id    uuid;
alter table public.stock_movements add column if not exists purchase_price numeric(10, 2);
alter table public.stock_movements add column if not exists order_part_id  uuid;

-- ---------------------------------------------------------------------
-- 2. Внешние ключи. Имена constraint'ов — стандартные для PostgreSQL
--    (<table>_<column>_fkey): та же проверка «if not exists» по conname
--    распознаёт FK, созданный ранее inline-вариантом `references` из
--    legacy-миграции, и повторно его не добавляет.
--    Колонки nullable — старые движения без связей не нарушают FK.
-- ---------------------------------------------------------------------
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'stock_movements_order_id_fkey'
      and conrelid = 'public.stock_movements'::regclass
  ) then
    alter table public.stock_movements
      add constraint stock_movements_order_id_fkey
      foreign key (order_id) references public.orders (id) on delete set null;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'stock_movements_batch_id_fkey'
      and conrelid = 'public.stock_movements'::regclass
  ) then
    alter table public.stock_movements
      add constraint stock_movements_batch_id_fkey
      foreign key (batch_id) references public.stock_batches (id) on delete set null;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'stock_movements_supplier_id_fkey'
      and conrelid = 'public.stock_movements'::regclass
  ) then
    alter table public.stock_movements
      add constraint stock_movements_supplier_id_fkey
      foreign key (supplier_id) references public.suppliers (id) on delete set null;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'stock_movements_order_part_id_fkey'
      and conrelid = 'public.stock_movements'::regclass
  ) then
    alter table public.stock_movements
      add constraint stock_movements_order_part_id_fkey
      foreign key (order_part_id) references public.order_parts (id) on delete set null;
  end if;
end $$;

-- ---------------------------------------------------------------------
-- 3. Индексы под новые связи (idx_stock_movements_order_id мог быть
--    создан ранее — if not exists делает шаг no-op).
-- ---------------------------------------------------------------------
create index if not exists idx_stock_movements_order_id
  on public.stock_movements (order_id);

create index if not exists idx_stock_movements_batch_id
  on public.stock_movements (batch_id);

create index if not exists idx_stock_movements_supplier_id
  on public.stock_movements (supplier_id);

create index if not exists idx_stock_movements_order_part_id
  on public.stock_movements (order_part_id);

-- ---------------------------------------------------------------------
-- 4. Безопасный backfill существующих приходов.
--
--    Алгоритм:
--      * берём только движения movement_type = 'income', у которых
--        batch_id ещё не проставлен (повторный запуск — no-op);
--      * кандидат — партия прихода того же part_id с тем же quantity,
--        ещё не связанная ни с одним движением (не переиспользуем
--        партию: одна партия = одно поступление);
--      * связываем только строгое 1:1 совпадение:
--          movement_matches = 1 (у движения ровно одна подходящая
--          партия) И batch_matches = 1 (у партии ровно одно подходящее
--          движение);
--      * из найденной партии переносим supplier_id и purchase_price;
--      * если совпадений нет или их несколько (неоднозначно) —
--        строка остаётся с NULL, ничего не угадывается. Дубликат
--        приходов на одну партию тоже не связывается.
--
--    Изменяются только batch_id / supplier_id / purchase_price.
--    movement_type, quantity, profile_id, created_at не трогаются.
-- ---------------------------------------------------------------------
with matches as (
  select
    m.id             as movement_id,
    b.id             as batch_id,
    b.supplier_id    as supplier_id,
    b.purchase_price as purchase_price,
    count(*) over (partition by m.id) as movement_matches,
    count(*) over (partition by b.id) as batch_matches
  from public.stock_movements m
  join public.stock_batches b
    on b.part_id = m.part_id
   and b.quantity = m.quantity
  where m.movement_type = 'income'
    and m.batch_id is null
    and not exists (
      select 1
      from public.stock_movements linked
      where linked.batch_id = b.id
    )
)
update public.stock_movements m
set
  batch_id       = mt.batch_id,
  supplier_id    = mt.supplier_id,
  purchase_price = mt.purchase_price
from matches mt
where mt.movement_id = m.id
  and mt.movement_matches = 1
  and mt.batch_matches = 1;

-- ---------------------------------------------------------------------
-- 5. Проверка после применения (выполнить вручную в SQL Editor;
--    read-only, в самой миграции не запускается).
--
--   -- 5.1. Итоговая структура журнала.
--   select column_name, data_type, is_nullable
--   from information_schema.columns
--   where table_schema = 'public' and table_name = 'stock_movements'
--   order by ordinal_position;
--
--   -- 5.2. Сколько приходов получили однозначную привязку к партии.
--   select count(*) filter (where batch_id is not null) as linked,
--          count(*) filter (where batch_id is null)     as unlinked
--   from public.stock_movements
--   where movement_type = 'income';
--
--   -- 5.3. Сверка: приход по партиям vs остаток по журналу.
--   select p.sku,
--          coalesce(b.batch_qty, 0) as batch_income,
--          coalesce(m.mov_qty, 0)   as movement_stock
--   from public.parts p
--   left join (
--     select part_id, sum(quantity) as batch_qty
--     from public.stock_batches group by part_id
--   ) b on b.part_id = p.id
--   left join (
--     select part_id,
--            sum(case movement_type
--                  when 'income'  then  quantity
--                  when 'return'  then  quantity
--                  when 'expense' then -quantity
--                  when 'defect'  then -quantity
--                  else 0 end) as mov_qty
--     from public.stock_movements group by part_id
--   ) m on m.part_id = p.id
--   order by p.sku;
-- ---------------------------------------------------------------------

-- RLS не меняется: новые колонки наследуют политики из
-- 20240101000200_create_warehouse_schema.sql (чтение — authenticated,
-- запись — inventory.manage / admin). Дополнительные политики не нужны.