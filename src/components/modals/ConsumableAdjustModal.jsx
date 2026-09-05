import { useState } from 'react'
import Button from '../ui/Button'
import { adjustConsumableQuantity } from '../../data/consumables'
import './ConsumableModal.css'

// 950 → "950", 1.5 → "1.50" (в БД numeric(12,2))
function formatQuantity(value) {
  return Number.isInteger(value) ? String(value) : value.toFixed(2)
}

function ConsumableAdjustModal({ open, consumable, onClose, onSaved }) {
  const [mode, setMode] = useState('refill') // 'refill' | 'writeoff'
  const [amount, setAmount] = useState('1')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(null)

  if (!open || !consumable) {
    return null
  }

  const delta = Math.abs(Number(amount) || 0)
  const isWriteOff = mode === 'writeoff'
  const insufficient = isWriteOff && delta > consumable.quantity
  const newQuantity = isWriteOff
    ? Math.max(0, consumable.quantity - delta)
    : consumable.quantity + delta

  async function handleSubmit(event) {
    event.preventDefault()

    if (!Number.isFinite(delta) || delta <= 0) {
      setError('Количество должно быть больше нуля')
      return
    }

    if (insufficient) {
      setError(
        `Нельзя списать больше остатка (${formatQuantity(consumable.quantity)} ${consumable.unit})`,
      )
      return
    }

    setSubmitting(true)
    setError(null)

    try {
      await adjustConsumableQuantity(
        consumable.id,
        Number(newQuantity.toFixed(2)),
      )
      onSaved()
    } catch (err) {
      console.error('Не удалось обновить остаток:', err)
      setError(err.message ?? 'Не удалось обновить остаток. Попробуйте ещё раз.')
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
        aria-label="Корректировка остатка"
      >
        <h2 className="cmodal__title">Корректировка остатка</h2>
        <p className="cmodal__current">
          {consumable.name}: остаток{' '}
          <strong>
            {formatQuantity(consumable.quantity)} {consumable.unit}
          </strong>
        </p>
        <form className="cmodal__form" onSubmit={handleSubmit} noValidate>
          <div
            className="cmodal__radio-group"
            role="radiogroup"
            aria-label="Тип операции"
          >
            <label
              className={
                mode === 'refill'
                  ? 'cmodal__radio cmodal__radio--active'
                  : 'cmodal__radio'
              }
            >
              <input
                type="radio"
                name="adjust-mode"
                value="refill"
                checked={mode === 'refill'}
                onChange={() => setMode('refill')}
              />
              Пополнить
            </label>
            <label
              className={
                isWriteOff
                  ? 'cmodal__radio cmodal__radio--active'
                  : 'cmodal__radio'
              }
            >
              <input
                type="radio"
                name="adjust-mode"
                value="writeoff"
                checked={isWriteOff}
                onChange={() => setMode('writeoff')}
              />
              Списать
            </label>
          </div>
          <label className="cmodal__label">
            Количество ({consumable.unit})
            <input
              className="cmodal__input"
              type="number"
              min="0"
              step="0.01"
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
              autoFocus
            />
          </label>
          {error ? (
            <p className="cmodal__error" role="alert">
              {error}
            </p>
          ) : null}
          <p className="cmodal__preview">
            Новый остаток:{' '}
            <strong>
              {formatQuantity(Number(newQuantity.toFixed(2)))}{' '}
              {consumable.unit}
            </strong>
          </p>
          <div className="cmodal__footer">
            <Button
              className="cmodal__button--secondary"
              onClick={onClose}
              disabled={submitting}
            >
              Отмена
            </Button>
            <Button type="submit" disabled={submitting || insufficient}>
              {submitting
                ? isWriteOff
                  ? 'Списание...'
                  : 'Пополнение...'
                : isWriteOff
                  ? 'Списать'
                  : 'Пополнить'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default ConsumableAdjustModal