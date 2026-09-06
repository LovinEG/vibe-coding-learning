-- =====================================================================
-- Миграция: 20260906000001_add_profiles_avatar_url.sql
-- Описание: ШАГ 3.2 — колонка avatar_url в profiles для отображения
--           автора события в хронологии заказа (order_status_history).
-- Применение: Supabase SQL Editor (или supabase db push).
-- =====================================================================

alter table profiles
  add column if not exists avatar_url text;
