-- =====================================================================
-- Миграция: 20260919000000_create_part_stock_view.sql
-- Stage 4 / Phase 2: единый расчёт текущего остатка склада.
--
-- Источник истины по текущему остатку — журнал public.stock_movements:
--   income + return - expense - defect
-- VIEW public.v_part_stock отдаёт ровно одну строку на каждую parts.id
-- (деталь без движений получает остаток 0). Слой данных
-- src/data/inventory.js читает остаток из этого VIEW вместо прежнего
-- sum(stock_batches.quantity).
--
-- Что НЕ меняется:
--   * приход (stock_batches + income-движение) — как было;
--   * добавление/удаление детали в заказе (order_parts) — как было;
--   * stock_batches остаётся источником партий и закупочных цен,
--     но больше не является источником текущего остатка;
--   * parts.stock_quantity не используется и НЕ удаляется (deprecated);
--   * RLS и политики базовых таблиц;
--   * frontend DTO (totalStock / minStock / retailPrice) и UI;
--   * timeline, finance, права.
--
-- Идемпотентность: create or replace view + повторяемые revoke/grant.
-- Применение: Supabase SQL Editor (или supabase db push).
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. VIEW с текущим остатком по каждой запчасти.
--    left join намеренный: деталь без движений остаётся в выборке.
--    case ... else 0: строка left join без движений даёт NULL —
--    срабатывает else и остаток получается 0; типы движений ограничены
--    CHECK-констрейнтом ('income','expense','return','defect').
--    sum(integer) в PostgreSQL возвращает bigint — приводим к integer,
--    как ожидает frontend (сравнение с parts.min_stock, вывод «шт.»).
-- ---------------------------------------------------------------------
create or replace view public.v_part_stock as
select
  p.id as part_id,
  coalesce(
    sum(
      case m.movement_type
        when 'income'  then  m.quantity
        when 'return'  then  m.quantity
        when 'expense' then -m.quantity
        when 'defect'  then -m.quantity
        else 0
      end
    ),
    0
  )::integer as quantity_on_hand
from public.parts p
left join public.stock_movements m on m.part_id = p.id
group by p.id;

comment on view public.v_part_stock is
  'Текущий остаток запчасти из журнала stock_movements (income + return - expense - defect). Деталь без движений = 0.';

comment on column public.v_part_stock.quantity_on_hand is
  'Рассчитанный текущий остаток. Не parts.stock_quantity — та колонка deprecated и не поддерживается.';

-- ---------------------------------------------------------------------
-- 2. Доступ. VIEW — не таблица: default privileges Supabase (grant all
--    on tables) на неё не распространяются, поэтому права выдаются явно,
--    иначе .from('v_part_stock') вернёт 42501.
--    RLS базовых таблиц при этом не меняется: чтение parts и
--    stock_movements и так открыто роли authenticated политиками
--    using (true), поэтому VIEW не раскрывает новых данных.
--    anon явно лишается доступа — CRM работает только для авторизованных.
-- ---------------------------------------------------------------------
revoke all on public.v_part_stock from anon;
grant select on public.v_part_stock to authenticated;
grant select on public.v_part_stock to service_role;

-- ---------------------------------------------------------------------
-- 3. PostgREST: сброс кэша схемы, чтобы .from('v_part_stock') стал
--    доступен сразу после применения миграции.
-- ---------------------------------------------------------------------
notify pgrst, 'reload schema';