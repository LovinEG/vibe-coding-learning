-- =====================================================================
-- Миграция: 20260906000002_add_orders_workflow_filters.sql
-- Описание: ШАГ 3.4 — поля заказов для фильтров и мульти-поиска:
--           deadline_at (срок ремонта), repair_type (тип ремонта),
--           master_id (назначенный мастер) + индексы.
-- Применение: Supabase SQL Editor (или supabase db push).
-- =====================================================================

alter table orders
  add column if not exists deadline_at timestamptz,
  add column if not exists repair_type  text,
  add column if not exists master_id    uuid references profiles (id) on delete set null;

-- Индексы для фильтров списка заказов.
create index if not exists idx_orders_deadline_at on orders (deadline_at);
create index if not exists idx_orders_master_id   on orders (master_id);
create index if not exists idx_orders_repair_type on orders (repair_type);
