-- =====================================================================
-- Миграция: 20240101000000_create_crm_schema.sql
-- Описание: создаёт CRM-таблицы clients и devices,
--           а также связывает их с существующей таблицей orders.
-- =====================================================================

-- gen_random_uuid() встроен в PostgreSQL 13+; для старых версий
-- дополнительно включаем расширение pgcrypto.
create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------
-- 1. Таблица clients (клиенты)
-- ---------------------------------------------------------------------
create table if not exists clients (
  id         uuid        primary key default gen_random_uuid(),
  name       text        not null,
  phone      text        not null,
  created_at timestamptz default now()
);

-- ---------------------------------------------------------------------
-- 2. Таблица devices (устройства клиентов)
-- ---------------------------------------------------------------------
create table if not exists devices (
  id            uuid primary key default gen_random_uuid(),
  client_id     uuid references clients (id) on delete cascade,
  brand         text not null,
  model         text not null,
  serial_number text,
  created_at    timestamptz default now()
);

-- Индекс для ускорения выборок устройств по клиенту.
create index if not exists idx_devices_client_id on devices (client_id);

-- ---------------------------------------------------------------------
-- 3. Внешние ключи в существующей таблице orders.
--    Колонки client_id и device_id добавляются как nullable, чтобы не
--    потерять уже имеющиеся заказы (текстовые колонки client/device
--    сохраняются для обратной совместимости).
-- ---------------------------------------------------------------------
alter table orders
  add column if not exists client_id uuid references clients (id),
  add column if not exists device_id uuid references devices (id);

-- Индексы для внешних ключей orders.
create index if not exists idx_orders_client_id on orders (client_id);
create index if not exists idx_orders_device_id on orders (device_id);
-- ---------------------------------------------------------------------
-- 4. Включение Row Level Security (RLS)
-- ---------------------------------------------------------------------
alter table clients enable row level security;
alter table devices enable row level security;

-- Политики доступа (Allow public access for anon)
create policy "Allow public access to clients" on clients for all using (true) with check (true);
create policy "Allow public access to devices" on devices for all using (true) with check (true);