import { useState } from 'react'
import { addCashRegister, updateCashRegister } from '../../data/cashRegisters'
import { formatCurrency } from '../../lib/format'
import Button from '../ui/Button'
import './CashRegisterModal.css'

const TYPE_OPTIONS = [
  { value: 'cash', label: 'Наличные' },
  { value: 'bank', label: 'Банковский счет' },
  { value: 'online', label: 'Онлайн-эквайринг' },
]

const emptyForm = {
  name: '',
  type: 'cash',
  balance: '',
}

function createInitialForm(register) {
  return register
    ? {
        name: register.name ?? '',
        type: register.type || 'cash',
        balance: '',
      }
    : emptyForm
}

function CashRegisterModal({ open, register, onClose, onSaved }) {
  // Форма инициализируется один раз при монтировании: сброс при повторном
  // открытии обеспечивает стабильный key={...} на компоненте в родителе.
  const [form, setForm] = useState(() => createInitialForm(register))
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const isEditing = Boolean(register?.id)

  if (!open) {
    return null
  }

  function handleChange(event) {
    const { name, value } = event.target
    setForm((prev) => ({ ...prev, [name]: value }))
  }

  function validate() {
    if (!form.name.trim()) {
      return 'Укажите название кассы'
    }

    if (!isEditing && form.balance !== '') {
      const balance = Number(form.balance)

      if (!Number.isFinite(balance)) {
        return 'Укажите корректный начальный баланс'
      }

      if (balance < 0) {
        return 'Начальный баланс не может быть отрицательным'
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
      const name = form.name.trim()
      const type = form.type

      if (isEditing) {
        await updateCashRegister(register.id, { name, type })
      } else {
        await addCashRegister({
          name,
          type,
          balance: form.balance === '' ? 0 : Number(form.balance),
        })
      }

      onClose()

      if (typeof onSaved === 'function') {
        onSaved()
      }
    } catch (err) {
      console.error('Ошибка сохранения кассы:', err)
      setError(
        err?.message
          ? `Не удалось сохранить кассу: ${err.message}`
          : 'Не удалось сохранить кассу',
      )
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div
      className="cash-register-modal-overlay"
      onClick={submitting ? undefined : onClose}
      role="presentation"
    >
      <div
        className="cash-register-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="cash-register-modal-title"
        onClick={(event) => event.stopPropagation()}
      >
        <h2 id="cash-register-modal-title" className="cash-register-modal__title">
          {isEditing ? 'Редактировать кассу' : 'Новая касса'}
        </h2>

        <form onSubmit={handleSubmit}>
          <label className="cash-register-modal__field">
            <span className="cash-register-modal__label">Название кассы *</span>
            <input
              className="cash-register-modal__input"
              name="name"
              placeholder="Например: Основная касса"
              value={form.name}
              onChange={handleChange}
            />
          </label>

          <label className="cash-register-modal__field">
            <span className="cash-register-modal__label">Тип</span>
            <select
              className="cash-register-modal__input"
              name="type"
              value={form.type}
              onChange={handleChange}
            >
              {TYPE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          {isEditing ? (
            <p className="cash-register-modal__hint">
              Текущий баланс:{' '}
              <strong>{formatCurrency(register.balance)}</strong>. Остаток
              изменяется кассовыми операциями, а не в этой форме.
            </p>
          ) : (
            <label className="cash-register-modal__field">
              <span className="cash-register-modal__label">Начальный баланс</span>
              <input
                className="cash-register-modal__input"
                name="balance"
                type="number"
                min="0"
                step="0.01"
                placeholder="0.00"
                value={form.balance}
                onChange={handleChange}
              />
            </label>
          )}

          {error ? (
            <p className="cash-register-modal__error" role="alert">
              {error}
            </p>
          ) : null}

          <div className="cash-register-modal__actions">
            <Button
              type="button"
              className="cash-register-modal__button--secondary"
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

export default CashRegisterModal