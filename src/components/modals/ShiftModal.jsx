import { useEffect, useState } from 'react'
import { closeShift, openShift } from '../../data/cashOperations'
import { getCashRegisters } from '../../data/cashRegisters'
import { formatCurrency } from '../../lib/format'
import Button from '../ui/Button'
import './ShiftModal.css'

// Модальное окно управления сменой прямо с Дашборда:
// mode 'open' — стартовый остаток и заметка,
// mode 'close' — итоговый остаток, сумма инкассации/выемки и заметка.
function ShiftModal({ open, mode, onClose, onSaved }) {
  const isClosing = mode === 'close'

  const [form, setForm] = useState({
    cashRegisterId: '',
    startCash: '',
    closingBalance: '',
    withdrawal: '',
    comment: '',
  })
  const [cashRegisters, setCashRegisters] = useState([])
  const [optionsLoading, setOptionsLoading] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!open) {
      return undefined
    }

    let cancelled = false

    async function loadOptions() {
      setOptionsLoading(true)

      try {
        const registers = await getCashRegisters()

        if (!cancelled) {
          setCashRegisters(registers)
          // По умолчанию — первая активная касса.
          const defaultRegister = registers.find((item) => item.isActive)

          if (defaultRegister) {
            setForm((prev) => ({
              ...prev,
              cashRegisterId: defaultRegister.id,
              closingBalance: String(defaultRegister.balance),
            }))
          }
        }
      } catch (err) {
        if (!cancelled) {
          console.error('Не удалось загрузить кассы для смены:', err)
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
    if (!form.cashRegisterId) {
      return 'Выберите кассу'
    }

    if (!isClosing) {
      const startCash = Number(form.startCash)

      if (
        form.startCash === '' ||
        !Number.isFinite(startCash) ||
        startCash < 0
      ) {
        return 'Укажите корректный стартовый остаток'
      }
    } else {
      const withdrawal = Number(form.withdrawal || 0)

      if (!Number.isFinite(withdrawal) || withdrawal < 0) {
        return 'Укажите корректную сумму инкассации'
      }

      if (
        withdrawal > 0 &&
        withdrawal > Number(form.closingBalance || 0)
      ) {
        return 'Инкассация не может превышать итоговый остаток'
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
      if (isClosing) {
        await closeShift({
          cashRegisterId: form.cashRegisterId,
          closingBalance: Number(form.closingBalance || 0),
          withdrawal: Number(form.withdrawal || 0),
          comment: form.comment.trim() || null,
        })
      } else {
        await openShift({
          cashRegisterId: form.cashRegisterId,
          startCash: Number(form.startCash),
          comment: form.comment.trim() || null,
        })
      }

      if (onSaved) {
        await onSaved()
      }

      onClose()
    } catch (err) {
      console.error('Не удалось сохранить смену:', err)
      setError(
        isClosing
          ? 'Не удалось закрыть смену. Попробуйте ещё раз.'
          : 'Не удалось открыть смену. Попробуйте ещё раз.',
      )
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div
      className="shift-modal-overlay"
      onClick={submitting ? undefined : onClose}
    >
      <div
        className="shift-modal"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={isClosing ? 'Закрытие смены' : 'Открытие смены'}
      >
        <h2 className="shift-modal__title">
          {isClosing ? '🔒 Закрыть смену' : '🔓 Открыть смену'}
        </h2>

        <form onSubmit={handleSubmit}>
          <label className="shift-modal__field">
            <span className="shift-modal__label">Касса *</span>
            <select
              className="shift-modal__input"
              name="cashRegisterId"
              value={form.cashRegisterId}
              onChange={handleChange}
              disabled={optionsLoading}
            >
              <option value="">
                {optionsLoading ? 'Загрузка касс...' : 'Выберите кассу'}
              </option>
              {cashRegisters.map((register) => (
                <option key={register.id} value={register.id}>
                  {register.name} · {formatCurrency(register.balance)}
                </option>
              ))}
            </select>
          </label>

          {isClosing ? (
            <>
              <label className="shift-modal__field">
                <span className="shift-modal__label">
                  Итоговый остаток наличных в кассе
                </span>
                <input
                  className="shift-modal__input"
                  name="closingBalance"
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="0.00"
                  value={form.closingBalance}
                  onChange={handleChange}
                />
              </label>

              <label className="shift-modal__field">
                <span className="shift-modal__label">
                  Сумма инкассации / выемки
                </span>
                <input
                  className="shift-modal__input"
                  name="withdrawal"
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="0.00"
                  value={form.withdrawal}
                  onChange={handleChange}
                />
              </label>
            </>
          ) : (
            <label className="shift-modal__field">
              <span className="shift-modal__label">
                Стартовый остаток наличных в кассе *
              </span>
              <input
                className="shift-modal__input"
                name="startCash"
                type="number"
                min="0"
                step="0.01"
                placeholder="0.00"
                value={form.startCash}
                onChange={handleChange}
              />
            </label>
          )}

          <label className="shift-modal__field">
            <span className="shift-modal__label">
              {isClosing ? 'Заметка' : 'Заметка / Комментарий'}
            </span>
            <textarea
              className="shift-modal__input shift-modal__textarea"
              name="comment"
              rows={3}
              placeholder={
                isClosing
                  ? 'Комментарий к закрытию смены...'
                  : 'Комментарий к открытию смены...'
              }
              value={form.comment}
              onChange={handleChange}
            />
          </label>

          {!optionsLoading && cashRegisters.length === 0 ? (
            <p className="shift-modal__hint shift-modal__hint--error">
              Кассы не найдены. Сначала добавьте кассу в разделе «Кассы».
            </p>
          ) : null}

          {error ? (
            <p className="shift-modal__error" role="alert">
              {error}
            </p>
          ) : null}

          <div className="shift-modal__actions">
            <Button
              type="button"
              className="shift-modal__button--secondary"
              onClick={onClose}
              disabled={submitting}
            >
              Отмена
            </Button>
            <Button type="submit" disabled={submitting || optionsLoading}>
              {submitting
                ? isClosing
                  ? 'Закрытие...'
                  : 'Открытие...'
                : isClosing
                  ? 'Закрыть смену'
                  : 'Открыть смену'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default ShiftModal
