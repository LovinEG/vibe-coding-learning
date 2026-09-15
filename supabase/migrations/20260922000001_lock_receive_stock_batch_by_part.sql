-- =====================================================================
-- Миграция: 20260922000001_lock_receive_stock_batch_by_part.sql
-- Stage 4 / Phase 4B.1: сериализация прихода запчасти по parts.
--
-- Единственное функциональное изменение относительно Phase 3
-- (20260920000000_create_receive_stock_batch_rpc.sql): проверка
-- существования детали объединена с FOR UPDATE — теперь receive_stock_batch
-- берёт parts ... FOR UPDATE перед INSERT партии. Это замыкает locking
-- protocol: все три писателя склада (приход, списание, возврат)
-- сериализуются через одну точку — parts FOR UPDATE.
--
-- Что НЕ меняется:
--   * параметры RPC, validations, inventory.manage, shift-независимость;
--   * INSERT stock_batches / INSERT stock_movements — идентичны;
--   * SECURITY DEFINER, revoke/grant, comment, notify pgrst;
--   * старая миграция 20260920000000 — не переписывается (в production);
--   * frontend, finance, RLS таблиц, v_part_stock, Phase 4B migration.
--
-- Идемпотентность: drop function + create or replace + повторяемые
-- revoke/grant. Применение: Supabase SQL Editor (или supabase db push).
-- =====================================================================

-- Идемпотентность: пересоздаём функцию при повторном применении.
drop function if exists public.receive_stock_batch(uuid, uuid, integer, numeric);

create or replace function public.receive_stock_batch(
  p_part_id        uuid,
  p_supplier_id    uuid,
  p_quantity       integer,
  p_purchase_price numeric
)
returns public.stock_batches
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile_id uuid := auth.uid();
  v_batch      public.stock_batches;
begin
  -- 1. Только авторизованные пользователи CRM.
  if v_profile_id is null then
    raise exception 'Требуется авторизация'
      using errcode = '42501';
  end if;

  -- 2. Управление складом проверяет сервер, а не только UI
  --    (has_permission учитывает admin-обход).
  if not public.has_permission('inventory.manage') then
    raise exception 'Недостаточно прав: требуется inventory.manage'
      using errcode = '42501';
  end if;

  -- 3. Валидация аргументов.
  if p_part_id is null then
    raise exception 'Не указана запчасть'
      using errcode = '22023';
  end if;

  -- Проверка существования детали объединена с FOR UPDATE: блокируем
  -- строку parts до INSERT партии, чтобы сериализовать приход со
  -- списанием/возвратом (use_part_on_order / return_part_from_order
  -- берут ту же блокировку). PERFORM устанавливает FOUND, как SELECT INTO.
  perform 1
  from public.parts
  where id = p_part_id
  for update;

  if not found then
    raise exception 'Запчасть не найдена'
      using errcode = '22023';
  end if;

  if p_quantity is null or p_quantity <= 0 then
    raise exception 'Количество должно быть больше нуля'
      using errcode = '22023';
  end if;

  -- purchase_price: NULL — цена не указана (колонка nullable,
  -- StockBatchModal передаёт null при пустом поле). Если значение есть,
  -- оно не может быть отрицательным. Явная проверка = 'NaN'::numeric
  -- отсекает NaN (NaN в numeric проходит проверку знака, но ломает расчёты).
  if p_purchase_price is not null
     and (p_purchase_price < 0 or p_purchase_price = 'NaN'::numeric) then
    raise exception 'Закупочная цена не может быть отрицательной'
      using errcode = '22023';
  end if;

  if p_supplier_id is not null
     and not exists (
       select 1 from public.suppliers where id = p_supplier_id
     ) then
    raise exception 'Поставщик не найден'
      using errcode = '22023';
  end if;

  -- 4. Партия поставки.
  insert into public.stock_batches (
    part_id, supplier_id, quantity, purchase_price
  ) values (
    p_part_id, p_supplier_id, p_quantity, p_purchase_price
  )
  returning * into v_batch;

  -- 5. Движение 'income' по этой же партии: остаток v_part_stock
  --    считается из журнала, поэтому связь batch_id обязательна.
  --    profile_id — только auth.uid() (не приходит с клиента).
  insert into public.stock_movements (
    movement_type, part_id, quantity, profile_id,
    batch_id, supplier_id, purchase_price
  ) values (
    'income', p_part_id, p_quantity, v_profile_id,
    v_batch.id, p_supplier_id, p_purchase_price
  );

  -- 6. Возвращаем созданную партию (PostgREST отдаёт её как объект).
  return v_batch;
end;
$$;

comment on function public.receive_stock_batch(uuid, uuid, integer, numeric) is
  'Атомарный приход запчасти: партия stock_batches + движение income в одной транзакции. Берёт parts FOR UPDATE для сериализации со списанием/возвратом. Требует authenticated и inventory.manage.';

-- Вызов — только авторизованным пользователям CRM.
-- PostgreSQL по умолчанию выдаёт EXECUTE функции роли PUBLIC, поэтому
-- сначала отбираем право у PUBLIC (иначе grant authenticated ничего
-- не ограничивает), затем и у anon; authenticated — явно разрешаем.
revoke all on function public.receive_stock_batch(uuid, uuid, integer, numeric) from public;
revoke all on function public.receive_stock_batch(uuid, uuid, integer, numeric) from anon;
grant execute on function public.receive_stock_batch(uuid, uuid, integer, numeric) to authenticated;

-- ---------------------------------------------------------------------
-- Проверка после применения (выполнить вручную в SQL Editor):
--
--   -- 1) Функция пересоздана (prosrc содержит FOR UPDATE):
--   select proname, prosecdef
--   from pg_proc
--   where proname = 'receive_stock_batch';
--
--   -- 2) Приход под блокировкой: параллельно запустите use_part_on_order
--   --    и receive_stock_batch для одной детали — второй ждёт первого.
-- ---------------------------------------------------------------------

-- PostgREST: сброс кэша схемы.
notify pgrst, 'reload schema';