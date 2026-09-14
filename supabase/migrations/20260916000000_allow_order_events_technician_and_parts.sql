-- =====================================================================
-- Миграция: 20260916000000_allow_order_events_technician_and_parts.sql
-- Stage 3 (продолжение): таймлайну заказа нужны системные события по
-- мастеру и деталям. Миграция 20260915000000_create_order_events.sql
-- уже применена на production и НЕ переписывается — здесь точечно
-- пересоздаётся только INSERT-политика с расширенным списком типов.
--
-- Применение: Supabase SQL Editor (или supabase db push).
-- Идемпотентно: drop policy if exists + create policy.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Разрешаем приложению писать системные события таймлайна:
--    technician_assigned (назначение/смена мастера),
--    part_added (добавление детали), part_removed (удаление детали).
--
--    Все проверки из 20260915000000 сохраняются без ослабления:
--      * auth.uid() = author_id — автором может быть только сам
--        текущий пользователь (подлог автора невозможен);
--      * public.work_shift_write_allowed() — shift guard, тот же, что у
--        orders / order_status_history / order_parts (manager — только
--        в смене, остальные роли работают как раньше);
--      * type = 'comment' — внутренние комментарии сотрудников как были;
--      * bootstrap-типы order_created / status_changed (создание заказа
--        и смена статуса) — как были.
-- ---------------------------------------------------------------------
drop policy if exists "Allow authenticated to insert order events" on public.order_events;

create policy "Allow authenticated to insert order events"
  on public.order_events for insert to authenticated
  with check (
    auth.uid() = author_id
    and public.work_shift_write_allowed()
    and (
      type = 'comment'
      or type in (
        'order_created',
        'status_changed',
        'technician_assigned',
        'part_added',
        'part_removed'
      )
    )
  );

-- ---------------------------------------------------------------------
-- 2. Список типов менять не нужно: constraint order_events_type_check
--    из 20260915000000 уже содержит technician_assigned, part_added и
--    part_removed. Дублировать ALTER в новой миграции не требуется.
--
-- 3. SELECT-политика и запрет UPDATE/DELETE (revoke) не меняются:
--    события таймлайна остаются неизменяемыми, а сбой записи события
--    не влияет на основную операцию приложения (ошибка логируется на
--    фронтенде через console.error).
-- ---------------------------------------------------------------------