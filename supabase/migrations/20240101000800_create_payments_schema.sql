-- =====================================================================
-- Миграция: 20240101000800_create_payments_schema.sql
-- Описание: ШАГ 7 — «Оплаты и Платежи» (payments): журнал приходов и
--           расходов денежных средств по кассам. Триггер автоматически
--           обновляет баланс кассы: income — увеличивает, expense —
--           уменьшает на сумму платежа.
--           RLS: чтение — finance.view / admin, запись — finance.manage.
-- Применение: Supabase SQL Editor (или supabase db push).
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Таблица payments
-- ---------------------------------------------------------------------
create table if not exists payments (
  id               uuid           primary key default gen_random_uuid(),
  cash_register_id uuid           not null references public.cash_registers (id) on delete restrict,
  order_id         uuid           references public.orders (id) on delete set null,
  client_id        uuid           references public.clients (id) on delete set null,
  type             text           not null default 'income'
                   check (type in ('income', 'expense')),
  amount           numeric(12, 2) not null check (amount > 0),
  payment_method   text           not null default 'cash'
                   check (payment_method in ('cash', 'card', 'transfer')),
  comment          text,
  created_by       uuid           references public.profiles (id) on delete set null,
  created_at       timestamptz    default now()
);

-- Индексы для частых фильтров и джойнов.
create index if not exists idx_payments_cash_register_id on payments (cash_register_id);
create index if not exists idx_payments_type            on payments (type);
create index if not exists idx_payments_created_at      on payments (created_at);

-- ---------------------------------------------------------------------
-- 2. Триггер синхронизации баланса кассы.
--    BEFORE INSERT: при проведении платежа баланс кассы увеличивается
--    на amount для income и уменьшается для expense — атомарно в рамках
--    той же транзакции, что и сам INSERT.
-- ---------------------------------------------------------------------
create or replace function public.sync_cash_register_balance()
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

drop trigger if exists trg_payments_sync_cash_register on payments;

create trigger trg_payments_sync_cash_register
  before insert on payments
  for each row
  execute function public.sync_cash_register_balance();

-- ---------------------------------------------------------------------
-- 3. RLS: чтение — finance.view / admin, запись — finance.manage / admin.
--    has_permission() уже учитывает admin-обход.
-- ---------------------------------------------------------------------
alter table payments enable row level security;

drop policy if exists "Allow finance viewers to read payments" on payments;
create policy "Allow finance viewers to read payments"
  on payments for select to authenticated
  using (public.has_permission('finance.view'));

drop policy if exists "Allow finance managers to manage payments" on payments;
create policy "Allow finance managers to manage payments"
  on payments for all to authenticated
  using (public.has_permission('finance.manage'))
  with check (public.has_permission('finance.manage'));