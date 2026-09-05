import { useEffect, useMemo, useState } from 'react'
import StockBatchModal from '../components/modals/StockBatchModal'
import Button from '../components/ui/Button'
import { getStockBatches } from '../data/stockBatches'
import { formatDate, formatPrice } from '../lib/format'
import { usePermission } from '../lib/usePermission'

const MASK = '•••'

function StockBatchesPage() {
  const [batches, setBatches] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [search, setSearch] = useState('')
  const [modalOpen, setModalOpen] = useState(false)
  const canManage = usePermission('inventory.manage')
  // Право prices.view_purchase пока не сеяно в справочник permissions:
  // цены увидят только админы (админ-обход в usePermission). После
  // добавления права в миграцию доступ станет гранулярным без правок кода.
  const canViewPrices = usePermission('prices.view_purchase')

  useEffect(() => {
    let cancelled = false

    async function loadBatches() {
      try {
        const result = await getStockBatches()

        if (!cancelled) {
          setBatches(result)
        }
      } catch (err) {
        if (!cancelled) {
          console.error('Не удалось загрузить партии:', err)
          setError(
            'Не удалось загрузить партии поставок. Попробуйте обновить страницу.',
          )
        }
      } finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
    }

    loadBatches()

    return () => {
      cancelled = true
    }
  }, [])

  async function refreshBatches() {
    try {
      setError(null)
      setBatches(await getStockBatches())
    } catch (err) {
      console.error('Не удалось обновить список партий:', err)
      setError('Не удалось обновить список партий.')
    }
  }

  const normalizedSearch = search.trim().toLowerCase()

  const filteredBatches = useMemo(
    () =>
      batches.filter(
        (batch) =>
          !normalizedSearch ||
          (batch.sku ?? '').toLowerCase().includes(normalizedSearch) ||
          (batch.partName ?? '').toLowerCase().includes(normalizedSearch) ||
          (batch.supplierName ?? '').toLowerCase().includes(normalizedSearch),
      ),
    [batches, normalizedSearch],
  )

  return (
    <div className="page stock-batches-page">
      <header className="stock-batches-page__head">
        <h1 className="stock-batches-page__title">Партии поставок</h1>
        {canManage ? (
          <Button onClick={() => setModalOpen(true)}>
            + Оприходовать партию
          </Button>
        ) : null}
      </header>

      <input
        className="stock-batches-page__search"
        type="search"
        placeholder="Поиск по артикулу, названию детали или поставщику..."
        value={search}
        onChange={(event) => setSearch(event.target.value)}
      />

      {loading ? (
        <p>Загрузка...</p>
      ) : error ? (
        <p className="stock-batches-page__error" role="alert">
          {error}
        </p>
      ) : filteredBatches.length === 0 ? (
        <p className="stock-batches-page__empty">Партии не найдены</p>
      ) : (
        <div className="stock-batches-page__table">
          <div className="stock-batches-page__table-header">
            <span>Дата прихода</span>
            <span>Артикул</span>
            <span>Запчасть</span>
            <span>Поставщик</span>
            <span>Кол-во</span>
            <span>Цена за шт.</span>
            <span>Сумма партии</span>
          </div>
          <ul className="stock-batches-page__list">
            {filteredBatches.map((batch) => (
              <li className="stock-batches-page__row" key={batch.id}>
                <span className="stock-batches-page__date">
                  {formatDate(batch.createdAt)}
                </span>
                <span className="stock-batches-page__sku">
                  {batch.sku ?? '—'}
                </span>
                <span className="stock-batches-page__name">
                  {batch.partName ?? '—'}
                </span>
                <span className="stock-batches-page__muted">
                  {batch.supplierName ?? '—'}
                </span>
                <span className="stock-batches-page__quantity">
                  {batch.quantity} шт.
                </span>
                <span
                  className={
                    canViewPrices
                      ? 'stock-batches-page__price'
                      : 'stock-batches-page__price stock-batches-page__masked'
                  }
                >
                  {canViewPrices ? formatPrice(batch.purchasePrice) : MASK}
                </span>
                <span
                  className={
                    canViewPrices
                      ? 'stock-batches-page__price'
                      : 'stock-batches-page__price stock-batches-page__masked'
                  }
                >
                  {canViewPrices ? formatPrice(batch.total) : MASK}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <StockBatchModal
        key={modalOpen ? 'open' : 'closed'}
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onSaved={refreshBatches}
      />
    </div>
  )
}

export default StockBatchesPage