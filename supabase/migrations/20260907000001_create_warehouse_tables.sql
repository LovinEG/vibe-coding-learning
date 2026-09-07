-- ШАГ 4.1: структура данных модуля «Склад».
-- Таблица parts может уже существовать (создавалась миграцией
-- 20240101000200_create_warehouse_schema.sql), поэтому миграция идемпотентна:
-- недостающие колонки добавляются через ADD COLUMN IF NOT EXISTS.

create table if not exists parts (
  id              uuid           primary key default gen_random_uuid(),
  name            text           not null,
  sku             text           not null unique,
  category        text           default 'Общие',
  purchase_price  numeric(12, 2) default 0 check (purchase_price >= 0),
  selling_price   numeric(12, 2) default 0 check (selling_price >= 0),
  stock_quantity  integer        default 0 check (stock_quantity >= 0),
  min_stock_limit integer        default 2 check (min_stock_limit >= 0),
  created_at      timestamptz    default now()
);

-- Колонки для баз, где parts была создана старой миграцией.
alter table parts add column if not exists purchase_price  numeric(12, 2) default 0;
alter table parts add column if not exists selling_price   numeric(12, 2) default 0;
alter table parts add column if not exists stock_quantity  integer        default 0;
alter table parts add column if not exists min_stock_limit integer        default 2;

-- Бэкфилл новых полей из старых колонок (если данные не перенесены).
update parts
set purchase_price  = coalesce(purchase_price, 0),
    selling_price   = coalesce(selling_price, retail_price, 0),
    stock_quantity  = coalesce(stock_quantity, 0),
    min_stock_limit = coalesce(min_stock_limit, min_stock, 2)
where purchase_price is null
   or selling_price is null
   or stock_quantity is null
   or min_stock_limit is null;

-- Ограничения на неотрицательные значения (игнорируем, если уже есть).
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'parts_purchase_price_check'
  ) then
    alter table parts add constraint parts_purchase_price_check
      check (purchase_price >= 0);
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'parts_selling_price_check'
  ) then
    alter table parts add constraint parts_selling_price_check
      check (selling_price >= 0);
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'parts_stock_quantity_check'
  ) then
    alter table parts add constraint parts_stock_quantity_check
      check (stock_quantity >= 0);
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'parts_min_stock_limit_check'
  ) then
    alter table parts add constraint parts_min_stock_limit_check
      check (min_stock_limit >= 0);
  end if;
end $$;

-- Индексы для поиска по артикулу и названию.
create index if not exists idx_parts_sku  on parts (sku);
create index if not exists idx_parts_name on parts (name);
