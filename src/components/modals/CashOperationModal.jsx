import { useEffect, useState } from 'react'
import { addCashOperation } from '../../data/cashOperations'
import { getCashRegisters } from '../../data/cashRegisters'
import Button from '../ui/Button'
import './CashOperationModal.css'

const TYPE_OPTIONS = [
  { value: 'income', label: 'Доход' },
  { value: 'expense', label: 'Расход' },
]

const CATEGORY_OPTIONS = [
  { value: 'Аренда', label: 'Аренда' },
  { value: 'Зарплата', label: 'Зарплата' },
  { value: 'Маркетинг', label: 'Маркетинг' },
  { value: 'Канцелярия', label: 'Канцелярия' },
  { value: 'Прочее', label: 'Прочее' },
]

const emptyForm = {
  type: 'expense',
  cashRegisterId: '',
  category: '',
  amount: '',
  comment: '',
}

function CashOperationModal({ open, onClose, onSaved }) {
  const [form, setForm] = useState(emptyForm)
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
        }
      } catch (err) {
        if (!cancelled) {
          console.error('Не удалось загрузить кассы для операции:', err)
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

    if (!form.category.trim()) {
      return 'Укажите категорию'
    }

    const amount = Number(form.amount)

    if (form.amount === '' || !Number.isFinite(amount)) {
      return 'Укажите корректную сумму'
    }

    if (amount <= 0) {
      return 'Сумма должна быть больше нуля'
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
      await addCashOperation({
        cashRegisterId: form.cashRegisterId,
        type: form.type,
        category: form.category.trim(),
        amount: Number(form.amount),
        comment: form.comment.trim() || null,
      })

      if (onSaved) {
        await onSaved()
      }

      onClose()
    } catch (err) {
      console.error('Не удалось провести операцию:', err)
      setError('Не удалось провести операцию. Попробуйте ещё раз.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div
      className="cash-operation-modal-overlay"
      onClick={submitting ? undefined : onClose}
    >
      <div
        className="cash-operation-modal"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Кассовая операция"
      >
        <h2 className="cash-operation-modal__title">Кассовая операция</h2>

        <form onSubmit={handleSubmit} noValidate>
          <label className="cash-operation-modal__field">
            <span className="cash-operation-modal__label">Тип операции</span>
            <select
              className="cash-operation-modal__input"
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

          <label className="cash-operation-modal__field">
            <span className="cash-operation-modal__label">Касса *</span>
            <select
              className="cash-operation-modal__input"
              name="cashRegisterId"
              value={form.cashRegisterId}
              onChange={handleChange}
              disabled={optionsLoading}
            >
              <option value="">
                {optionsLoading
                  ? 'Загрузка касс...'
                  : 'Выберите кассу'}
              </option>
              {cashRegisters.map((register) => (
                <option key={register.id} value={register.id}>
                  {register.name}
                </option>
              ))}
            </select>
          </label>

          <label className="cash-operation-modal__field">
            <span className="cash-operation-modal__label">Категория *</span>
            <select
              className="cash-operation-modal__input"
              name="category"
              value={form.category}
              onChange={handleChange}
            >
              <option value="">Выберите категорию</option>
              {CATEGORY_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <label className="cash-operation-modal__field">
            <span className="cash-operation-modal__label">Сумма *</span>
            <input
              className="cash-operation-modal__input"
              name="amount"
              type="number"
              min="0.01"
              step="0.01"
              placeholder="0.00"
              value={form.amount}
              onChange={handleChange}
            />
          </label>

          <label className="cash-operation-modal__field">
            <span className="cash-operation-modal__label">Комментарий</span>
            <textarea
              className="cash-operation-modal__input cash-operation-modal__textarea"
              name="comment"
              rows={3}
              placeholder="Детали операции..."
              value={form.comment}
              onChange={handleChange}
            />
          </label>

          {!optionsLoading && cashRegisters.length === 0 ? (
            <p className="cash-operation-modal__hint cash-operation-modal__hint--error">
              Кассы не найдены. Сначала добавьте кассу в разделе «Кассы».
            </p>
          ) : null}

          {error ? (
            <p className="cash-operation-modal__error" role="alert">
              {error}
            </p>
          ) : null}

          <div className="cash-operation-modal__actions">
            <Button
              type="button"
              className="cash-operation-modal__button--secondary"
              onClick={onClose}
              disabled={submitting}
            >
              Отмена
            </Button>
            <Button type="submit" disabled={submitting || optionsLoading}>
              {submitting ? 'Проведение...' : 'Провести операцию'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default CashOperationModal
