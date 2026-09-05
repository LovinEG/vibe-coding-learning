-- =====================================================================
-- Миграция: 20240101000300_create_consumables_schema.sql
-- Описание: Слой 2 — Расходники мастерской (consumables): номенклатура
--           расходных материалов с остатками и порогами оповещения.
--           RLS + сидовые данные.
-- Зависимость: требует функцию public.has_permission() из миграции
--           20240101000200_create_warehouse_schema.sql.
-- Применение: Supabase SQL Editor (или supabase db push).
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Таблица расходников.
--    quantity/min_quantity — numeric(12,2): поддерживают дробные остатки (мл, г).
-- ---------------------------------------------------------------------
create table if not exists consumables (
  id           uuid           primary key default gen_random_uuid(),
  name         text           not null,
  quantity     numeric(12, 2) not null default 0,
  unit         text           not null default 'шт'
               check (unit in ('шт', 'мл', 'г', 'рулон', 'уп')),
  min_quantity numeric(12, 2) not null default 0,
  created_at   timestamptz    default now()
);

-- ---------------------------------------------------------------------
-- 2. RLS: чтение — всем авторизованным, запись — inventory.manage/admin.
-- ---------------------------------------------------------------------
alter table consumables enable row level security;

drop policy if exists "Allow authenticated to read consumables" on consumables;
create policy "Allow authenticated to read consumables"
  on consumables for select to authenticated using (true);

drop policy if exists "Allow inventory managers to manage consumables" on consumables;
create policy "Allow inventory managers to manage consumables"
  on consumables for all to authenticated
  using (public.has_permission('inventory.manage'))
  with check (public.has_permission('inventory.manage'));

-- ---------------------------------------------------------------------
-- 3. Seed Data: 4 расходника; два (салфетки, скотч) — с остатком
--    ниже порога, чтобы сразу увидеть статус «Заканчивается».
--    Повторный запуск безопасен (фиксированные UUID).
-- ---------------------------------------------------------------------
insert into consumables (id, name, quantity, unit, min_quantity) values
  ('e0000000-0000-4000-8000-000000000001',
   'Изопропиловый спирт', 950, 'мл', 500),
  ('e0000000-0000-4000-8000-000000000002',
   'Салфетки безворсовые', 2, 'уп', 5),
  ('e0000000-0000-4000-8000-000000000003',
   'Кисточка антистатическая', 4, 'шт', 2),
  ('e0000000-0000-4000-8000-000000000004',
   'Скотч двусторонний', 1, 'рулон', 2)
on conflict (id) do nothing;