-- =====================================================================
-- Миграция: 20260915000000_create_order_events.sql
-- Stage 3: Order Timeline — таблица событий и внутренних комментариев
-- заказа. Не трогает order_status_history: старая история живёт
-- параллельно, order_events — новая основа таймлайна карточки заказа.
-- =====================================================================

create table if not exists public.order_events (
  id         uuid        primary key default gen_random_uuid(),
  order_id   uuid        not null references public.orders (id) on delete cascade,
  type       text        not null,
  message    text,
  -- FK именно на profiles (как order_status_history.created_by и
  -- order_parts.added_by): PostgREST строит embed-связи только по прямым
  -- FK, поэтому author:profiles!author_id(...) в getOrderEvents работает.
  -- profiles.id сам references auth.users(id) (1:1, PK) → author_id
  -- по-прежнему всегда валидный auth user, id совпадает с auth.uid().
  -- on delete set null — как в проекте: событие переживает удаление автора.
  author_id  uuid        references public.profiles (id) on delete set null,
  metadata   jsonb       not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- Индексы: выборка таймлайна по заказу + сортировка «новые сверху».
create index if not exists idx_order_events_order_id
  on public.order_events (order_id);

create index if not exists idx_order_events_order_created
  on public.order_events (order_id, created_at desc);

-- Допустимые типы: comment (сотрудники) + системные события.
alter table public.order_events
  drop constraint if exists order_events_type_check;

alter table public.order_events
  add constraint order_events_type_check
  check (type in (
    'comment',
    'order_created',
    'status_changed',
    'approval_sent',
    'approved',
    'rejected',
    'price_changed',
    'technician_assigned',
    'part_added',
    'part_removed',
    'payment_added',
    'order_closed'
  ));

-- ---------------------------------------------------------------------
-- RLS в стиле проекта (зеркало orders из 20260907000007):
--   SELECT  — authenticated, «у кого есть доступ к заказу»: политика
--             проверяет существование связанного заказа (те же роли,
--             что читают orders).
--   INSERT  — authenticated + shift guard: comment — для сотрудников,
--             работающих с заказами; вручную через API разрешены только
--             два bootstrap-системных типа (order_created /
--             status_changed), которые пишет само приложение при
--             создании заказа и смене статуса. Остальные системные
--             типы вручную создать нельзя.
--   UPDATE/DELETE — политик нет: RLS запрещает изменение и удаление
--             событий через UI/API.
-- ---------------------------------------------------------------------
alter table public.order_events enable row level security;

drop policy if exists "Allow authenticated to read order events" on public.order_events;
create policy "Allow authenticated to read order events"
  on public.order_events for select to authenticated
  using (
    exists (
      select 1
      from public.orders o
      where o.id = order_events.order_id
    )
  );

drop policy if exists "Allow authenticated to insert order events" on public.order_events;
create policy "Allow authenticated to insert order events"
  on public.order_events for insert to authenticated
  with check (
    auth.uid() = author_id
    and public.work_shift_write_allowed()
    and (
      type = 'comment'
      or type in ('order_created', 'status_changed')
    )
  );

-- Изменение/удаление событий запрещено (RLS без политик + явный revoke).
revoke update, delete on public.order_events from authenticated, anon;
