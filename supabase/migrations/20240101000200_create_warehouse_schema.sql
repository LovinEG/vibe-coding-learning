-- =====================================================================
-- Миграция: 20240101000200_create_warehouse_schema.sql
-- Описание: Слой 1 — Склад: поставщики, запчасти, партии поставок,
--           расход запчастей по заказам и движения товара.
--           RLS + сидовые данные.
-- Применение: Supabase SQL Editor (или supabase db push).
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Поставщики
-- ---------------------------------------------------------------------
create table if not exists suppliers (
  id         uuid        primary key default gen_random_uuid(),
  name       text        not null,
  phone      text,
  email      text,
  address    text,
  notes      text,
  created_at timestamptz default now()
);

-- ---------------------------------------------------------------------
-- 2. Запчасти (номенклатура)
-- ---------------------------------------------------------------------
create table if not exists parts (
  id           uuid        primary key default gen_random_uuid(),
  sku          text        not null unique,
  name         text        not null,
  category     text,
  min_stock    integer     not null default 0,
  retail_price numeric(10, 2),
  created_at   timestamptz default now()
);

-- ---------------------------------------------------------------------
-- 3. Партии поставок (приход на склад)
-- ---------------------------------------------------------------------
create table if not exists stock_batches (
  id             uuid        primary key default gen_random_uuid(),
  part_id        uuid        not null references parts (id) on delete cascade,
  supplier_id    uuid        references suppliers (id) on delete set null,
  quantity       integer     not null default 0,
  purchase_price numeric(10, 2),
  created_at     timestamptz default now()
);

-- ---------------------------------------------------------------------
-- 4. Расход запчастей по заказам (какая деталь и кем ставилась)
-- ---------------------------------------------------------------------
create table if not exists order_parts (
  id            uuid        primary key default gen_random_uuid(),
  order_id      uuid        not null references orders (id) on delete cascade,
  part_id       uuid        not null references parts (id) on delete cascade,
  quantity      integer     not null default 1,
  price_at_time numeric(10, 2),
  master_id     uuid        references profiles (id) on delete set null,
  created_at    timestamptz default now()
);

-- ---------------------------------------------------------------------
-- 5. Движения товара (приход / расход / возврат / брак)
-- ---------------------------------------------------------------------
create table if not exists stock_movements (
  id            uuid        primary key default gen_random_uuid(),
  part_id       uuid        not null references parts (id) on delete cascade,
  movement_type text        not null
                check (movement_type in ('income', 'expense', 'return', 'defect')),
  quantity      integer     not null default 0,
  profile_id    uuid        references profiles (id) on delete set null,
  created_at    timestamptz default now()
);

-- Индексы для частых выборок и join'ов.
create index if not exists idx_stock_batches_part_id    on stock_batches (part_id);
create index if not exists idx_order_parts_order_id     on order_parts (order_id);
create index if not exists idx_order_parts_part_id      on order_parts (part_id);
create index if not exists idx_stock_movements_part_id  on stock_movements (part_id);

-- ---------------------------------------------------------------------
-- 6. Хелпер has_permission(code) — для RLS-политик записи.
--    security definer, чтобы обойти RLS справочников прав.
--    Админ (роль admin) имеет все права по умолчанию.
-- ---------------------------------------------------------------------
create or replace function public.has_permission(p_code text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles pr
    join public.roles r on r.id = pr.role_id
    join public.role_permissions rp on rp.role_id = r.id
    join public.permissions perm on perm.id = rp.permission_id
    where pr.id = auth.uid()
      and (r.code = 'admin' or perm.code = p_code)
  );
$$;

-- ---------------------------------------------------------------------
-- 7. Row Level Security:
--    чтение — всем авторизованным, запись — inventory.manage или admin.
-- ---------------------------------------------------------------------
alter table suppliers       enable row level security;
alter table parts           enable row level security;
alter table stock_batches   enable row level security;
alter table order_parts     enable row level security;
alter table stock_movements enable row level security;

drop policy if exists "Allow authenticated to read suppliers" on suppliers;
create policy "Allow authenticated to read suppliers"
  on suppliers for select to authenticated using (true);

drop policy if exists "Allow inventory managers to manage suppliers" on suppliers;
create policy "Allow inventory managers to manage suppliers"
  on suppliers for all to authenticated
  using (public.has_permission('inventory.manage'))
  with check (public.has_permission('inventory.manage'));

drop policy if exists "Allow authenticated to read parts" on parts;
create policy "Allow authenticated to read parts"
  on parts for select to authenticated using (true);

drop policy if exists "Allow inventory managers to manage parts" on parts;
create policy "Allow inventory managers to manage parts"
  on parts for all to authenticated
  using (public.has_permission('inventory.manage'))
  with check (public.has_permission('inventory.manage'));

drop policy if exists "Allow authenticated to read stock_batches" on stock_batches;
create policy "Allow authenticated to read stock_batches"
  on stock_batches for select to authenticated using (true);

drop policy if exists "Allow inventory managers to manage stock_batches" on stock_batches;
create policy "Allow inventory managers to manage stock_batches"
  on stock_batches for all to authenticated
  using (public.has_permission('inventory.manage'))
  with check (public.has_permission('inventory.manage'));

drop policy if exists "Allow authenticated to read order_parts" on order_parts;
create policy "Allow authenticated to read order_parts"
  on order_parts for select to authenticated using (true);

drop policy if exists "Allow inventory managers to manage order_parts" on order_parts;
create policy "Allow inventory managers to manage order_parts"
  on order_parts for all to authenticated
  using (public.has_permission('inventory.manage'))
  with check (public.has_permission('inventory.manage'));

drop policy if exists "Allow authenticated to read stock_movements" on stock_movements;
create policy "Allow authenticated to read stock_movements"
  on stock_movements for select to authenticated using (true);

drop policy if exists "Allow inventory managers to manage stock_movements" on stock_movements;
create policy "Allow inventory managers to manage stock_movements"
  on stock_movements for all to authenticated
  using (public.has_permission('inventory.manage'))
  with check (public.has_permission('inventory.manage'));

-- ---------------------------------------------------------------------
-- 8. Новые права в справочник permissions (RBAC-миграция) и выдача ролей.
--    admin — оба права, user — только просмотр склада.
-- ---------------------------------------------------------------------
insert into permissions (code, module, description) values
  ('inventory.read',   'inventory', 'Просмотр склада'),
  ('inventory.manage', 'inventory', 'Управление складом: справочники, приход, расход')
on conflict (code) do nothing;

insert into role_permissions (role_id, permission_id)
select r.id, p.id
from roles r
join permissions p on p.code in ('inventory.read', 'inventory.manage')
where r.code = 'admin'
on conflict do nothing;

insert into role_permissions (role_id, permission_id)
select r.id, p.id
from roles r
join permissions p on p.code = 'inventory.read'
where r.code = 'user'
on conflict do nothing;

-- ---------------------------------------------------------------------
-- 9. Seed Data: 2 поставщика, 4 запчасти, приход на склад.
--    UUID фиксированные — повторный запуск безопасен.
-- ---------------------------------------------------------------------
insert into suppliers (id, name, phone, email, address, notes) values
  ('a0000000-0000-4000-8000-000000000001',
   'ЗапчастиОпт', '+7 495 123-45-67', 'sales@zapchastopt.ru',
   'г. Москва, ул. Складская, д. 1', 'Оптовые поставки дисплеев и модулей'),
  ('a0000000-0000-4000-8000-000000000002',
   'MobileParts', '+7 812 555-10-20', 'info@mobileparts.ru',
   'г. Санкт-Петербург, наб. Обводного канала, 74', 'Аккумуляторы и мелкие комплектующие')
on conflict (id) do nothing;

insert into parts (id, sku, name, category, min_stock, retail_price) values
  ('b0000000-0000-4000-8000-000000000001',
   'DISP-IP12', 'Дисплей для iPhone 12', 'Дисплеи', 5, 6500.00),
  ('b0000000-0000-4000-8000-000000000002',
   'AKB-IP11', 'Аккумулятор для iPhone 11', 'Аккумуляторы', 8, 2900.00),
  ('b0000000-0000-4000-8000-000000000003',
   'DISP-SA52', 'Дисплей для Samsung Galaxy A52', 'Дисплеи', 5, 5200.00),
  ('b0000000-0000-4000-8000-000000000004',
   'AKB-SA32', 'Аккумулятор для Samsung Galaxy A32', 'Аккумуляторы', 8, 2400.00)
on conflict (sku) do nothing;

-- Приход на склад: у дисплея Samsung остаток (4) ниже минимума (5) —
-- удобно для проверки подсветки низкого остатка в интерфейсе.
insert into stock_batches (id, part_id, supplier_id, quantity, purchase_price) values
  ('c0000000-0000-4000-8000-000000000001',
   'b0000000-0000-4000-8000-000000000001',
   'a0000000-0000-4000-8000-000000000001', 20, 4800.00),
  ('c0000000-0000-4000-8000-000000000002',
   'b0000000-0000-4000-8000-000000000002',
   'a0000000-0000-4000-8000-000000000002', 15, 1900.00),
  ('c0000000-0000-4000-8000-000000000003',
   'b0000000-0000-4000-8000-000000000003',
   'a0000000-0000-4000-8000-000000000001', 4, 3900.00),
  ('c0000000-0000-4000-8000-000000000004',
   'b0000000-0000-4000-8000-000000000004',
   'a0000000-0000-4000-8000-000000000002', 12, 1500.00)
on conflict (id) do nothing;

-- Движения по приходам (profile_id nullable: в seed автор не указан).
insert into stock_movements (id, part_id, movement_type, quantity, profile_id) values
  ('d0000000-0000-4000-8000-000000000001',
   'b0000000-0000-4000-8000-000000000001', 'income', 20, null),
  ('d0000000-0000-4000-8000-000000000002',
   'b0000000-0000-4000-8000-000000000002', 'income', 15, null),
  ('d0000000-0000-4000-8000-000000000003',
   'b0000000-0000-4000-8000-000000000003', 'income', 4, null),
  ('d0000000-0000-4000-8000-000000000004',
   'b0000000-0000-4000-8000-000000000004', 'income', 12, null)
on conflict (id) do nothing;