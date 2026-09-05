import { useEffect, useMemo, useState } from 'react'
import CashOperationModal from '../components/modals/CashOperationModal'
import Button from '../components/ui/Button'
import { getCashOperations } from '../data/cashOperations'
import { getCashRegisters } from '../data/cashRegisters'
import { formatCurrency, formatDateTime } from '../lib/format'
import { usePermission } from '../lib/usePermission'
import './Page.css'

const TYPE_LABELS = {
  income: 'Доход',
  expense: 'Расход',
}

const TYPE_BADGES = {
  income: 'operations-page__type-badge--income',
  expense: 'operations-page__type-badge--expense',
}

const TYPE_FILTERS = [
  { value: 'all', label: 'Все операции' },
  { value: 'income', label: 'Доход' },
  { value: 'expense', label: 'Расход' },
]

function OperationsPage() {
  const [operations, setOperations] = useState([])
  const [cashRegisters, setCashRegisters] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState('all')
  const [registerFilter, setRegisterFilter] = useState('all')
  const [modalOpen, setModalOpen] = useState(false)

  const canView = usePermission('finance.view')
  const canManage = usePermission('finance.manage')

  useEffect(() => {
    let cancelled = false

    async function loadOperations() {
      try {
        const [operationsResult, registersResult] = await Promise.all([
          getCashOperations(),
          getCashRegisters(),
        ])

        if (!cancelled) {
          setOperations(operationsResult)
          setCashRegisters(registersResult)
        }
      } catch (err) {
        console.error('Не удалось загрузить кассовые операции:', err)

        if (!cancelled) {
          setError(
            'Не удалось загрузить кассовые операции. Попробуйте обновить страницу.',
          )
        }
      } finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
    }

    loadOperations()

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

  async function refreshOperations() {
    try {
      setError(null)
      setOperations(await getCashOperations())
    } catch (err) {
      console.error('Не удалось обновить список операций:', err)
      setError('Не удалось обновить список операций.')
    }
  }

  const totals = useMemo(() => {
    const income = operations
      .filter((op) => op.type === 'income')
      .reduce((sum, op) => sum + op.amount, 0)
    const expense = operations
      .filter((op) => op.type === 'expense')
      .reduce((sum, op) => sum + op.amount, 0)

    return { income, expense, net: income - expense }
  }, [operations])

  const normalizedSearch = search.trim().toLowerCase()

  const filteredOperations = useMemo(
    () =>
      operations.filter((operation) => {
        if (typeFilter !== 'all' && operation.type !== typeFilter) {
          return false
        }

        if (
          registerFilter !== 'all' &&
          operation.cashRegisterId !== registerFilter
        ) {
          return false
        }

        if (!normalizedSearch) {
          return true
        }

        return (
          operation.category.toLowerCase().includes(normalizedSearch) ||
          (operation.comment &&
            operation.comment.toLowerCase().includes(normalizedSearch)) ||
          operation.cashRegisterName.toLowerCase().includes(normalizedSearch)
        )
      }),
    [operations, typeFilter, registerFilter, normalizedSearch],
  )

  if (!canView) {
    return (
      <div className="page operations-page">
        <p className="operations-page__error" role="alert">
          У вас нет прав для просмотра раздела «Кассовые операции».
        </p>
      </div>
    )
  }

  return (
    <div className="page operations-page">
      <div className="operations-page__head">
        <div>
          <h1 className="operations-page__title">Кассовые операции</h1>
          <p className="operations-page__hint">
            Приходные и расходные операции по кассам
          </p>
        </div>

        {canManage ? (
          <Button onClick={openModal}>+ Новая операция</Button>
        ) : null}
      </div>

      <div className="operations-page__totals">
        <div className="operations-page__total operations-page__total--income">
          <span className="operations-page__total-label">Общий приход</span>
          <span className="operations-page__total-value">
            +{formatCurrency(totals.income)}
          </span>
        </div>

        <div className="operations-page__total operations-page__total--expense">
          <span className="operations-page__total-label">Общий расход</span>
          <span className="operations-page__total-value">
            −{formatCurrency(totals.expense)}
          </span>
        </div>

        <div className="operations-page__total operations-page__total--net">
          <span className="operations-page__total-label">Чистый поток</span>
          <span className="operations-page__total-value">
            {totals.net >= 0 ? '+' : '−'}
            {formatCurrency(Math.abs(totals.net))}
          </span>
        </div>
      </div>

      <input
        className="operations-page__search"
        type="search"
        placeholder="Поиск по категории, комментарию..."
        value={search}
        onChange={(event) => setSearch(event.target.value)}
        aria-label="Поиск по кассовым операциям"
      />

      <div className="operations-page__filters">
        {TYPE_FILTERS.map((filter) => (
          <button
            key={filter.value}
            type="button"
            className={`operations-page__filter${
              typeFilter === filter.value ? ' is-active' : ''
            }`}
            onClick={() => setTypeFilter(filter.value)}
          >
            {filter.label}
          </button>
        ))}

        <select
          className="operations-page__register-filter"
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
        <p className="operations-page__empty">Загрузка...</p>
      ) : error ? (
        <p className="operations-page__error" role="alert">
          {error}
        </p>
      ) : filteredOperations.length === 0 ? (
        <p className="operations-page__empty">Операции не найдены</p>
      ) : (
        <div className="operations-page__table">
          <div className="operations-page__table-header">
            <span>Дата / Время</span>
            <span>Тип</span>
            <span>Касса</span>
            <span>Категория</span>
            <span>Сумма</span>
            <span>Исполнитель</span>
            <span>Комментарий</span>
          </div>

          <ul className="operations-page__list">
            {filteredOperations.map((operation) => (
              <li key={operation.id} className="operations-page__row">
                <span className="operations-page__datetime">
                  {formatDateTime(operation.createdAt)}
                </span>
                <span>
                  <span
                    className={`operations-page__type-badge ${
                      TYPE_BADGES[operation.type] ?? ''
                    }`}
                  >
                    {TYPE_LABELS[operation.type] ?? operation.type}
                  </span>
                </span>
                <span className="operations-page__register">
                  {operation.cashRegisterName}
                </span>
                <span className="operations-page__category">
                  {operation.category}
                </span>
                <span
                  className={`operations-page__amount ${
                    operation.type === 'income'
                      ? 'operations-page__amount--income'
                      : 'operations-page__amount--expense'
                  }`}
                >
                  {operation.type === 'income' ? '+' : '−'}
                  {formatCurrency(operation.amount)}
                </span>
                <span className="operations-page__user">
                  {operation.createdByName ?? '—'}
                </span>
                <span className="operations-page__comment">
                  {operation.comment ?? '—'}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <CashOperationModal
        key={modalOpen ? 'open' : 'closed'}
        open={modalOpen}
        onClose={closeModal}
        onSaved={refreshOperations}
      />
    </div>
  )
}

export default OperationsPage
