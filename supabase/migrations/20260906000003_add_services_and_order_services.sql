-- =====================================================================
-- Миграция: 20260906000003_add_services_and_order_services.sql
-- Описание: ШАГ 3.5 — работы/услуги: справочник services, работы по
--           заказу order_services, новые коды событий истории
--           ('updated', 'service_added'), сид типовых услуг, RLS.
-- Применение: Supabase SQL Editor (или supabase db push).
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Справочник услуг (типовые работы сервис-центра).
-- ---------------------------------------------------------------------
create table if not exists services (
  id               uuid          primary key default gen_random_uuid(),
  name             text          not null,
  price            numeric(10, 2) not null default 0,
  duration_minutes integer,
  is_active        boolean       not null default true,
  created_at       timestamptz   default now()
);

-- ---------------------------------------------------------------------
-- 2. Работы, выполненные по заказу (ручные или из справочника).
-- ---------------------------------------------------------------------
create table if not exists order_services (
  id               uuid          primary key default gen_random_uuid(),
  order_id         uuid          not null references orders (id) on delete cascade,
  service_id       uuid          references services (id) on delete set null,
  title            text          not null,
  price            numeric(10, 2) not null default 0,
  master_id        uuid          references profiles (id) on delete set null,
  duration_minutes integer,
  created_at       timestamptz   default now()
);

create index if not exists idx_order_services_order_id  on order_services (order_id);
create index if not exists idx_order_services_service_id on order_services (service_id);
create index if not exists idx_order_services_master_id  on order_services (master_id);

-- ---------------------------------------------------------------------
-- 3. Новые коды событий истории: 'updated' (правка заказа)
--    и 'service_added' (добавление работы).
-- ---------------------------------------------------------------------
alter table order_status_history
  drop constraint if exists order_status_history_status_check;

alter table order_status_history
  add constraint order_status_history_status_check
  check (status in (
    'created', 'assigned', 'diagnosed', 'part_added', 'service_added',
    'approval_sent', 'approved', 'rejected',
    'repaired', 'paid', 'issued', 'updated'
  ));

-- ---------------------------------------------------------------------
-- 4. Сид типовых услуг.
-- ---------------------------------------------------------------------
insert into services (name, price, duration_minutes) values
  ('Диагностика',                        500,    30),
  ('Замена дисплея',                    2500,    90),
  ('Замена аккумулятора',               1200,    45),
  ('Чистка от пыли / замена термопасты', 1500,    60),
  ('Прошивка / переустановка ОС',       1000,    60),
  ('Пайка компонентов',                 3500,   180)
on conflict do nothing;

-- ---------------------------------------------------------------------
-- 5. Row Level Security.
-- ---------------------------------------------------------------------
alter table services        enable row level security;
alter table order_services  enable row level security;

drop policy if exists "Allow authenticated to read services" on services;
create policy "Allow authenticated to read services"
  on services for select to authenticated using (true);

drop policy if exists "Allow admins to manage services" on services;
create policy "Allow admins to manage services"
  on services for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists "Allow authenticated to read order services" on order_services;
create policy "Allow authenticated to read order services"
  on order_services for select to authenticated using (true);

drop policy if exists "Allow authenticated to manage order services" on order_services;
create policy "Allow authenticated to manage order services"
  on order_services for all to authenticated
  using (true)
  with check (true);
