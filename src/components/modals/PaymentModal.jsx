import { useEffect, useState } from 'react'
import { addPayment } from '../../data/payments'
import { getCashRegisters } from '../../data/cashRegisters'
import { getOrders } from '../../data/orders'
import { getClients } from '../../data/clients'
import Button from '../ui/Button'
import './PaymentModal.css'

const TYPE_OPTIONS = [
  { value: 'income', label: 'Приход' },
  { value: 'expense', label: 'Расход' },
]

const PAYMENT_METHOD_OPTIONS = [
  { value: 'cash', label: 'Наличные' },
  { value: 'card', label: 'Карта' },
  { value: 'transfer', label: 'Перевод' },
]

const emptyForm = {
  type: 'income',
  cashRegisterId: '',
  amount: '',
  paymentMethod: 'cash',
  orderId: '',
  clientId: '',
  comment: '',
}

function PaymentModal({ open, onClose, onSaved }) {
  // Форма инициализируется один раз при монтировании: сброс при повторном
  // открытии обеспечивает стабильный key={...} на компоненте в родителе.
  const [form, setForm] = useState(emptyForm)
  const [cashRegisters, setCashRegisters] = useState([])
  const [orders, setOrders] = useState([])
  const [clients, setClients] = useState([])
  const [optionsLoading, setOptionsLoading] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  // Справочники (кассы, заказы, клиенты) запрашиваются при каждом открытии.
  useEffect(() => {
    if (!open) {
      return undefined
    }

    let cancelled = false

    async function loadOptions() {
      setOptionsLoading(true)

      try {
        const [registers, ordersResult, clientsResult] = await Promise.all([
          getCashRegisters(),
          getOrders(),
          getClients(),
        ])

        if (!cancelled) {
          setCashRegisters(registers)
          setOrders(ordersResult)
          setClients(clientsResult)
        }
      } catch (err) {
        if (!cancelled) {
          console.error('Не удалось загрузить справочники платежей:', err)
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
      await addPayment({
        cashRegisterId: form.cashRegisterId,
        orderId: form.orderId || null,
        clientId: form.clientId || null,
        type: form.type,
        amount: Number(form.amount),
        paymentMethod: form.paymentMethod,
        comment: form.comment.trim() || null,
      })

      onClose()

      if (typeof onSaved === 'function') {
        onSaved()
      }
    } catch (err) {
      console.error('Ошибка проведения платежа:', err)
      setError(
        err?.message
          ? `Не удалось провести платеж: ${err.message}`
          : 'Не удалось провести платеж',
      )
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div
      className="payment-modal-overlay"
      onClick={submitting ? undefined : onClose}
      role="presentation"
    >
      <div
        className="payment-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="payment-modal-title"
        onClick={(event) => event.stopPropagation()}
      >
        <h2 id="payment-modal-title" className="payment-modal__title">
          Внести платеж
        </h2>

        <form onSubmit={handleSubmit}>
          <div className="payment-modal__row">
            <label className="payment-modal__field">
              <span className="payment-modal__label">Тип операции</span>
              <select
                className="payment-modal__input"
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

            <label className="payment-modal__field">
              <span className="payment-modal__label">Способ оплаты</span>
              <select
                className="payment-modal__input"
                name="paymentMethod"
                value={form.paymentMethod}
                onChange={handleChange}
              >
                {PAYMENT_METHOD_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <label className="payment-modal__field">
            <span className="payment-modal__label">Касса *</span>
            <select
              className="payment-modal__input"
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
                  {register.name}
                </option>
              ))}
            </select>
          </label>

          <label className="payment-modal__field">
            <span className="payment-modal__label">Сумма *</span>
            <input
              className="payment-modal__input"
              name="amount"
              type="number"
              min="0.01"
              step="0.01"
              placeholder="0.00"
              value={form.amount}
              onChange={handleChange}
            />
          </label>

          <div className="payment-modal__row">
            <label className="payment-modal__field">
              <span className="payment-modal__label">Заказ</span>
              <select
                className="payment-modal__input"
                name="orderId"
                value={form.orderId}
                onChange={handleChange}
                disabled={optionsLoading}
              >
                <option value="">
                  {optionsLoading ? 'Загрузка заказов...' : 'Не выбран'}
                </option>
                {orders.map((order) => (
                  <option key={order.id} value={order.id}>
                    {order.orderNumber}
                  </option>
                ))}
              </select>
            </label>

            <label className="payment-modal__field">
              <span className="payment-modal__label">Клиент</span>
              <select
                className="payment-modal__input"
                name="clientId"
                value={form.clientId}
                onChange={handleChange}
                disabled={optionsLoading}
              >
                <option value="">
                  {optionsLoading ? 'Загрузка клиентов...' : 'Не выбран'}
                </option>
                {clients.map((client) => (
                  <option key={client.id} value={client.id}>
                    {client.name}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <label className="payment-modal__field">
            <span className="payment-modal__label">Комментарий</span>
            <textarea
              className="payment-modal__input payment-modal__textarea"
              name="comment"
              rows={3}
              placeholder="Назначение платежа, детали..."
              value={form.comment}
              onChange={handleChange}
            />
          </label>

          {!optionsLoading && cashRegisters.length === 0 ? (
            <p className="payment-modal__hint payment-modal__hint--error">
              Кассы не найдены. Сначала добавьте кассу в разделе «Кассы».
            </p>
          ) : null}

          {error ? (
            <p className="payment-modal__error" role="alert">
              {error}
            </p>
          ) : null}

          <div className="payment-modal__actions">
            <Button
              type="button"
              className="payment-modal__button--secondary"
              onClick={onClose}
              disabled={submitting}
            >
              Отмена
            </Button>
            <Button type="submit" disabled={submitting || optionsLoading}>
              {submitting ? 'Проведение...' : 'Провести платеж'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default PaymentModal