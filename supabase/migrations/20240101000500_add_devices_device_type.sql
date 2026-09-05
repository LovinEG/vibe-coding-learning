-- =====================================================================
-- Миграция: 20240101000500_add_devices_device_type.sql
-- Описание: ШАГ 4 — тип устройства для таблицы devices + безопасное
--           удаление устройств, привязанных к заказам.
-- Применение: Supabase SQL Editor (или supabase db push).
-- =====================================================================

-- 1. Тип устройства (Смартфон / Ноутбук / Планшет / Прочее).
--    Nullable: устройства, созданные раньше, остаются без типа —
--    интерфейс покажет «—».
alter table devices add column if not exists device_type text;

-- 2. FK orders.device_id -> devices.id создавался без ON DELETE,
--    поэтому удаление устройства с заказами падало бы с FK-ошибкой.
--    Пересоздаём с ON DELETE SET NULL: заказ сохраняется, device_id
--    обнуляется, а getOrders() покажет легаси-текстовое поле device.
--    (orders_device_id_fkey — стандартное автоимя Postgres для FK
--    на колонке device_id.)
alter table orders drop constraint if exists orders_device_id_fkey;

alter table orders
  add constraint orders_device_id_fkey
  foreign key (device_id) references devices (id)
  on delete set null;