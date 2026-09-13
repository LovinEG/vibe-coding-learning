-- Снапшот суммы согласования: сумма последней сметы, отправленной клиенту.
-- Пишется при переходе в approval_status = pending («Отправить клиенту» /
-- повторная отправка); при approved / rejected остаётся без изменений.
-- Отдельный timestamp не нужен: дата и автор изменений достоверно есть
-- в order_status_history (события approval_sent / approved / rejected).
alter table public.orders
  add column if not exists approval_price numeric(12,2);

comment on column public.orders.approval_price is
  'Сумма последней сметы, отправленной клиенту на согласование (snapshot orders.price на момент отправки). NULL — согласование ещё не отправлялось (legacy).';
