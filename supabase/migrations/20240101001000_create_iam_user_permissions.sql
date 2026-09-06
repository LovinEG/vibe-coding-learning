-- =====================================================================
-- Миграция: 20240101001000_create_iam_user_permissions.sql
-- Описание: ШАГ 10 — IAM: персональные права (user_permissions),
--           право iam.manage, роли manager/technician, RLS.
-- Применение: Supabase SQL Editor (или supabase db push).
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Персональные права пользователя (access-list): дополнительные
--    права поверх ролевых. Удаляются при смене роли или вручную.
-- ---------------------------------------------------------------------
create table if not exists user_permissions (
  user_id       uuid not null references profiles (id) on delete cascade,
  permission_id uuid not null references permissions (id) on delete cascade,
  created_at    timestamptz default now(),
  primary key (user_id, permission_id)
);

create index if not exists idx_user_permissions_user_id on user_permissions (user_id);

-- ---------------------------------------------------------------------
-- 2. Право iam.manage — управление пользователями и правами доступа.
-- ---------------------------------------------------------------------
insert into permissions (code, module, description) values
  ('iam.manage', 'iam', 'Управление пользователями, ролями и правами доступа')
on conflict (code) do nothing;

-- ---------------------------------------------------------------------
-- 3. Роли Manager и Technician (админ получает iam.manage).
-- ---------------------------------------------------------------------
insert into roles (name, code) values
  ('Менеджер',   'manager'),
  ('Техник',     'technician')
on conflict (code) do nothing;

-- Админ получает iam.manage.
insert into role_permissions (role_id, permission_id)
select r.id, p.id
from roles r
join permissions p on p.code = 'iam.manage'
where r.code = 'admin'
on conflict do nothing;

-- Менеджер получает типичные для роли права (просмотр заказов, клиентов,
-- задач, финансов; управление задачами).
insert into role_permissions (role_id, permission_id)
select r.id, p.id
from roles r
join permissions p on p.code in (
  'orders.view', 'orders.create', 'orders.edit',
  'clients.view', 'clients.create', 'clients.edit',
  'tasks.view', 'tasks.manage',
  'finance.view'
)
where r.code = 'manager'
on conflict do nothing;

-- Техник получает просмотр заказов, клиентов и управление задачами.
insert into role_permissions (role_id, permission_id)
select r.id, p.id
from roles r
join permissions p on p.code in (
  'orders.view', 'clients.view', 'tasks.view', 'tasks.manage'
)
where r.code = 'technician'
on conflict do nothing;

-- ---------------------------------------------------------------------
-- 4. Row Level Security
-- ---------------------------------------------------------------------
alter table user_permissions enable row level security;

-- Справочник читают все аутентифицированные (нужно для формы назначения).
drop policy if exists "Allow authenticated to read user_permissions" on user_permissions;
create policy "Allow authenticated to read user_permissions"
  on user_permissions for select to authenticated using (true);

-- Запись — только админ (через is_admin()).
drop policy if exists "Allow admins to manage user_permissions" on user_permissions;
create policy "Allow admins to manage user_permissions"
  on user_permissions for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());
