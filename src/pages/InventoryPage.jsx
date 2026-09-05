import { useEffect, useMemo, useState } from 'react'
import { getParts } from '../data/inventory'
import { formatPrice } from '../lib/format'

function InventoryPage() {
  const [parts, setParts] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [search, setSearch] = useState('')

  useEffect(() => {
    let cancelled = false

    async function loadParts() {
      try {
        const result = await getParts()

        if (!cancelled) {
          setParts(result)
        }
      } catch (err) {
        if (!cancelled) {
          console.error('Не удалось загрузить склад:', err)
          setError(
            'Не удалось загрузить данные склада. Попробуйте обновить страницу.',
          )
        }
      } finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
    }

    loadParts()

    return () => {
      cancelled = true
    }
  }, [])

  const normalizedSearch = search.trim().toLowerCase()

  const filteredParts = useMemo(
    () =>
      parts.filter(
        (part) =>
          !normalizedSearch ||
          part.name.toLowerCase().includes(normalizedSearch) ||
          part.sku.toLowerCase().includes(normalizedSearch),
      ),
    [parts, normalizedSearch],
  )

  const isLowStock = (part) => part.totalStock <= part.minStock

  return (
    <div className="page inventory-page">
      <header className="inventory-page__head">
        <h1 className="inventory-page__title">Склад</h1>
        <input
          className="inventory-page__search"
          type="search"
          placeholder="Поиск по названию или артикулу..."
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
      </header>

      {loading ? (
        <p>Загрузка...</p>
      ) : error ? (
        <p className="inventory-page__error" role="alert">
          {error}
        </p>
      ) : filteredParts.length === 0 ? (
        <p className="inventory-page__empty">Запчасти не найдены</p>
      ) : (
        <div className="inventory-page__table">
          <div className="inventory-page__table-header">
            <span>Артикул</span>
            <span>Название</span>
            <span>Категория</span>
            <span>Остаток на складе</span>
            <span>Розничная цена</span>
          </div>
          <ul className="inventory-page__list">
            {filteredParts.map((part) => (
              <li
                key={part.id}
                className={
                  isLowStock(part)
                    ? 'inventory-page__row inventory-page__row--low'
                    : 'inventory-page__row'
                }
              >
                <span className="inventory-page__sku">{part.sku}</span>
                <span className="inventory-page__name">{part.name}</span>
                <span className="inventory-page__category">
                  {part.category ?? '—'}
                </span>
                <span className="inventory-page__stock">
                  {part.totalStock} шт.
                  {isLowStock(part) ? (
                    <em className="inventory-page__low-badge">
                      Низкий остаток
                    </em>
                  ) : null}
                </span>
                <span className="inventory-page__price">
                  {formatPrice(part.retailPrice)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

export default InventoryPage