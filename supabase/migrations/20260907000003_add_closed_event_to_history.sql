-- =====================================================================
-- Миграция: 20260907000003_add_closed_event_to_history.sql
-- Описание: новый код события 'closed' в order_status_history —
--           записывается RPC атомарного закрытия заказа.
-- Применение: Supabase SQL Editor (или supabase db push).
-- =====================================================================

alter table order_status_history
  drop constraint if exists order_status_history_status_check;

alter table order_status_history
  add constraint order_status_history_status_check
  check (status in (
    'created', 'assigned', 'diagnosed', 'part_added', 'service_added',
    'approval_sent', 'approved', 'rejected',
    'repaired', 'paid', 'issued', 'updated', 'closed'
  ));
