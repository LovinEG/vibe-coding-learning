import { useEffect, useMemo, useState } from 'react'
import { getStockMovements } from '../data/stockMovements'
import { formatDateTime } from '../lib/format'
import { usePermission } from '../lib/usePermission'

// Типы — по CHECK-констрейнту БД (income | expense | return | defect).
const TYPE_LABELS = {
  income: 'Приход',
  expense: 'Списание',
  return: 'Возврат',
  defect: 'Брак',
}

const TYPE_BADGES = {
  income: 'movements-page__badge--income',
  expense: 'movements-page__badge--expense',
  return: 'movements-page__badge--return',
  defect: 'movements-page__badge--defect',
}

// Знак изменения остатка: приход/возврат — плюс, списание/брак — минус.
const TYPE_SIGNS = {
  income: '+',
  return: '+',
  expense: '−',
  defect: '−',
}

const TYPE_FILTERS = [
  { value: 'all', label: 'Все' },
  { value: 'income', label: 'Приход' },
  { value: 'expense', label: 'Списание' },
  { value: 'return', label: 'Возврат' },
  { value: 'defect', label: 'Брак' },
]

function getDeltaClass(movementType) {
  if (movementType === 'income' || movementType === 'return') {
    return ' movements-page__delta--positive'
  }

  if (movementType === 'expense' || movementType === 'defect') {
    return ' movements-page__delta--negative'
  }

  return ''
}

function StockMovementsPage() {
  const [movements, setMovements] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState('all')

  // Журнал — readonly, доступен при базовом праве склада.
  // Раздел «Склад» в сайдбаре отфильтрован по этому же праву.
  const canView = usePermission('inventory.read')

  useEffect(() => {
    let cancelled = false

    async function loadMovements() {
      try {
        const result = await getStockMovements()

        if (!cancelled) {
          setMovements(result)
        }
      } catch (err) {
        if (!cancelled) {
          console.error('Не удалось загрузить журнал движений:', err)
          setError(
            'Не удалось загрузить журнал движений. Попробуйте обновить страницу.',
          )
        }
      } finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
    }

    loadMovements()

    return () => {
      cancelled = true
    }
  }, [])

  const normalizedSearch = search.trim().toLowerCase()

  const filteredMovements = useMemo(
    () =>
      movements.filter((movement) => {
        if (typeFilter !== 'all' && movement.movementType !== typeFilter) {
          return false
        }

        if (!normalizedSearch) {
          return true
        }

        return (
          (movement.partName ?? '').toLowerCase().includes(normalizedSearch) ||
          (movement.sku ?? '').toLowerCase().includes(normalizedSearch) ||
          (movement.userName ?? '').toLowerCase().includes(normalizedSearch)
        )
      }),
    [movements, typeFilter, normalizedSearch],
  )

  if (!canView) {
    return (
      <div className="page movements-page">
        <h1 className="movements-page__title">Движения склада</h1>
        <p className="movements-page__empty">
          Недостаточно прав для просмотра журнала движений.
        </p>
      </div>
    )
  }

  return (
    <div className="page movements-page">
      <header className="movements-page__head">
        <h1 className="movements-page__title">Движения склада</h1>
        <p className="movements-page__hint">
          Журнал аудита: приход, списание, возврат и брак запчастей.
        </p>
      </header>

      <input
        className="movements-page__search"
        type="search"
        placeholder="Поиск по запчасти, артикулу или сотруднику..."
        value={search}
        onChange={(event) => setSearch(event.target.value)}
      />

      <div
        className="movements-page__filters"
        role="group"
        aria-label="Фильтр по типу движения"
      >
        {TYPE_FILTERS.map((filter) => (
          <button
            key={filter.value}
            type="button"
            className={
              typeFilter === filter.value
                ? 'movements-page__filter is-active'
                : 'movements-page__filter'
            }
            onClick={() => setTypeFilter(filter.value)}
          >
            {filter.label}
          </button>
        ))}
      </div>

      {loading ? (
        <p>Загрузка...</p>
      ) : error ? (
        <p className="movements-page__error" role="alert">
          {error}
        </p>
      ) : filteredMovements.length === 0 ? (
        <p className="movements-page__empty">Движения не найдены</p>
      ) : (
        <div className="movements-page__table">
          <div className="movements-page__table-header">
            <span>Дата / Время</span>
            <span>Тип движения</span>
            <span>Артикул</span>
            <span>Запчасть</span>
            <span>Изменение</span>
            <span>Исполнитель</span>
            <span>Комментарий / Заказ</span>
          </div>
          <ul className="movements-page__list">
            {filteredMovements.map((movement) => (
              <li key={movement.id} className="movements-page__row">
                <span className="movements-page__datetime">
                  {formatDateTime(movement.createdAt)}
                </span>
                <span>
                  <span
                    className={`movements-page__badge ${
                      TYPE_BADGES[movement.movementType] ?? ''
                    }`}
                  >
                    {TYPE_LABELS[movement.movementType] ?? movement.movementType}
                  </span>
                </span>
                <span className="movements-page__sku">{movement.sku}</span>
                <span className="movements-page__part">{movement.partName}</span>
                <span
                  className={`movements-page__delta${getDeltaClass(
                    movement.movementType,
                  )}`}
                >
                  {TYPE_SIGNS[movement.movementType] ?? ''}
                  {movement.quantity} шт.
                </span>
                <span className="movements-page__user">
                  {movement.userName ?? '—'}
                </span>
                <span className="movements-page__comment">
                  {movement.comment ??
                    (movement.orderNumber
                      ? `Заказ ${movement.orderNumber}`
                      : '—')}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

export default StockMovementsPage