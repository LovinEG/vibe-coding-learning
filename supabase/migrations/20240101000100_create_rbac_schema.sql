-- =====================================================================
-- Миграция: 20240101000100_create_rbac_schema.sql
-- Описание: Слой 2 (RBAC) — таблицы roles, permissions, role_permissions,
--           profiles, триггер handle_new_user, сидовые данные и RLS.
-- Применение: Supabase SQL Editor (или supabase db push).
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Роли пользователей
-- ---------------------------------------------------------------------
create table if not exists roles (
  id         uuid        primary key default gen_random_uuid(),
  name       text        not null,
  code       text        not null unique,
  created_at timestamptz default now()
);

-- ---------------------------------------------------------------------
-- 2. Права (разрешения)
-- ---------------------------------------------------------------------
create table if not exists permissions (
  id          uuid        primary key default gen_random_uuid(),
  code        text        not null unique,
  module      text        not null,
  description text,
  created_at  timestamptz default now()
);

-- ---------------------------------------------------------------------
-- 3. Связка роль ↔ право (многие ко многим)
-- ---------------------------------------------------------------------
create table if not exists role_permissions (
  role_id       uuid not null references roles (id) on delete cascade,
  permission_id uuid not null references permissions (id) on delete cascade,
  primary key (role_id, permission_id)
);

-- ---------------------------------------------------------------------
-- 4. Профили пользователей (1:1 с auth.users)
-- ---------------------------------------------------------------------
create table if not exists profiles (
  id         uuid        primary key references auth.users (id) on delete cascade,
  role_id    uuid        references roles (id) on delete set null,
  full_name  text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Индексы для join-запросов (профиль → роль → права).
create index if not exists idx_role_permissions_role_id on role_permissions (role_id);
create index if not exists idx_profiles_role_id on profiles (role_id);

-- ---------------------------------------------------------------------
-- 5. Хелпер is_admin() — используется в политиках RLS.
--    security definer, чтобы RLS на profiles не зациклился сам на себе.
-- ---------------------------------------------------------------------
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles p
    join public.roles r on r.id = p.role_id
    where p.id = auth.uid()
      and r.code = 'admin'
  );
$$;

-- ---------------------------------------------------------------------
-- 6. Триггер handle_new_user — каждому новому пользователю auth.users
--    автоматически создаётся профиль с ролью по умолчанию 'user'.
-- ---------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, role_id, full_name)
  values (
    new.id,
    (select id from public.roles where code = 'user' limit 1),
    coalesce(
      nullif(new.raw_user_meta_data->>'full_name', ''),
      nullif(new.email, ''),
      'Сотрудник'
    )
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;

create trigger on_auth_user_created
  after insert on auth.users
  for each row
  execute function public.handle_new_user();

-- ---------------------------------------------------------------------
-- 7. Сидовые данные: роли и права
-- ---------------------------------------------------------------------
insert into roles (name, code) values
  ('Администратор', 'admin'),
  ('Сотрудник',     'user')
on conflict (code) do nothing;

-- Совместимость: если таблица permissions была создана предыдущей
-- версией миграции (без колонки module) или уже существует в базе,
-- добавляем колонку и заполняем её из префикса кода права,
-- чтобы перед NOT NULL не осталось NULL-значений.
alter table permissions add column if not exists module text;

update permissions
set module = split_part(code, '.', 1)
where module is null;

alter table permissions alter column module set not null;

insert into permissions (code, module, description) values
  ('orders.view',   'orders', 'Просмотр заказов'),
  ('orders.create', 'orders', 'Создание заказов'),
  ('orders.edit',   'orders', 'Редактирование заказов'),
  ('orders.delete', 'orders', 'Удаление заказов'),
  ('clients.view',   'clients', 'Просмотр клиентов'),
  ('clients.create', 'clients', 'Добавление клиентов'),
  ('clients.edit',   'clients', 'Редактирование клиентов'),
  ('clients.delete', 'clients', 'Удаление клиентов')
on conflict (code) do nothing;

-- Админ получает все права, сотрудник — просмотр и создание.
insert into role_permissions (role_id, permission_id)
select r.id, p.id
from roles r
join permissions p on p.code in (
  'orders.view', 'orders.create',
  'orders.edit', 'orders.delete',
  'clients.view', 'clients.create',
  'clients.edit', 'clients.delete'
)
where r.code = 'admin'
on conflict do nothing;

insert into role_permissions (role_id, permission_id)
select r.id, p.id
from roles r
join permissions p on p.code in ('orders.view', 'orders.create', 'clients.view', 'clients.create')
where r.code = 'user'
on conflict do nothing;

-- ---------------------------------------------------------------------
-- 8. Бэкфилл: профили для уже существующих пользователей
--    (созданных до включения триггера) с ролью 'user'.
-- ---------------------------------------------------------------------
insert into profiles (id, role_id, full_name)
select
  u.id,
  (select id from roles where code = 'user' limit 1),
  coalesce(
    nullif(u.raw_user_meta_data->>'full_name', ''),
    nullif(u.email, ''),
    'Сотрудник'
  )
from auth.users u
on conflict (id) do nothing;

-- ---------------------------------------------------------------------
-- 9. Row Level Security
-- ---------------------------------------------------------------------
alter table roles            enable row level security;
alter table permissions      enable row level security;
alter table role_permissions enable row level security;
alter table profiles         enable row level security;

-- Справочники читают все аутентифицированные пользователи.
drop policy if exists "Allow authenticated to read roles" on roles;
create policy "Allow authenticated to read roles"
  on roles for select to authenticated using (true);

drop policy if exists "Allow authenticated to read permissions" on permissions;
create policy "Allow authenticated to read permissions"
  on permissions for select to authenticated using (true);

drop policy if exists "Allow authenticated to read role_permissions" on role_permissions;
create policy "Allow authenticated to read role_permissions"
  on role_permissions for select to authenticated using (true);

-- Профиль: пользователь видит свой, админ — все (запись — только через
-- сервисный ключ; политика update юзерам намеренно не выдаётся).
drop policy if exists "Allow users to read own profile" on profiles;
create policy "Allow users to read own profile"
  on profiles for select to authenticated
  using (auth.uid() = id);

drop policy if exists "Allow admins to read all profiles" on profiles;
create policy "Allow admins to read all profiles"
  on profiles for select to authenticated
  using (public.is_admin());
