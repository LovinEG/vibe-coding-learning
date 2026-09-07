-- Смены фиксируются кассовыми операциями: маркеры «Открытие смены» /
-- «Закрытие смены» проводятся с нулевой суммой (итоговый остаток и
-- стартовый баланс пишутся в комментарий, расхождения — отдельными
-- корректирующими записями). Ослабляем проверку суммы до >= 0.
ALTER TABLE cash_operations DROP CONSTRAINT IF EXISTS cash_operations_amount_check;
ALTER TABLE cash_operations ADD CONSTRAINT cash_operations_amount_check CHECK (amount >= 0);
