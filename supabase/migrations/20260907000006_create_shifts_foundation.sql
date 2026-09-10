-- =====================================================================
-- Миграция: 20260907000006_create_shifts_foundation.sql
-- Описание: ЭТАП 1 серверной системы смен LovinTech — полностью additive:
--           1) таблица public.shifts (смены менеджеров);
--           2) констрейнты и частичные уникальные индексы;
--           3) RLS: SELECT — authenticated; прямой INSERT/UPDATE/DELETE
--              обычным пользователям запрещён (открытие — только RPC
--              open_shift, закрытие — только RPC close_shift);
--           4) хелперы: business_minutes_now() (Europe/Minsk),
--              current_role_code(), is_business_window(),
--              can_perform_work_operation();
--           5) RPC open_shift — ТОЛЬКО роль manager, окно [11:00, 17:30);
--           6) RPC close_shift — свою смену (manager) или аварийное
--              закрытие любой открытой (admin), в любое время суток.
--
-- Бизнес-правила: инкассации нет — открытие/закрытие смены НИКОГДА не
-- меняет cash_registers.balance; opening/closing_balance — snapshots.
-- opened_by/closed_by — только auth.uid(); время — только серверное now()
-- в Europe/Minsk. Одна открытая смена на manager И на cash_register.
--
-- ВАЖНО: на этом шаге can_perform_work_operation() НЕ применяется к
-- существующим business-таблицам, close_order и RLS не меняются,
-- frontend не переключается, старые маркеры cash_operations не
-- мигрируются. Инфраструктура полностью additive.
--
-- Применение: Supabase SQL Editor (или supabase db push).
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Таблица public.shifts
-- ---------------------------------------------------------------------
create table if not exists public.shifts (
  id                uuid           primary key default gen_random_uuid(),
  cash_register_id  uuid           not null references public.cash_registers (id) on delete restrict,
  opened_by         uuid           not null references public.profiles (id) on delete restrict,
  opened_at         timestamptz    not null default now(),
  opening_balance   numeric(12, 2) not null default 0,
  closed_by         uuid           references public.profiles (id) on delete restrict,
  closed_at         timestamptz,
  closing_balance   numeric(12, 2),
  status            text           not null default 'open'
                    check (status in ('open', 'closed')),
  created_at        timestamptz    not null default now(),

  -- Целостность перехода статуса: open = закрытых полей нет,
  -- closed = все три поля заполнены
  constraint shifts_closed_fields_check check (
    (status = 'open'   and closed_at is null and closed_by is null and closing_balance is null)
    or
    (status = 'closed' and closed_at is not null and closed_by is not null and closing_balance is not null)
  ),

  -- Нельзя закрыть раньше открытия
  constraint shifts_close_after_open_check
    check (closed_at is null or closed_at >= opened_at)
);

-- ---------------------------------------------------------------------
-- 2. Инварианты и индексы
-- ---------------------------------------------------------------------
-- Одна открытая смена на менеджера
create unique index if not exists shifts_one_open_per_user
  on public.shifts (opened_by) where status = 'open';

-- Одна открытая смена на кассу
create unique index if not exists shifts_one_open_per_register
  on public.shifts (cash_register_id) where status = 'open';

create index if not exists idx_shifts_opened_by_status
  on public.shifts (opened_by, status);
create index if not exists idx_shifts_register_status
  on public.shifts (cash_register_id, status);
create index if not exists idx_shifts_opened_at
  on public.shifts (opened_at desc);

-- ---------------------------------------------------------------------
-- 3. RLS и grants/revokes для прямой работы с таблицей
-- ---------------------------------------------------------------------
alter table public.shifts enable row level security;

drop policy if exists "Allow authenticated to read shifts" on public.shifts;
create policy "Allow authenticated to read shifts"
  on public.shifts for select to authenticated using (true);

-- Аварийное управление — только admin (рабочий путь — RPC close_shift)
drop policy if exists "Allow admins to update shifts" on public.shifts;
create policy "Allow admins to update shifts"
  on public.shifts for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- Прямой INSERT/UPDATE/DELETE обычным пользователям запрещён: Supabase
-- по умолчанию выдаёт ALL на public-таблицы роли anon/authenticated,
-- поэтому отзываем избыточные права явно. INSERT у authenticated не
-- выдаётся вовсе — открытие смены только через RPC open_shift.
revoke insert, update, delete on public.shifts from anon;
revoke insert, update, delete on public.shifts from authenticated;
grant select on public.shifts to authenticated;

-- ---------------------------------------------------------------------
-- 4. Хелперы времени и роли
-- ---------------------------------------------------------------------
-- Минуты с полуночи в бизнес-таймзоне. Только серверное время.
create or replace function public.business_minutes_now()
returns int
language sql
stable
as $$
  select extract(hour  from now() at time zone 'Europe/Minsk')::int * 60
       + extract(minute from now() at time zone 'Europe/Minsk')::int;
$$;

-- Роль текущего пользователя из profiles/roles (не доверяем frontend).
create or replace function public.current_role_code()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select r.code
  from public.profiles p
  join public.roles r on r.id = p.role_id
  where p.id = auth.uid();
$$;

-- Рабочее окно manager: [11:00, 17:30) — 660 .. < 1050 минут.
create or replace function public.is_business_window()
returns boolean
language sql
stable
as $$
  select public.business_minutes_now() >= 660
     and public.business_minutes_now() < 1050;
$$;

-- Guard для рабочих mutations (применение к таблицам — отдельный этап):
-- admin / user / technician — true; manager — только при своей открытой
-- смене и в рабочем окне; неизвестная/null роль — false (fail-closed).
create or replace function public.can_perform_work_operation()
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_role text;
begin
  select public.current_role_code() into v_role;

  if v_role is null then
    return false;
  end if;

  if v_role in ('admin', 'user', 'technician') then
    return true;
  end if;

  if v_role = 'manager' then
    return exists (
      select 1 from public.shifts
      where opened_by = auth.uid() and status = 'open'
    )
    and public.is_business_window();
  end if;

  return false;
end;
$$;

grant execute on function
  public.business_minutes_now(),
  public.current_role_code(),
  public.is_business_window(),
  public.can_perform_work_operation()
to authenticated;

revoke execute on function
  public.business_minutes_now(),
  public.current_role_code(),
  public.is_business_window(),
  public.can_perform_work_operation()
from anon;

-- ---------------------------------------------------------------------
-- 5. RPC open_shift — ТОЛЬКО роль manager, окно [11:00, 17:30)
-- ---------------------------------------------------------------------
drop function if exists public.open_shift(uuid, numeric);

create or replace function public.open_shift(
  p_cash_register_id uuid,
  p_opening_balance  numeric
)
returns public.shifts
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role  text := public.current_role_code();
  v_shift public.shifts;
begin
  if auth.uid() is null then
    raise exception 'Требуется авторизация' using errcode = '42501';
  end if;

  -- Открывать смену может ТОЛЬКО manager (admin смену не открывает,
  -- user/technician смены не требуют).
  if v_role is distinct from 'manager' then
    raise exception 'Открытие смены доступно только менеджеру'
      using errcode = '42501';
  end if;

  -- Открытие — только в рабочем окне [11:00, 17:30) Europe/Minsk.
  if not public.is_business_window() then
    raise exception 'Открыть смену можно с 11:00 до 17:30 (Europe/Minsk)'
      using errcode = '22023';
  end if;

  if not exists (
    select 1 from public.cash_registers where id = p_cash_register_id
  ) then
    raise exception 'Касса не найдена' using errcode = '22023';
  end if;

  -- Одна открытая смена на manager и на кассу (понятный текст ошибки;
  -- частичные уникальные индексы — второй барьер на уровне БД).
  if exists (
    select 1 from public.shifts
    where status = 'open'
      and (opened_by = auth.uid() or cash_register_id = p_cash_register_id)
  ) then
    raise exception 'Смена уже открыта (у вас или на этой кассе)'
      using errcode = '22023';
  end if;

  -- Инкассации нет: balance кассы не трогается, запись в cash_operations
  -- не создаётся. opened_by — только auth.uid().
  insert into public.shifts (
    cash_register_id, opened_by, opened_at, opening_balance, status
  ) values (
    p_cash_register_id, auth.uid(), now(), coalesce(p_opening_balance, 0), 'open'
  )
  returning * into v_shift;

  return v_shift;
end;
$$;

-- ---------------------------------------------------------------------
-- 6. RPC close_shift — свою смену; admin — аварийно любую открытую.
--    Разрешено в любое время суток (включая после 17:30).
-- ---------------------------------------------------------------------
drop function if exists public.close_shift(uuid, numeric);

create or replace function public.close_shift(
  p_shift_id        uuid,
  p_closing_balance numeric
)
returns public.shifts
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role  text := public.current_role_code();
  v_shift public.shifts;
begin
  if auth.uid() is null then
    raise exception 'Требуется авторизация' using errcode = '42501';
  end if;

  select * into v_shift from public.shifts where id = p_shift_id;

  if not found then
    raise exception 'Смена не найдена' using errcode = '22023';
  end if;

  -- manager закрывает только свою смену; admin — аварийно любую.
  if v_role <> 'admin' and v_shift.opened_by <> auth.uid() then
    raise exception 'Можно закрыть только свою смену' using errcode = '42501';
  end if;

  -- Нельзя закрыть уже закрытую смену.
  if v_shift.status <> 'open' then
    raise exception 'Смена уже закрыта' using errcode = '22023';
  end if;

  -- Деньги остаются в кассе: cash_operations не создаётся, balance
  -- кассы не меняется. closed_by — только auth.uid(), время — now().
  update public.shifts
    set status          = 'closed',
        closed_at       = now(),
        closed_by       = auth.uid(),
        closing_balance = coalesce(p_closing_balance, 0)
    where id = p_shift_id
    returning * into v_shift;

  return v_shift;
end;
$$;

-- ---------------------------------------------------------------------
-- 7. Grants/revokes для RPC: callable authenticated, недоступны anon
-- ---------------------------------------------------------------------
grant execute on function
  public.open_shift(uuid, numeric),
  public.close_shift(uuid, numeric)
to authenticated;

revoke execute on function
  public.open_shift(uuid, numeric),
  public.close_shift(uuid, numeric)
from anon;
