import { getPayments } from './payments'
import { getCashOperations } from './cashOperations'

const SOURCE_PAYMENT = 'payment'
const SOURCE_CASH_OPERATION = 'cash_operation'

const PAYMENT_METHOD_LABELS = {
  cash: 'Наличные',
  card: 'Карта',
  transfer: 'Перевод',
}

// Универсальная структура транзакции — единое окно для платежей и кассовых
// операций. Поля страницы «Транзакции и аудит» и фильтры опираются на этот формат.
function mapPaymentToTransaction(payment) {
  return {
    id: payment.id,
    date: payment.createdAt,
    type: payment.type,
    amount: payment.amount,
    category: PAYMENT_METHOD_LABELS[payment.paymentMethod] ?? payment.paymentMethod,
    cashRegisterName: payment.cashRegisterName,
    source: SOURCE_PAYMENT,
    documentNumber: payment.orderNumber ?? null,
    operatorName: payment.createdByName ?? null,
    comment: payment.comment ?? null,
    clientName: payment.clientName ?? null,
  }
}

function mapCashOperationToTransaction(operation) {
  return {
    id: operation.id,
    date: operation.createdAt,
    type: operation.type,
    amount: operation.amount,
    category: operation.category,
    cashRegisterName: operation.cashRegisterName,
    source: SOURCE_CASH_OPERATION,
    documentNumber: null,
    operatorName: operation.createdByName ?? null,
    comment: operation.comment ?? null,
    clientName: null,
  }
}

// Объединённый журнал транзакций: платежи + кассовые операции, свежие сверху.
export async function getTransactions() {
  const [payments, operations] = await Promise.all([
    getPayments(),
    getCashOperations(),
  ])

  const transactions = [
    ...payments.map(mapPaymentToTransaction),
    ...operations.map(mapCashOperationToTransaction),
  ]

  return transactions.sort(
    (a, b) => new Date(b.date) - new Date(a.date),
  )
}