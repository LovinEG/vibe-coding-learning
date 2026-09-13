-- =====================================================================
-- Миграция: 20260914000000_sequential_order_client_numbers.sql
-- Этап 2 roadmap LovinTech: последовательная нумерация заказов (LT-XXXXXX)
-- и клиентов (CL-XXXXXX).
--
-- Производится:
--   orders:
--     - legacy_number text NULL (старый случайный номер, для поиска);
--     - sequence orders_number_seq + DB default 'LT-' || lpad(nextval,6,'0');
--     - backfill всех существующих заказов (accepted_at ASC NULLS LAST, id ASC);
--     - unique index на order_number;
--     - immutable-триггер (номер нельзя изменить после создания).
--   clients:
--     - client_number text (NULL до backfill, потом NOT NULL);
--     - sequence clients_number_seq + DB default 'CL-' || lpad(nextval,6,'0');
--     - backfill (created_at ASC NULLS LAST, id ASC);
--     - unique index + immutable-триггер.
--
-- UUID PK, FK, payments/history, approval, shifts, RLS/RBAC, close_order
-- не затрагиваются. RPC close_order продолжает писать order_number в
-- текстовый комментарий — новые записи автоматически получат LT-номер.
-- Повторный запуск безопасен: backfill работает только со строками,
-- ещё не переведёнными на LT-/CL-номера.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. ORDERS: legacy_number + sequence
-- ---------------------------------------------------------------------

alter table orders
  add column if not exists legacy_number text;

create sequence if not exists orders_number_seq
  start 1
  increment 1
  no maxvalue
  no cycle
  owned by none;

-- ---------------------------------------------------------------------
-- 2. ORDERS: backfill всех существующих заказов
--    Порядок присвоения: accepted_at ASC NULLS LAST, затем id ASC.
--    Старый номер сохраняется в legacy_number (однократно, не затирается
--    при повторном запуске). Строки, уже переведённые на LT-, не трогаем,
--    поэтому повторный запуск ничего не перезаписывает и не сдвигает.
-- ---------------------------------------------------------------------

with ranked as (
  select
    id,
    order_number,
    row_number() over (order by accepted_at asc nulls last, id asc) as rn
  from orders
  where order_number not like 'LT-%'
)
update orders o
set
  order_number = 'LT-' || lpad(r.rn::text, 6, '0'),
  legacy_number = case
    when o.legacy_number is null then r.order_number
    else o.legacy_number
  end
from ranked r
where o.id = r.id;

-- Sequence продолжается после максимального присвоенного номера
-- (вычисляется из фактических данных — безопасно при повторном запуске).
select setval(
  'orders_number_seq',
  coalesce(
    max(substring(o.order_number from 4)::bigint),
    0
  ) + 1,
  false
)
from orders o
where o.order_number ~ '^LT-\d{6}$';

-- ---------------------------------------------------------------------
-- 3. ORDERS: unique + NOT NULL + default через sequence + immutable
-- ---------------------------------------------------------------------

-- Уникальность номера (после backfill дублей быть не должно: номера
-- выдаются одним row_number без повторов, а ранее присвоенные LT-номера
-- идут в той же последовательности с 1).
create unique index if not exists orders_order_number_key
  on orders (order_number);

-- Колонка уже NOT NULL — убеждаемся (no-op, если так).
alter table orders
  alter column order_number set not null;

-- Новый номер создаёт ТОЛЬКО БД: default = LT- + lpad(nextval, 6).
-- nextval атомарен → безопасно при параллельном создании (возможны
-- «дырки» при откате транзакции — это норма для sequence).
alter table orders
  alter column order_number
  set default 'LT-' || lpad(nextval('orders_number_seq')::text, 6, '0');

-- Формат номера: LT- + ровно 6 цифр.
alter table orders
  drop constraint if exists orders_order_number_format_check;
alter table orders
  add constraint orders_order_number_format_check
  check (order_number ~ '^LT-\d{6}$');

-- Immutable: после создания номер менять нельзя (в т.ч. через Supabase-клиент).
create or replace function orders_order_number_immutable()
returns trigger
language plpgsql
as $$
begin
  if new.order_number is distinct from old.order_number then
    raise exception
      'order_number immutable: нельзя изменить номер заказа после создания (%)',
      old.order_number;
  end if;

  return new;
end;
$$;

drop trigger if exists orders_order_number_immutable_trigger on orders;
create trigger orders_order_number_immutable_trigger
  before update on orders
  for each row
  execute function orders_order_number_immutable();

-- ---------------------------------------------------------------------
-- 4. CLIENTS: client_number + sequence + backfill
-- ---------------------------------------------------------------------

alter table clients
  add column if not exists client_number text;

create sequence if not exists clients_number_seq
  start 1
  increment 1
  no maxvalue
  no cycle
  owned by none;

-- Backfill: created_at ASC NULLS LAST, затем id ASC. Повторный запуск
-- не трогает уже пронумерованных клиентов (номера остаются прежними).
with ranked as (
  select
    id,
    row_number() over (
      order by created_at asc nulls last, id asc
    ) as rn
  from clients
  where client_number is null
)
update clients c
set client_number = 'CL-' || lpad(r.rn::text, 6, '0')
from ranked r
where c.id = r.id;

select setval(
  'clients_number_seq',
  coalesce(
    max(substring(c.client_number from 4)::bigint),
    0
  ) + 1,
  false
)
from clients c
where c.client_number ~ '^CL-\d{6}$';

create unique index if not exists clients_client_number_key
  on clients (client_number);

alter table clients
  alter column client_number set not null;

alter table clients
  alter column client_number
  set default 'CL-' || lpad(nextval('clients_number_seq')::text, 6, '0');

-- Формат номера: CL- + ровно 6 цифр.
alter table clients
  drop constraint if exists clients_client_number_format_check;
alter table clients
  add constraint clients_client_number_format_check
  check (client_number ~ '^CL-\d{6}$');

-- Immutable: номер клиента нельзя изменить после создания.
create or replace function clients_client_number_immutable()
returns trigger
language plpgsql
as $$
begin
  if new.client_number is distinct from old.client_number then
    raise exception
      'client_number immutable: нельзя изменить номер клиента после создания (%)',
      old.client_number;
  end if;

  return new;
end;
$$;

drop trigger if exists clients_client_number_immutable_trigger on clients;
create trigger clients_client_number_immutable_trigger
  before update on clients
  for each row
  execute function clients_client_number_immutable();

-- ---------------------------------------------------------------------
-- 5. GRANTS: права на sequences для INSERT из Supabase frontend
--    DB default с nextval() выполняется от имени вызывающей роли
--    (authenticated). В tracked миграциях проекта нет alter default
--    privileges на sequences, поэтому права выдаются явно — иначе
--    INSERT заказа/клиента упадёт с permission denied на sequence.
--    anon права не выдаются: все операции CRM идут под authenticated.
-- ---------------------------------------------------------------------

grant usage, select on sequence public.orders_number_seq to authenticated;
grant usage, select on sequence public.clients_number_seq to authenticated;
