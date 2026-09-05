-- =====================================================================
-- Миграция: 20240101000900_create_cash_operations_schema.sql
-- Описание: ШАГ 8 — «Кассовые операции» (cash_operations): приходные и
--           расходные операции по кассам с категориями (Аренда, Зарплата,
--           Маркетинг, Канцелярия, Прочее). Триггер автоматически
--           пересчитывает баланс кассы: income — плюс, expense — минус.
--           RLS: чтение — finance.view / admin, запись — finance.manage.
-- Применение: Supabase SQL Editor (или supabase db push).
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Таблица cash_operations
-- ---------------------------------------------------------------------
create table if not exists cash_operations (
  id               uuid           primary key default gen_random_uuid(),
  cash_register_id uuid           not null references public.cash_registers (id) on delete restrict,
  type             text           not null default 'expense'
                   check (type in ('income', 'expense')),
  category         text           not null,
  amount           numeric(12, 2) not null check (amount > 0),
  comment          text,
  created_by       uuid           references public.profiles (id) on delete set null,
  created_at       timestamptz    default now()
);

-- Индексы для частых фильтров и джойнов.
create index if not exists idx_cash_operations_cash_register_id on cash_operations (cash_register_id);
create index if not exists idx_cash_operations_type            on cash_operations (type);
create index if not exists idx_cash_operations_category        on cash_operations (category);
create index if not exists idx_cash_operations_created_at      on cash_operations (created_at);

-- ---------------------------------------------------------------------
-- 2. Триггер пересчёта баланса кассы.
--    PL/pgSQL функция update_cash_register_balance_from_operation():
--    при проведении операции увеличивает balance кассы на amount для
--    income и уменьшает на amount для expense. Вызывается AFTER INSERT —
--    обновление баланса выполняется атомарно в той же транзакции.
-- ---------------------------------------------------------------------
create or replace function public.update_cash_register_balance_from_operation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.type = 'income' then
    update public.cash_registers
    set balance = balance + new.amount
    where id = new.cash_register_id;
  elsif new.type = 'expense' then
    update public.cash_registers
    set balance = balance - new.amount
    where id = new.cash_register_id;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_cash_operations_update_cash_register on cash_operations;

create trigger trg_cash_operations_update_cash_register
  after insert on cash_operations
  for each row
  execute function public.update_cash_register_balance_from_operation();

-- ---------------------------------------------------------------------
-- 3. RLS: чтение — finance.view / admin, запись — finance.manage / admin.
--    has_permission() уже учитывает admin-обход.
-- ---------------------------------------------------------------------
alter table cash_operations enable row level security;

drop policy if exists "Allow finance viewers to read cash_operations" on cash_operations;
create policy "Allow finance viewers to read cash_operations"
  on cash_operations for select to authenticated
  using (public.has_permission('finance.view'));

drop policy if exists "Allow finance managers to manage cash_operations" on cash_operations;
create policy "Allow finance managers to manage cash_operations"
  on cash_operations for all to authenticated
  using (public.has_permission('finance.manage'))
  with check (public.has_permission('finance.manage'));
