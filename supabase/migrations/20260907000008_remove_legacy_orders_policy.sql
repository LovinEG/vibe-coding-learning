-- =====================================================================
-- Миграция: 20260907000008_remove_legacy_orders_policy.sql
-- Описание: удаление legacy permissive-политики "Allow all operations
--           for orders" на public.orders (cmd = ALL, qual = true,
--           with_check = true). Из-за permissive OR она обходила
--           RBAC + shift-политики, созданные миграцией 000007.
--           Политика не создаётся ни одной миграцией репозитория —
--           она появилась в production вне tracked-миграций.
--
-- Миграция делает ТОЛЬКО drop этой политики: новые защищённые policies
-- из 000007, RPC, grants, frontend и другие таблицы не затрагиваются.
--
-- Применение: Supabase SQL Editor (или supabase db push).
-- =====================================================================

drop policy if exists "Allow all operations for orders" on public.orders;
