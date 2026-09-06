import { useEffect, useMemo, useState } from 'react'
import { getTransactions } from '../data/transactions'
import { getCashRegisters } from '../data/cashRegisters'
import { formatCurrency, formatDateTime } from '../lib/format'
import { usePermission } from '../lib/usePermission'
import './Page.css'

const SOURCE_LABELS = {
  payment: 'Оплата заказа',
  cash_operation: 'Кассовая операция',
}

const TYPE_LABELS = {
  income: 'Приход',
  expense: 'Расход',
}

const TYPE_BADGES = {
  income: 'transactions-page__type-badge--income',
  expense: 'transactions-page__type-badge--expense',
}

const SOURCE_BADGES = {
  payment: 'transactions-page__source-badge--payment',
  cash_operation: 'transactions-page__source-badge--cash-operation',
}

const TYPE_FILTERS = [
  { value: 'all', label: 'Все типы' },
  { value: 'income', label: 'Приход' },
  { value: 'expense', label: 'Расход' },
]

const SOURCE_FILTERS = [
  { value: 'all', label: 'Все источники' },
  { value: 'payment', label: 'Оплаты' },
  { value: 'cash_operation', label: 'Кассовые операции' },
]

function TransactionsAuditPage() {
  const [transactions, setTransactions] = useState([])
  const [cashRegisters, setCashRegisters] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState('all')
  const [sourceFilter, setSourceFilter] = useState('all')

  const canView = usePermission('finance.view')

  useEffect(() => {
    let cancelled = false

    async function loadTransactions() {
      try {
        const [transactionsResult, registersResult] = await Promise.all([
          getTransactions(),
          getCashRegisters(),
        ])

        if (!cancelled) {
          setTransactions(transactionsResult)
          setCashRegisters(registersResult)
        }
      } catch (err) {
        console.error('Не удалось загрузить транзакции:', err)

        if (!cancelled) {
          setError(
            'Не удалось загрузить журнал транзакций. Попробуйте обновить страницу.',
          )
        }
      } finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
    }

    loadTransactions()

    return () => {
      cancelled = true
    }
  }, [])

  // Сводные метрики считаются по всем загруженным транзакциям (без фильтров).
  const totals = useMemo(() => {
    const income = transactions
      .filter((item) => item.type === 'income')
      .reduce((sum, item) => sum + item.amount, 0)
    const expense = transactions
      .filter((item) => item.type === 'expense')
      .reduce((sum, item) => sum + item.amount, 0)

    return {
      count: transactions.length,
      income,
      expense,
      net: income - expense,
    }
  }, [transactions])

  const normalizedSearch = search.trim().toLowerCase()

  const filteredTransactions = useMemo(
    () =>
      transactions.filter((transaction) => {
        if (typeFilter !== 'all' && transaction.type !== typeFilter) {
          return false
        }

        if (sourceFilter !== 'all' && transaction.source !== sourceFilter) {
          return false
        }

        if (!normalizedSearch) {
          return true
        }

        const documentNumber = transaction.documentNumber ?? ''
        const clientName = transaction.clientName ?? ''

        return [
          SOURCE_LABELS[transaction.source] ?? '',
          transaction.cashRegisterName,
          transaction.category,
          transaction.operatorName ?? '',
          transaction.comment ?? '',
          documentNumber,
          clientName,
        ]
          .join(' ')
          .toLowerCase()
          .includes(normalizedSearch)
      }),
    [transactions, typeFilter, sourceFilter, normalizedSearch],
  )

  if (!canView) {
    return (
      <div className="page transactions-page">
        <h1 className="transactions-page__title">Транзакции и аудит</h1>
        <p className="transactions-page__error" role="alert">
          У вас нет прав для просмотра раздела «Транзакции и аудит».
        </p>
      </div>
    )
  }

  return (
    <div className="page transactions-page">
      <div className="transactions-page__head">
        <div>
          <h1 className="transactions-page__title">Транзакции и аудит</h1>
          <p className="transactions-page__hint">
            Единый журнал финансовых движений: оплаты по заказам и кассовые
            операции.
          </p>
        </div>
      </div>

      <div className="transactions-page__totals">
        <div className="transactions-page__total transactions-page__total--count">
          <span className="transactions-page__total-label">
            Всего транзакций
          </span>
          <span className="transactions-page__total-value">{totals.count}</span>
        </div>

        <div className="transactions-page__total transactions-page__total--income">
          <span className="transactions-page__total-label">Общий приход</span>
          <span className="transactions-page__total-value">
            +{formatCurrency(totals.income)}
          </span>
        </div>

        <div className="transactions-page__total transactions-page__total--expense">
          <span className="transactions-page__total-label">Общий расход</span>
          <span className="transactions-page__total-value">
            −{formatCurrency(totals.expense)}
          </span>
        </div>

        <div className="transactions-page__total transactions-page__total--net">
          <span className="transactions-page__total-label">
            Чистый денежный поток
          </span>
          <span className="transactions-page__total-value">
            {totals.net >= 0 ? '+' : '−'}
            {formatCurrency(Math.abs(totals.net))}
          </span>
        </div>
      </div>

      <input
        className="transactions-page__search"
        type="search"
        placeholder="Поиск по номеру заказа, клиенту, категории, оператору..."
        value={search}
        onChange={(event) => setSearch(event.target.value)}
        aria-label="Поиск по транзакциям"
      />

      <div className="transactions-page__filters">
        {TYPE_FILTERS.map((filter) => (
          <button
            key={filter.value}
            type="button"
            className={`transactions-page__filter${
              typeFilter === filter.value ? ' is-active' : ''
            }`}
            onClick={() => setTypeFilter(filter.value)}
          >
            {filter.label}
          </button>
        ))}

        {SOURCE_FILTERS.map((filter) => (
          <button
            key={filter.value}
            type="button"
            className={`transactions-page__filter${
              sourceFilter === filter.value ? ' is-active' : ''
            }`}
            onClick={() => setSourceFilter(filter.value)}
          >
            {filter.label}
          </button>
        ))}

        <select
          className="transactions-page__register-filter"
          value="all"
          aria-label="Баланс касс"
          disabled
        >
          <option value="all">Касс: {cashRegisters.length}</option>
          {cashRegisters.map((register) => (
            <option key={register.id} value={register.id}>
              {register.name}: {formatCurrency(register.balance)}
            </option>
          ))}
        </select>
      </div>

      {loading ? (
        <p className="transactions-page__empty">Загрузка...</p>
      ) : error ? (
        <p className="transactions-page__error" role="alert">
          {error}
        </p>
      ) : filteredTransactions.length === 0 ? (
        <p className="transactions-page__empty">Транзакции не найдены</p>
      ) : (
        <div className="transactions-page__table">
          <div className="transactions-page__table-header">
            <span>Дата / Время</span>
            <span>Источник / Тип</span>
            <span>Касса</span>
            <span>Категория / Детали</span>
            <span>Сумма</span>
            <span>Оператор</span>
            <span>Комментарий</span>
          </div>

          <ul className="transactions-page__list">
            {filteredTransactions.map((transaction) => (
              <li
                key={`${transaction.source}-${transaction.id}`}
                className="transactions-page__row"
              >
                <span className="transactions-page__datetime">
                  {formatDateTime(transaction.date)}
                </span>

                <span className="transactions-page__badges">
                  <span
                    className={`transactions-page__source-badge ${
                      SOURCE_BADGES[transaction.source] ?? ''
                    }`}
                  >
                    {SOURCE_LABELS[transaction.source] ?? transaction.source}
                  </span>
                  <span
                    className={`transactions-page__type-badge ${
                      TYPE_BADGES[transaction.type] ?? ''
                    }`}
                  >
                    {TYPE_LABELS[transaction.type] ?? transaction.type}
                  </span>
                </span>

                <span className="transactions-page__register">
                  {transaction.cashRegisterName}
                </span>

                <span className="transactions-page__category">
                  {transaction.category}
                  {transaction.source === 'payment' && transaction.documentNumber
                    ? ` · Заказ ${transaction.documentNumber}`
                    : null}
                  {transaction.source === 'payment' &&
                  !transaction.documentNumber &&
                  transaction.clientName
                    ? ` · ${transaction.clientName}`
                    : null}
                </span>

                <span
                  className={`transactions-page__amount ${
                    transaction.type === 'income'
                      ? 'transactions-page__amount--income'
                      : 'transactions-page__amount--expense'
                  }`}
                >
                  {transaction.type === 'income' ? '+' : '−'}
                  {formatCurrency(transaction.amount)}
                </span>

                <span className="transactions-page__user">
                  {transaction.operatorName ?? '—'}
                </span>

                <span className="transactions-page__comment">
                  {transaction.comment ?? '—'}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

export default TransactionsAuditPage