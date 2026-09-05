import { useEffect, useMemo, useState } from 'react'
import PaymentModal from '../components/modals/PaymentModal'
import Button from '../components/ui/Button'
import { getPayments } from '../data/payments'
import { getCashRegisters } from '../data/cashRegisters'
import { formatCurrency, formatDateTime } from '../lib/format'
import { usePermission } from '../lib/usePermission'
import './Page.css'

const TYPE_LABELS = {
  income: 'Приход',
  expense: 'Расход',
}

const TYPE_BADGES = {
  income: 'payments-page__type-badge--income',
  expense: 'payments-page__type-badge--expense',
}

const PAYMENT_METHOD_LABELS = {
  cash: 'Наличные',
  card: 'Карта',
  transfer: 'Перевод',
}

const TYPE_FILTERS = [
  { value: 'all', label: 'Все операции' },
  { value: 'income', label: 'Приход' },
  { value: 'expense', label: 'Расход' },
]

function PaymentsPage() {
  const [payments, setPayments] = useState([])
  const [cashRegisters, setCashRegisters] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState('all')
  const [registerFilter, setRegisterFilter] = useState('all')
  const [modalOpen, setModalOpen] = useState(false)

  // Раздел «Финансы» виден по finance.view, проведение платежей — finance.manage.
  const canView = usePermission('finance.view')
  const canManage = usePermission('finance.manage')

  useEffect(() => {
    let cancelled = false

    async function loadPayments() {
      try {
        const [paymentsResult, registersResult] = await Promise.all([
          getPayments(),
          getCashRegisters(),
        ])

        if (!cancelled) {
          setPayments(paymentsResult)
          setCashRegisters(registersResult)
        }
      } catch (err) {
        console.error('Не удалось загрузить платежи:', err)

        if (!cancelled) {
          setError(
            'Не удалось загрузить платежи. Попробуйте обновить страницу.',
          )
        }
      } finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
    }

    loadPayments()

    return () => {
      cancelled = true
    }
  }, [])

  function openModal() {
    setModalOpen(true)
  }

  function closeModal() {
    setModalOpen(false)
  }

  async function refreshPayments() {
    try {
      setError(null)
      setPayments(await getPayments())
    } catch (err) {
      console.error('Не удалось обновить журнал платежей:', err)
      setError('Не удалось обновить журнал платежей.')
    }
  }

  // Итоги периода считаются по всем загруженным платежам (без фильтров).
  const totals = useMemo(() => {
    const income = payments
      .filter((payment) => payment.type === 'income')
      .reduce((sum, payment) => sum + payment.amount, 0)
    const expense = payments
      .filter((payment) => payment.type === 'expense')
      .reduce((sum, payment) => sum + payment.amount, 0)

    return { income, expense, net: income - expense }
  }, [payments])

  const normalizedSearch = search.trim().toLowerCase()

  const filteredPayments = useMemo(
    () =>
      payments.filter((payment) => {
        if (typeFilter !== 'all' && payment.type !== typeFilter) {
          return false
        }

        if (
          registerFilter !== 'all' &&
          payment.cashRegisterId !== registerFilter
        ) {
          return false
        }

        if (!normalizedSearch) {
          return true
        }

        return (
          (payment.orderNumber ?? '').toLowerCase().includes(normalizedSearch) ||
          (payment.clientName ?? '').toLowerCase().includes(normalizedSearch) ||
          (payment.comment ?? '').toLowerCase().includes(normalizedSearch)
        )
      }),
    [payments, typeFilter, registerFilter, normalizedSearch],
  )

  if (!canView) {
    return (
      <div className="page payments-page">
        <h1 className="payments-page__title">Оплаты и платежи</h1>
        <p className="payments-page__empty">
          Недостаточно прав для просмотра раздела «Финансы».
        </p>
      </div>
    )
  }

  return (
    <div className="page payments-page">
      <header className="payments-page__head">
        <div>
          <h1 className="payments-page__title">Оплаты и платежи</h1>
          <p className="payments-page__hint">
            Журнал приходов и расходов по кассам и счетам.
          </p>
        </div>
        {canManage ? (
          <Button type="button" onClick={openModal}>
            + Внести платеж
          </Button>
        ) : null}
      </header>

      <div className="payments-page__totals">
        <div className="payments-page__total payments-page__total--income">
          <span className="payments-page__total-label">Общий приход</span>
          <span className="payments-page__total-value">
            +{formatCurrency(totals.income)}
          </span>
        </div>
        <div className="payments-page__total payments-page__total--expense">
          <span className="payments-page__total-label">Общий расход</span>
          <span className="payments-page__total-value">
            −{formatCurrency(totals.expense)}
          </span>
        </div>
        <div className="payments-page__total payments-page__total--net">
          <span className="payments-page__total-label">Чистый поток</span>
          <span className="payments-page__total-value">
            {totals.net >= 0 ? '+' : '−'}
            {formatCurrency(Math.abs(totals.net))}
          </span>
        </div>
      </div>

      <input
        className="payments-page__search"
        type="search"
        placeholder="Поиск по номеру заказа, клиенту или комментарию..."
        value={search}
        onChange={(event) => setSearch(event.target.value)}
        aria-label="Поиск платежей"
      />

      <div
        className="payments-page__filters"
        role="group"
        aria-label="Фильтр по типу операции"
      >
        {TYPE_FILTERS.map((filter) => (
          <button
            key={filter.value}
            type="button"
            className={
              typeFilter === filter.value
                ? 'payments-page__filter is-active'
                : 'payments-page__filter'
            }
            onClick={() => setTypeFilter(filter.value)}
          >
            {filter.label}
          </button>
        ))}
        <select
          className="payments-page__register-filter"
          value={registerFilter}
          onChange={(event) => setRegisterFilter(event.target.value)}
          aria-label="Фильтр по кассе"
        >
          <option value="all">Все кассы</option>
          {cashRegisters.map((register) => (
            <option key={register.id} value={register.id}>
              {register.name}
            </option>
          ))}
        </select>
      </div>

      {loading ? (
        <p className="payments-page__empty">Загрузка...</p>
      ) : error ? (
        <p className="payments-page__error" role="alert">
          {error}
        </p>
      ) : filteredPayments.length === 0 ? (
        <p className="payments-page__empty">Платежи не найдены</p>
      ) : (
        <div className="payments-page__table">
          <div className="payments-page__table-header">
            <span>Дата / Время</span>
            <span>Тип</span>
            <span>Касса</span>
            <span>Сумма</span>
            <span>Способ оплаты</span>
            <span>Заказ / Клиент</span>
            <span>Исполнитель</span>
            <span>Комментарий</span>
          </div>

          <ul className="payments-page__list">
            {filteredPayments.map((payment) => (
              <li key={payment.id} className="payments-page__row">
                <span className="payments-page__datetime">
                  {formatDateTime(payment.createdAt)}
                </span>
                <span>
                  <span
                    className={`payments-page__type-badge ${
                      TYPE_BADGES[payment.type] ?? ''
                    }`}
                  >
                    {TYPE_LABELS[payment.type] ?? payment.type}
                  </span>
                </span>
                <span className="payments-page__register">
                  {payment.cashRegisterName}
                </span>
                <span
                  className={`payments-page__amount ${
                    payment.type === 'income'
                      ? 'payments-page__amount--income'
                      : 'payments-page__amount--expense'
                  }`}
                >
                  {payment.type === 'income' ? '+' : '−'}
                  {formatCurrency(payment.amount)}
                </span>
                <span className="payments-page__method">
                  {PAYMENT_METHOD_LABELS[payment.paymentMethod] ??
                    payment.paymentMethod}
                </span>
                <span className="payments-page__order-client">
                  {payment.orderNumber
                    ? `Заказ ${payment.orderNumber}`
                    : payment.clientName ?? '—'}
                </span>
                <span className="payments-page__user">
                  {payment.createdByName ?? '—'}
                </span>
                <span className="payments-page__comment">
                  {payment.comment ?? '—'}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <PaymentModal
        // key меняется только при открытии/закрытии — во время ввода
        // в форме стабилен (не пересоздаёт компонент).
        key={modalOpen ? 'open' : 'closed'}
        open={modalOpen}
        onClose={closeModal}
        onSaved={refreshPayments}
      />
    </div>
  )
}

export default PaymentsPage