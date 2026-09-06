-- =====================================================================
-- Миграция: 20260906000000_expand_orders_schema.sql
-- Описание: ШАГ 3.1 — расширение домена «Заказы»:
--           1) приёмка устройства в orders (внешний вид, комплектация,
--              состояние, фото приёмки/диагностики);
--           2) согласование ремонта с клиентом (approval_status);
--           3) точное ценообразование в order_parts (закупка + наценка);
--           4) хронологическая история статусов order_status_history.
-- Применение: Supabase SQL Editor (или supabase db push).
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Расширение таблицы orders: детали приёмки и диагностики.
--    Все колонки nullable — существующие заказы остаются валидными.
-- ---------------------------------------------------------------------
alter table orders
  add column if not exists appearance        text,
  add column if not exists equipment         text,
  add column if not exists device_condition  text,
  -- Массивы URL фотографий храним в jsonb (гибче text[] для будущих
  -- метаданных: подписи, порядок сортировки, автор загрузки).
  add column if not exists intake_photos     jsonb not null default '[]'::jsonb,
  add column if not exists diagnostic_photos jsonb not null default '[]'::jsonb,
  add column if not exists diagnostic_result text;

-- ---------------------------------------------------------------------
-- 2. Согласование ремонта с клиентом.
--    not_required — ремонт не требует согласования (мелкий/оговорённый);
--    pending      — смета отправлена клиенту, ждём решения;
--    approved     — клиент согласовал;
--    rejected     — клиент отказался.
-- ---------------------------------------------------------------------
alter table orders
  add column if not exists approval_status  text not null default 'not_required',
  add column if not exists approval_comment text;

alter table orders
  drop constraint if exists orders_approval_status_check;

alter table orders
  add constraint orders_approval_status_check
  check (approval_status in ('not_required', 'pending', 'approved', 'rejected'));

-- ---------------------------------------------------------------------
-- 3. Точное ценообразование в order_parts.
--    purchase_price + markup = client_price (итоговая цена для клиента);
--    price_at_time сохраняется для обратной совместимости (историческая
--    розничная цена на момент списания).
-- ---------------------------------------------------------------------
alter table order_parts
  add column if not exists purchase_price numeric(10, 2),
  add column if not exists markup         numeric(10, 2),
  add column if not exists client_price   numeric(10, 2),
  add column if not exists added_by       uuid references profiles (id) on delete set null;

-- Бэкфилл: для исторических строк added_by = master_id (кто ставил деталь),
-- client_price = price_at_time (розничная цена была фактической ценой клиента).
update order_parts
set added_by    = master_id,
    client_price = price_at_time
where added_by is null
   or client_price is null;

-- ---------------------------------------------------------------------
-- 4. Хронологическая история статусов заказа.
--    Коды событий: created, assigned, diagnosed, part_added,
--    approval_sent, approved, rejected, repaired, paid, issued.
-- ---------------------------------------------------------------------
create table if not exists order_status_history (
  id         uuid        primary key default gen_random_uuid(),
  order_id   uuid        not null references orders (id) on delete cascade,
  status     text        not null
             check (status in (
               'created', 'assigned', 'diagnosed', 'part_added',
               'approval_sent', 'approved', 'rejected',
               'repaired', 'paid', 'issued'
             )),
  title      text,
  comment    text,
  created_by uuid        references profiles (id) on delete set null,
  created_at timestamptz default now()
);

-- Быстрые выборки истории по заказу (хронология) и фильтр по типу события.
create index if not exists idx_order_status_history_order_id
  on order_status_history (order_id, created_at desc);
create index if not exists idx_order_status_history_status
  on order_status_history (status);

-- ---------------------------------------------------------------------
-- 5. Row Level Security для order_status_history.
--    Чтение и запись — для всех авторизованных пользователей
--    (история журналируется действиями сотрудников из любого раздела).
-- ---------------------------------------------------------------------
alter table order_status_history enable row level security;

drop policy if exists "Allow authenticated to read order status history"
  on order_status_history;
create policy "Allow authenticated to read order status history"
  on order_status_history
  for select
  to authenticated
  using (true);

drop policy if exists "Allow authenticated to insert order status history"
  on order_status_history;
create policy "Allow authenticated to insert order status history"
  on order_status_history
  for insert
  to authenticated
  with check (true);
