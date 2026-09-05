import { useEffect, useMemo, useState } from 'react'
import ConsumableModal from '../components/modals/ConsumableModal'
import ConsumableAdjustModal from '../components/modals/ConsumableAdjustModal'
import { deleteConsumable, getConsumables } from '../data/consumables'
import { usePermission } from '../lib/usePermission'

// 950 → "950", 1.5 → "1.50" (в БД numeric(12,2))
function formatQuantity(value) {
  return Number.isInteger(value) ? String(value) : value.toFixed(2)
}

function ConsumablesPage() {
  const [consumables, setConsumables] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [search, setSearch] = useState('')
  const [lowOnly, setLowOnly] = useState(false)
  const [editModal, setEditModal] = useState({
    open: false,
    consumable: null,
  })
  const [adjustModal, setAdjustModal] = useState({
    open: false,
    consumable: null,
  })
  const [deletingId, setDeletingId] = useState(null)
  const canManage = usePermission('inventory.manage')

  useEffect(() => {
    let cancelled = false

    async function loadConsumables() {
      try {
        const result = await getConsumables()

        if (!cancelled) {
          setConsumables(result)
        }
      } catch (err) {
        if (!cancelled) {
          console.error('Не удалось загрузить расходники:', err)
          setError(
            'Не удалось загрузить расходники. Попробуйте обновить страницу.',
          )
        }
      } finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
    }

    loadConsumables()

    return () => {
      cancelled = true
    }
  }, [])

  async function refreshConsumables() {
    try {
      setError(null)
      setConsumables(await getConsumables())
    } catch (err) {
      console.error('Не удалось обновить список расходников:', err)
      setError('Не удалось обновить список расходников.')
    }
  }

  async function handleDelete(consumable) {
    const confirmed = window.confirm(
      `Удалить расходник «${consumable.name}»?`,
    )

    if (!confirmed) {
      return
    }

    setDeletingId(consumable.id)

    try {
      await deleteConsumable(consumable.id)
      setConsumables((prev) =>
        prev.filter((item) => item.id !== consumable.id),
      )
    } catch (err) {
      console.error('Не удалось удалить расходник:', err)
      setError(`Не удалось удалить расходник «${consumable.name}».`)
    } finally {
      setDeletingId(null)
    }
  }

  const normalizedSearch = search.trim().toLowerCase()

  const filteredConsumables = useMemo(
    () =>
      consumables.filter((item) => {
        if (
          normalizedSearch &&
          !item.name.toLowerCase().includes(normalizedSearch)
        ) {
          return false
        }

        if (lowOnly && item.quantity > item.minQuantity) {
          return false
        }

        return true
      }),
    [consumables, normalizedSearch, lowOnly],
  )

  return (
    <div className="page consumables-page">
      <header className="consumables-page__head">
        <h1 className="consumables-page__title">Расходники</h1>
        {canManage ? (
          <button
            type="button"
            className="consumables-page__action"
            onClick={() => setEditModal({ open: true, consumable: null })}
          >
            + Добавить расходник
          </button>
        ) : null}
      </header>

      <div className="consumables-page__toolbar">
        <input
          className="consumables-page__search"
          type="search"
          placeholder="Поиск по названию..."
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
        <label className="consumables-page__low-toggle">
          <input
            type="checkbox"
            checked={lowOnly}
            onChange={(event) => setLowOnly(event.target.checked)}
          />
          Только заканчивающиеся
        </label>
      </div>

      {loading ? (
        <p>Загрузка...</p>
      ) : error ? (
        <p className="consumables-page__error" role="alert">
          {error}
        </p>
      ) : filteredConsumables.length === 0 ? (
        <p className="consumables-page__empty">Расходники не найдены</p>
      ) : (
        <div className="consumables-page__table">
          <div className="consumables-page__table-header">
            <span>Название</span>
            <span>Остаток</span>
            <span>Ед. изм.</span>
            <span>Порог</span>
            <span>Статус</span>
            {canManage ? <span>Действия</span> : null}
          </div>
          <ul className="consumables-page__list">
            {filteredConsumables.map((item) => {
              const isLow = item.quantity <= item.minQuantity

              return (
                <li
                  key={item.id}
                  className={
                    isLow
                      ? 'consumables-page__row consumables-page__row--low'
                      : 'consumables-page__row'
                  }
                >
                  <span className="consumables-page__name">{item.name}</span>
                  <span className="consumables-page__quantity">
                    {formatQuantity(item.quantity)}
                  </span>
                  <span className="consumables-page__unit">{item.unit}</span>
                  <span className="consumables-page__min">
                    {formatQuantity(item.minQuantity)}
                  </span>
                  <span>
                    <em
                      className={
                        isLow
                          ? 'consumables-page__status-badge consumables-page__status-badge--low'
                          : 'consumables-page__status-badge'
                      }
                    >
                      {isLow ? 'Заканчивается' : 'В наличии'}
                    </em>
                  </span>
                  {canManage ? (
                    <span className="consumables-page__actions">
                      <button
                        type="button"
                        className="consumables-page__action"
                        onClick={() =>
                          setAdjustModal({ open: true, consumable: item })
                        }
                      >
                        Списать / Пополнить
                      </button>
                      <button
                        type="button"
                        className="consumables-page__action"
                        onClick={() =>
                          setEditModal({ open: true, consumable: item })
                        }
                      >
                        Редактировать
                      </button>
                      <button
                        type="button"
                        className="consumables-page__action consumables-page__action--danger"
                        onClick={() => handleDelete(item)}
                        disabled={deletingId === item.id}
                      >
                        {deletingId === item.id ? 'Удаление...' : 'Удалить'}
                      </button>
                    </span>
                  ) : null}
                </li>
              )
            })}
          </ul>
        </div>
      )}

      <ConsumableModal
        key={editModal.open ? (editModal.consumable?.id ?? 'new') : 'closed'}
        open={editModal.open}
        consumable={editModal.consumable}
        onClose={() => setEditModal({ open: false, consumable: null })}
        onSaved={refreshConsumables}
      />

      <ConsumableAdjustModal
        key={adjustModal.open
          ? (adjustModal.consumable?.id ?? 'open')
          : 'closed'}
        open={adjustModal.open}
        consumable={adjustModal.consumable}
        onClose={() => setAdjustModal({ open: false, consumable: null })}
        onSaved={refreshConsumables}
      />
    </div>
  )
}

export default ConsumablesPage