-- =====================================================================
-- Миграция: 20240101000700_create_cash_registers_schema.sql
-- Описание: ШАГ 6 — «Кассы и Счета» (cash_registers): наличные кассы,
--           банковские счета и онлайн-эквайринг с учётом остатков.
--           RLS: чтение — всем авторизованным, запись — finance.manage
--           (или admin через has_permission). В справочник permissions
--           добавляются права finance.view / finance.manage.
-- Применение: Supabase SQL Editor (или supabase db push).
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Таблица cash_registers
-- ---------------------------------------------------------------------
create table if not exists cash_registers (
  id         uuid           primary key default gen_random_uuid(),
  name       text           not null,
  type       text           not null default 'cash'
             check (type in ('cash', 'bank', 'online')),
  balance    numeric(12, 2) not null default 0.00,
  is_active  boolean        not null default true,
  created_at timestamptz    default now()
);

-- Индексы для частых выборок по типу и статусу.
create index if not exists idx_cash_registers_type      on cash_registers (type);
create index if not exists idx_cash_registers_is_active on cash_registers (is_active);

-- ---------------------------------------------------------------------
-- 2. RLS: чтение — authenticated, запись — finance.manage (или admin).
-- ---------------------------------------------------------------------
alter table cash_registers enable row level security;

drop policy if exists "Allow authenticated to read cash_registers" on cash_registers;
create policy "Allow authenticated to read cash_registers"
  on cash_registers for select to authenticated using (true);

drop policy if exists "Allow finance managers to manage cash_registers" on cash_registers;
create policy "Allow finance managers to manage cash_registers"
  on cash_registers for all to authenticated
  using (public.has_permission('finance.manage'))
  with check (public.has_permission('finance.manage'));

-- ---------------------------------------------------------------------
-- 3. Права на финансы в справочник RBAC.
--    admin — оба права; базовая роль user — только просмотр (запись
--    остаётся за админом или ролью с правом finance.manage).
-- ---------------------------------------------------------------------
insert into permissions (code, module, description) values
  ('finance.view',   'finance', 'Просмотр финансовых разделов'),
  ('finance.manage', 'finance', 'Управление финансами: кассы, счета, операции')
on conflict (code) do nothing;

insert into role_permissions (role_id, permission_id)
select r.id, p.id
from roles r
join permissions p on p.code in ('finance.view', 'finance.manage')
where r.code = 'admin'
on conflict do nothing;

insert into role_permissions (role_id, permission_id)
select r.id, p.id
from roles r
join permissions p on p.code = 'finance.view'
where r.code = 'user'
on conflict do nothing;

-- ---------------------------------------------------------------------
-- 4. Seed Data: 3 стартовые кассы.
--    UUID фиксированные — повторный запуск безопасен.
-- ---------------------------------------------------------------------
insert into cash_registers (id, name, type, balance, is_active) values
  ('f0000000-0000-4000-8000-000000000001', 'Основная касса (Наличные)', 'cash',   35000.00, true),
  ('f0000000-0000-4000-8000-000000000002', 'Расчетный счет (Банк)',     'bank',  250000.00, true),
  ('f0000000-0000-4000-8000-000000000003', 'Онлайн-эквайринг',          'online',     0.00, true)
on conflict (id) do nothing;