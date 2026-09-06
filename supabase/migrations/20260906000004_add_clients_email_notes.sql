-- =====================================================================
-- Миграция: 20260906000004_add_clients_email_notes.sql
-- Описание: ШАГ 2.1 — расширенный профиль клиента: email, notes,
--           updated_at (для сортировки «недавно обновлённые»).
-- Применение: Supabase SQL Editor (или supabase db push).
-- =====================================================================

alter table clients
  add column if not exists email      text,
  add column if not exists notes      text,
  add column if not exists updated_at timestamptz default now();

-- Поиск клиентов по имени / телефону / email.
create index if not exists idx_clients_name on clients (name);
create index if not exists idx_clients_phone on clients (phone);
