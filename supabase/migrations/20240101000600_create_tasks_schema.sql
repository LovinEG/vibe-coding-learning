-- =====================================================================
-- Миграция: 20240101000600_create_tasks_schema.sql
-- Описание: ШАГ 5 — сущность «Задачи» (tasks): статусная модель работы,
--           исполнитель из профилей, срок и приоритет. RLS:
--           чтение — всем авторизованным, запись — админу или любой
--           роли с правом tasks.manage («базовые права» на задачи).
-- Применение: Supabase SQL Editor (или supabase db push).
-- =====================================================================

-- ---------------------------------------------------------------------
-- 0. Каталог сотрудников: колонка email в profiles.
--    getTasks()/getStockMovements() джойнят profiles(full_name, email),
--    но в RBAC-миграции колонки email не было — добавляем её и
--    наполняем из auth.users.email.
-- ---------------------------------------------------------------------
alter table profiles add column if not exists email text;

update profiles p
set email = u.email
from auth.users u
where p.id = u.id
  and p.email is null
  and u.email is not null;

-- Обновляем триггер на профилей: email заполняется сразу при регистрации.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, role_id, full_name, email)
  values (
    new.id,
    (select id from public.roles where code = 'user' limit 1),
    coalesce(
      nullif(new.raw_user_meta_data->>'full_name', ''),
      nullif(new.email, ''),
      'Сотрудник'
    ),
    nullif(new.email, '')
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

-- ---------------------------------------------------------------------
-- 1. Таблица tasks
-- ---------------------------------------------------------------------
create table if not exists tasks (
  id          uuid        primary key default gen_random_uuid(),
  title       text        not null,
  description text,
  status      text        not null default 'todo'
              check (status in ('todo', 'in_progress', 'done')),
  priority    text        not null default 'normal'
              check (priority in ('low', 'normal', 'high')),
  assigned_to uuid        references public.profiles (id) on delete set null,
  due_date    timestamptz,
  created_at  timestamptz default now()
);

-- Индексы для частых фильтров и джойнов.
create index if not exists idx_tasks_status      on tasks (status);
create index if not exists idx_tasks_assigned_to on tasks (assigned_to);
create index if not exists idx_tasks_due_date    on tasks (due_date);

-- ---------------------------------------------------------------------
-- 2. RLS: чтение — всем авторизованным, запись — админу (или роли с
--    правом tasks.manage). has_permission() определён в миграции склада
--    и сам учитывает admin-обход.
-- ---------------------------------------------------------------------
alter table tasks enable row level security;

drop policy if exists "Allow authenticated to read tasks" on tasks;
create policy "Allow authenticated to read tasks"
  on tasks for select to authenticated using (true);

drop policy if exists "Allow task managers to write tasks" on tasks;
create policy "Allow task managers to write tasks"
  on tasks for all to authenticated
  using (public.has_permission('tasks.manage'))
  with check (public.has_permission('tasks.manage'));

-- ---------------------------------------------------------------------
-- 3. Справочник сотрудников: авторизованные читают каталог профилей.
--    Без этого джойн profiles в задачах (и в журнале движений) при
--    применении RLS молча отбрасывал бы чужие профили, и у
--    не-админов имена исполнителей/авторов пропадали бы.
-- ---------------------------------------------------------------------
drop policy if exists "Allow authenticated to read profile directory" on profiles;
create policy "Allow authenticated to read profile directory"
  on profiles for select to authenticated using (true);

-- ---------------------------------------------------------------------
-- 4. Права на задачи в справочник RBAC.
--    admin — оба права; базовая роль user — тоже оба: по замыслу
--    сотрудники создают и сами закрывают свои задачи.
-- ---------------------------------------------------------------------
insert into permissions (code, module, description) values
  ('tasks.view',   'tasks', 'Просмотр задач'),
  ('tasks.manage', 'tasks', 'Управление задачами: создание, редактирование, удаление')
on conflict (code) do nothing;

insert into role_permissions (role_id, permission_id)
select r.id, p.id
from roles r
join permissions p on p.code in ('tasks.view', 'tasks.manage')
where r.code = 'admin'
on conflict do nothing;

insert into role_permissions (role_id, permission_id)
select r.id, p.id
from roles r
join permissions p on p.code in ('tasks.view', 'tasks.manage')
where r.code = 'user'
on conflict do nothing;