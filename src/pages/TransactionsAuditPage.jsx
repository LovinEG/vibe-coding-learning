import { useEffect, useMemo, useState } from 'react'
import { getTransactions } from '../data/transactions'
import { getCashRegisters } from '../data/cashRegisters'
import { getOrderPartsByOrderIds } from '../data/orderParts'
import {
  SHIFT_WITHDRAWAL_CATEGORY,
  SHIFT_SURPLUS_CATEGORY,
  SHIFT_SHORTAGE_CATEGORY,
} from '../data/cashOperations'
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

// Период финансового отчёта (влияет и на KPI, и на журнал).
const PERIOD_FILTERS = [
  { value: 'all', label: 'Всё время' },
  { value: 'today', label: 'Сегодня' },
  { value: 'week', label: 'Эта неделя' },
  { value: 'month', label: 'Этот месяц' },
]

// Границы периодов — та же семантика, что на дашборде (неделя с понедельника).
function startOfDay(date) {
  const copy = new Date(date)
  copy.setHours(0, 0, 0, 0)
  return copy
}

function startOfWeek(date) {
  const copy = startOfDay(date)
  const day = (copy.getDay() + 6) % 7 // Пн = 0 ... Вс = 6
  copy.setDate(copy.getDate() - day)
  return copy
}

function startOfMonth(date) {
  const copy = startOfDay(date)
  copy.setDate(1)
  return copy
}

function getPeriodStart(value, now) {
  if (value === 'today') {
    return startOfDay(now)
  }
  if (value === 'week') {
    return startOfWeek(now)
  }
  if (value === 'month') {
    return startOfMonth(now)
  }
  return null
}

function TransactionsAuditPage() {
  const [transactions, setTransactions] = useState([])
  const [cashRegisters, setCashRegisters] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [search, setSearch] = useState('')
  const [periodFilter, setPeriodFilter] = useState('all')
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

  // Транзакции выбранного периода — основа и для KPI, и для журнала ниже.
  const periodFiltered = useMemo(() => {
    const periodStart = getPeriodStart(periodFilter, new Date())

    if (!periodStart) {
      return transactions
    }

    return transactions.filter(
      (transaction) => new Date(transaction.date) >= periodStart,
    )
  }, [transactions, periodFilter])

  // KPI финансового отчёта по выбранному периоду (без учёта фильтров
  // типа/источника/поиска — так раньше считались общие итоги):
  // выручка — только income-платежи с привязкой к заказу (order_id);
  // прочие приходы — income без order_id и income кассовых операций;
  // расходы — все expense из payments и cash_operations.
  const kpis = useMemo(() => {
    let revenue = 0
    let otherIncome = 0
    let expense = 0

    for (const transaction of periodFiltered) {
      if (transaction.type === 'income') {
        if (transaction.source === 'payment' && transaction.orderId) {
          revenue += transaction.amount
        } else {
          otherIncome += transaction.amount
        }
      } else if (transaction.type === 'expense') {
        expense += transaction.amount
      }
    }

    return {
      revenue,
      otherIncome,
      expense,
      net: revenue + otherIncome - expense,
    }
  }, [periodFiltered])

  // Уникальные заказы, давшие выручку за период (себестоимость заказа
  // учитывается один раз, даже если по нему было несколько платежей).
  const revenueOrderIds = useMemo(
    () => [
      ...new Set(
        periodFiltered
          .filter(
            (transaction) =>
              transaction.type === 'income' &&
              transaction.source === 'payment' &&
              transaction.orderId,
          )
          .map((transaction) => transaction.orderId),
      ),
    ],
    [periodFiltered],
  )

  const revenueOrderIdsKey = revenueOrderIds.join('|')

  // Себестоимость деталей по заказам выручки. purchase_price IS NULL —
  // легаси-строки: в себестоимость не попадают, считаются отдельно
  // (предупреждение о возможном завышении прибыли).
  const [orderPartsCost, setOrderPartsCost] = useState(null)

  useEffect(() => {
    let cancelled = false
    setOrderPartsCost(null)

    async function loadOrderPartsCost() {
      const ids = revenueOrderIdsKey ? revenueOrderIdsKey.split('|') : []

      try {
        const rows = await getOrderPartsByOrderIds(ids)

        if (cancelled) {
          return
        }

        let cost = 0
        let unknownCount = 0

        for (const row of rows) {
          const qty = Number(row.quantity) || 0

          if (row.purchase_price === null || row.purchase_price === undefined) {
            unknownCount += 1
            continue
          }

          cost += Number(row.purchase_price) * qty
        }

        setOrderPartsCost({ cost, unknownCount })
      } catch (err) {
        console.error('Не удалось загрузить себестоимость деталей:', err)

        if (!cancelled) {
          setOrderPartsCost({ cost: null, unknownCount: 0 })
        }
      }
    }

    loadOrderPartsCost()

    return () => {
      cancelled = true
    }
  }, [revenueOrderIdsKey])

  // Прибыль: валовая (выручка − себестоимость деталей) и операционная
  // (валовая − кассовые расходы без системных категорий смен − expense
  // payments). Прочие income в прибыль не входят — они в KPI денежного
  // потока. Пока себестоимость не загружена, KPI показывают «—».
  const profitKpis = useMemo(() => {
    if (!orderPartsCost || orderPartsCost.cost === null) {
      return null
    }

    const systemCategories = [
      SHIFT_WITHDRAWAL_CATEGORY,
      SHIFT_SURPLUS_CATEGORY,
      SHIFT_SHORTAGE_CATEGORY,
    ]

    const operationalCashExpense = periodFiltered
      .filter(
        (transaction) =>
          transaction.type === 'expense' &&
          transaction.source === 'cash_operation' &&
          !systemCategories.includes(transaction.category),
      )
      .reduce((sum, transaction) => sum + transaction.amount, 0)

    const paymentExpense = periodFiltered
      .filter(
        (transaction) =>
          transaction.type === 'expense' && transaction.source === 'payment',
      )
      .reduce((sum, transaction) => sum + transaction.amount, 0)

    const partsCost = orderPartsCost.cost
    const grossProfit = kpis.revenue - partsCost
    const operationalExpense = operationalCashExpense + paymentExpense

    return {
      partsCost,
      grossProfit,
      operationalExpense,
      operatingProfit: grossProfit - operationalExpense,
    }
  }, [kpis, periodFiltered, orderPartsCost])

  const normalizedSearch = search.trim().toLowerCase()

  const filteredTransactions = useMemo(
    () =>
      periodFiltered.filter((transaction) => {
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
    [periodFiltered, typeFilter, sourceFilter, normalizedSearch],
  )

  if (!canView) {
    return (
      <div className="page transactions-page">
        <h1 className="transactions-page__title">Финансовый отчёт</h1>
        <p className="transactions-page__error" role="alert">
          У вас нет прав для просмотра раздела «Финансовый отчёт».
        </p>
      </div>
    )
  }

  return (
    <div className="page transactions-page">
      <div className="transactions-page__head">
        <div>
          <h1 className="transactions-page__title">Финансовый отчёт</h1>
          <p className="transactions-page__hint">
            Движение денег: выручка по заказам, прочие приходы и расходы касс.
          </p>
        </div>
      </div>

      <div className="transactions-page__totals">
        <div className="transactions-page__total transactions-page__total--income">
          <span className="transactions-page__total-label">
            Выручка (оплаты заказов)
          </span>
          <span className="transactions-page__total-value">
            +{formatCurrency(kpis.revenue)}
          </span>
        </div>

        <div className="transactions-page__total transactions-page__total--income">
          <span className="transactions-page__total-label">Прочие приходы</span>
          <span className="transactions-page__total-value">
            +{formatCurrency(kpis.otherIncome)}
          </span>
        </div>

        <div className="transactions-page__total transactions-page__total--expense">
          <span className="transactions-page__total-label">Расходы</span>
          <span className="transactions-page__total-value">
            −{formatCurrency(kpis.expense)}
          </span>
        </div>

        <div className="transactions-page__total transactions-page__total--net">
          <span className="transactions-page__total-label">
            Чистый денежный поток
          </span>
          <span className="transactions-page__total-value">
            {kpis.net >= 0 ? '+' : '−'}
            {formatCurrency(Math.abs(kpis.net))}
          </span>
        </div>
      </div>

      <div className="transactions-page__totals">
        <div className="transactions-page__total transactions-page__total--expense">
          <span className="transactions-page__total-label">
            Себестоимость деталей
          </span>
          <span className="transactions-page__total-value">
            {profitKpis ? `−${formatCurrency(profitKpis.partsCost)}` : '—'}
          </span>
        </div>

        <div className="transactions-page__total transactions-page__total--net">
          <span className="transactions-page__total-label">
            Валовая прибыль
          </span>
          <span className="transactions-page__total-value">
            {profitKpis
              ? `${profitKpis.grossProfit >= 0 ? '+' : '−'}${formatCurrency(
                  Math.abs(profitKpis.grossProfit),
                )}`
              : '—'}
          </span>
        </div>

        <div className="transactions-page__total transactions-page__total--expense">
          <span className="transactions-page__total-label">
            Операционные расходы
          </span>
          <span className="transactions-page__total-value">
            {profitKpis ? `−${formatCurrency(profitKpis.operationalExpense)}` : '—'}
          </span>
        </div>

        <div className="transactions-page__total transactions-page__total--net">
          <span className="transactions-page__total-label">
            Операционная прибыль
          </span>
          <span className="transactions-page__total-value">
            {profitKpis
              ? `${profitKpis.operatingProfit >= 0 ? '+' : '−'}${formatCurrency(
                  Math.abs(profitKpis.operatingProfit),
                )}`
              : '—'}
          </span>
        </div>
      </div>

      {orderPartsCost?.unknownCount > 0 ? (
        <p className="transactions-page__cost-warning" role="status">
          Есть {orderPartsCost.unknownCount} позиций без зафиксированной
          себестоимости. Расчёт прибыли может быть завышен.
        </p>
      ) : null}

      <input
        className="transactions-page__search"
        type="search"
        placeholder="Поиск по номеру заказа, клиенту, категории, оператору..."
        value={search}
        onChange={(event) => setSearch(event.target.value)}
        aria-label="Поиск по операциям"
      />

      <div className="transactions-page__filters">
        {PERIOD_FILTERS.map((filter) => (
          <button
            key={filter.value}
            type="button"
            className={`transactions-page__filter${
              periodFilter === filter.value ? ' is-active' : ''
            }`}
            onClick={() => setPeriodFilter(filter.value)}
          >
            {filter.label}
          </button>
        ))}

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
        <p className="transactions-page__empty">
          Операции за выбранный период не найдены
        </p>
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