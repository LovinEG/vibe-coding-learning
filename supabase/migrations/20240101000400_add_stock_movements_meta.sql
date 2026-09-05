-- =====================================================================
-- Миграция: 20240101000400_add_stock_movements_meta.sql
-- Описание: Журнал «Движения склада»: связь движений с заказами
--           (order_id) и свободный комментарий для audit-лога.
-- Применение: Supabase SQL Editor (или supabase db push).
-- =====================================================================

-- Связь движения с заказом (списание/возврат деталей по заказу).
alter table stock_movements
  add column if not exists order_id uuid references orders (id) on delete set null;

-- Свободный комментарий к движению (корректировки, брак, инвентаризация).
alter table stock_movements
  add column if not exists comment text;

create index if not exists idx_stock_movements_order_id
  on stock_movements (order_id);

-- RLS включён в 20240101000200_create_warehouse_schema.sql: новые колонки
-- наследуют существующие политики (чтение — authenticated,
-- запись — inventory.manage / admin). Дополнительные политики не нужны.