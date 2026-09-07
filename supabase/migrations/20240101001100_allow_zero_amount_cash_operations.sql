-- Смены фиксируются кассовыми операциями: маркер «Закрытие смены» проводится
-- с нулевой суммой (итоговый остаток пишется в комментарий), а открытие смены
-- возможно с нулевым стартовым остатком. Ослабляем проверку суммы до >= 0.
alter table cash_operations
  drop constraint if exists cash_operations_amount_check;

alter table cash_operations
  add constraint cash_operations_amount_check check (amount >= 0);
