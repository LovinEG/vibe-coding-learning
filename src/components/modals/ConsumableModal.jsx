import { useState } from 'react'
import Button from '../ui/Button'
import { addConsumable, updateConsumable } from '../../data/consumables'
import './ConsumableModal.css'

const UNITS = ['шт', 'мл', 'г', 'рулон', 'уп']

// Форма монтируется с нуля при каждом открытии (key-ремонтирование
// в родителе), поэтому начальные значения читаются из пропса один раз.
function createInitialForm(consumable) {
  return {
    name: consumable?.name ?? '',
    unit: consumable?.unit ?? 'шт',
    quantity: consumable ? String(consumable.quantity) : '0',
    minQuantity: consumable ? String(consumable.minQuantity) : '0',
  }
}

function ConsumableModal({ open, consumable, onClose, onSaved }) {
  const isEdit = Boolean(consumable)
  const [form, setForm] = useState(() => createInitialForm(consumable))
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(null)

  if (!open) {
    return null
  }

  const setField = (field) => (event) =>
    setForm((prev) => ({ ...prev, [field]: event.target.value }))

  function validate() {
    if (!form.name.trim()) {
      return 'Укажите название расходника'
    }

    const quantity = Number(form.quantity)
    if (!Number.isFinite(quantity) || quantity < 0) {
      return 'Остаток должен быть неотрицательным числом'
    }

    const minQuantity = Number(form.minQuantity)
    if (!Number.isFinite(minQuantity) || minQuantity < 0) {
      return 'Минимальный остаток должен быть неотрицательным числом'
    }

    return null
  }

  async function handleSubmit(event) {
    event.preventDefault()

    const validationError = validate()
    if (validationError) {
      setError(validationError)
      return
    }

    setSubmitting(true)
    setError(null)

    try {
      const payload = {
        name: form.name.trim(),
        unit: form.unit,
        quantity: Number(form.quantity),
        minQuantity: Number(form.minQuantity),
      }

      if (isEdit) {
        await updateConsumable(consumable.id, payload)
      } else {
        await addConsumable(payload)
      }

      onSaved()
    } catch (err) {
      console.error('Не удалось сохранить расходник:', err)
      setError(err.message ?? 'Не удалось сохранить. Попробуйте ещё раз.')
    } finally {
      setSubmitting(false)
    }
  }

  function handleOverlayMouseDown(event) {
    if (event.target === event.currentTarget && !submitting) {
      onClose()
    }
  }

  return (
    <div className="cmodal-overlay" onMouseDown={handleOverlayMouseDown}>
      <div
        className="cmodal"
        role="dialog"
        aria-modal="true"
        aria-label={isEdit ? 'Редактирование расходника' : 'Новый расходник'}
      >
        <h2 className="cmodal__title">
          {isEdit ? 'Редактировать расходник' : 'Новый расходник'}
        </h2>
        <form className="cmodal__form" onSubmit={handleSubmit} noValidate>
          <label className="cmodal__label">
            Название *
            <input
              className="cmodal__input"
              value={form.name}
              onChange={setField('name')}
              placeholder="Изопропиловый спирт"
              required
            />
          </label>
          <label className="cmodal__label">
            Единица измерения
            <select
              className="cmodal__select"
              value={form.unit}
              onChange={setField('unit')}
            >
              {UNITS.map((unit) => (
                <option key={unit} value={unit}>
                  {unit}
                </option>
              ))}
            </select>
          </label>
          <div className="cmodal__row">
            <label className="cmodal__label">
              Начальный остаток
              <input
                className="cmodal__input"
                type="number"
                min="0"
                step="0.01"
                value={form.quantity}
                onChange={setField('quantity')}
              />
            </label>
            <label className="cmodal__label">
              Мин. остаток для оповещения
              <input
                className="cmodal__input"
                type="number"
                min="0"
                step="0.01"
                value={form.minQuantity}
                onChange={setField('minQuantity')}
              />
            </label>
          </div>
          {error ? (
            <p className="cmodal__error" role="alert">
              {error}
            </p>
          ) : null}
          <div className="cmodal__footer">
            <Button
              className="cmodal__button--secondary"
              onClick={onClose}
              disabled={submitting}
            >
              Отмена
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? 'Сохранение...' : 'Сохранить'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default ConsumableModal