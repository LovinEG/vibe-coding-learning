import { useEffect, useState } from 'react'
import Button from '../ui/Button'
import { getParts } from '../../data/inventory'
import { getSuppliers } from '../../data/suppliers'
import { addStockBatch } from '../../data/stockBatches'
import './StockBatchModal.css'

const emptyForm = {
  partId: '',
  supplierId: '',
  quantity: '1',
  purchasePrice: '',
  partSearch: '',
}

function StockBatchModal({ open, onClose, onSaved }) {
  // Форма и списки инициализируются при монтировании: сброс при повторном
  // открытии обеспечивает key={...} на компоненте в StockBatchesPage
  // (идиома React для «state resets when prop changes»).
  const [form, setForm] = useState(emptyForm)
  const [parts, setParts] = useState([])
  const [suppliers, setSuppliers] = useState([])
  const [optionsLoading, setOptionsLoading] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  // Актуальные справочники запрашиваем при каждом открытии модалки.
  useEffect(() => {
    if (!open) {
      return undefined
    }

    let cancelled = false

    async function loadOptions() {
      setOptionsLoading(true)
      setError('')

      try {
        const [partsResult, suppliersResult] = await Promise.all([
          getParts(),
          getSuppliers(),
        ])

        if (!cancelled) {
          setParts(partsResult)
          setSuppliers(suppliersResult)
        }
      } catch (err) {
        if (!cancelled) {
          console.error('Не удалось загрузить справочники склада:', err)
          setError('Не удалось загрузить справочники склада.')
        }
      } finally {
        if (!cancelled) {
          setOptionsLoading(false)
        }
      }
    }

    loadOptions()

    return () => {
      cancelled = true
    }
  }, [open])

  if (!open) {
    return null
  }

  function handleChange(event) {
    const { name, value } = event.target
    setForm((prev) => ({ ...prev, [name]: value }))
  }

  function validate() {
    if (!form.partId) {
      return 'Выберите запчасть из справочника'
    }

    const quantity = Number(form.quantity)
    if (!Number.isInteger(quantity) || quantity < 1) {
      return 'Количество должно быть целым числом не меньше 1'
    }

    if (form.purchasePrice !== '') {
      const price = Number(form.purchasePrice)
      if (!Number.isFinite(price) || price < 0) {
        return 'Закупочная цена должна быть неотрицательным числом'
      }
    }

    return ''
  }

  async function handleSubmit(event) {
    event.preventDefault()

    const validationError = validate()
    if (validationError) {
      setError(validationError)
      return
    }

    setError('')
    setSubmitting(true)

    try {
      await addStockBatch({
        partId: form.partId,
        supplierId: form.supplierId || null,
        quantity: Number(form.quantity),
        purchasePrice:
          form.purchasePrice === '' ? null : Number(form.purchasePrice),
      })

      onClose()

      if (typeof onSaved === 'function') {
        onSaved()
      }
    } catch (err) {
      console.error('Ошибка оприходования партии:', err)
      setError(
        err?.message
          ? `Не удалось провести приход: ${err.message}`
          : 'Не удалось провести приход партии',
      )
    } finally {
      setSubmitting(false)
    }
  }

  const normalizedPartSearch = form.partSearch.trim().toLowerCase()

  const filteredParts = normalizedPartSearch
    ? parts.filter(
        (part) =>
          part.name.toLowerCase().includes(normalizedPartSearch) ||
          part.sku.toLowerCase().includes(normalizedPartSearch),
      )
    : parts

  return (
    <div
      className="stock-batch-modal-overlay"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !submitting) {
          onClose()
        }
      }}
    >
      <div
        className="stock-batch-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="stock-batch-modal-title"
      >
        <h2 className="stock-batch-modal__title" id="stock-batch-modal-title">
          Оприходовать партию
        </h2>

        {error ? (
          <p className="stock-batch-modal__error" role="alert">
            {error}
          </p>
        ) : null}

        {optionsLoading ? (
          <p className="stock-batch-modal__loading">Загрузка справочников...</p>
        ) : (
          <form onSubmit={handleSubmit} noValidate>
            <label className="stock-batch-modal__field">
              <span className="stock-batch-modal__label">
                Поиск запчасти (название или SKU)
              </span>
              <input
                className="stock-batch-modal__input"
                name="partSearch"
                value={form.partSearch}
                onChange={handleChange}
                placeholder="Дисплей, AKB-IP11..."
                disabled={submitting}
              />
            </label>

            <label className="stock-batch-modal__field">
              <span className="stock-batch-modal__label">Запчасть *</span>
              <select
                className="stock-batch-modal__input"
                name="partId"
                value={form.partId}
                onChange={handleChange}
                disabled={submitting}
              >
                <option value="">Выберите запчасть...</option>
                {filteredParts.map((part) => (
                  <option key={part.id} value={part.id}>
                    {part.name} ({part.sku}) — склад: {part.totalStock} шт.
                  </option>
                ))}
              </select>
            </label>

            <label className="stock-batch-modal__field">
              <span className="stock-batch-modal__label">Поставщик</span>
              <select
                className="stock-batch-modal__input"
                name="supplierId"
                value={form.supplierId}
                onChange={handleChange}
                disabled={submitting}
              >
                <option value="">Не указан</option>
                {suppliers.map((supplier) => (
                  <option key={supplier.id} value={supplier.id}>
                    {supplier.name}
                  </option>
                ))}
              </select>
            </label>

            <div className="stock-batch-modal__row">
              <label className="stock-batch-modal__field">
                <span className="stock-batch-modal__label">Количество *</span>
                <input
                  className="stock-batch-modal__input"
                  name="quantity"
                  type="number"
                  min="1"
                  step="1"
                  value={form.quantity}
                  onChange={handleChange}
                  disabled={submitting}
                />
              </label>

              <label className="stock-batch-modal__field">
                <span className="stock-batch-modal__label">
                  Закупочная цена за шт.
                </span>
                <input
                  className="stock-batch-modal__input"
                  name="purchasePrice"
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.purchasePrice}
                  onChange={handleChange}
                  placeholder="0.00"
                  disabled={submitting}
                />
              </label>
            </div>

            <div className="stock-batch-modal__actions">
              <Button
                className="stock-batch-modal__button--secondary"
                onClick={onClose}
                disabled={submitting}
              >
                Отмена
              </Button>
              <Button type="submit" disabled={submitting}>
                {submitting ? 'Проводим приход...' : 'Оприходовать'}
              </Button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}

export default StockBatchModal