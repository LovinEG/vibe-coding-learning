-- =====================================================================
-- Миграция: 20260906000005_add_devices_imei.sql
-- Описание: ШАГ 2.1/3.1 — отдельная колонка imei для устройств
--           (серийный номер и IMEI теперь хранятся независимо,
--           оба участвуют в мульти-поиске).
-- Применение: Supabase SQL Editor (или supabase db push).
-- =====================================================================

alter table devices
  add column if not exists imei text;

-- Поиск устройств по IMEI.
create index if not exists idx_devices_imei on devices (imei);
