import { useState } from 'react'
import { createOrder } from '../../data/orders'
import Button from '../ui/Button'
import './CreateOrderModal.css'

const emptyForm = {
  client: '',
  clientPhone: '',
  brand: '',
  device: '',
  serialNumber: '',
  defect: '',
  price: '',
}

function generateOrderNumber() {
  // Временная автонумерация: # + случайное 6-значное число
  return `#${Math.floor(100000 + Math.random() * 900000)}`
}

function CreateOrderModal({ open, onClose, onOrderCreated }) {
  const [form, setForm] = useState(emptyForm)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  if (!open) {
    return null
  }

  function handleChange(event) {
    const { name, value } = event.target
    setForm((prev) => ({ ...prev, [name]: value }))
  }

  async function handleSubmit(event) {
    event.preventDefault()

    setError('')
    setSubmitting(true)

    try {
      const orderData = {
        orderNumber: generateOrderNumber(),
        client: form.client.trim(),
        clientPhone: form.clientPhone.trim(),
        brand: form.brand.trim(),
        device: form.device.trim(),
        serialNumber: form.serialNumber.trim() || null,
        status: 'Новый',
        defect: form.defect.trim(),
        price: Number(form.price),
        acceptedAt: new Date().toISOString(),
      }

      await createOrder(orderData)

      setForm({ ...emptyForm })
      onClose()
      if (typeof onOrderCreated === 'function') {
        onOrderCreated()
      }
    } catch (err) {
      console.error('Ошибка создания заказа:', err)
      setError(
        err?.message
          ? `Не удалось создать заказ: ${err.message}`
          : 'Не удалось создать заказ',
      )
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="create-order-overlay" onClick={onClose}>
      <div
        className="create-order-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="create-order-title"
        onClick={(event) => event.stopPropagation()}
      >
        <h2 id="create-order-title" className="create-order-modal__title">
          Новый заказ
        </h2>

        <form className="create-order-modal__form" onSubmit={handleSubmit}>
          <label className="create-order-modal__field">
            <span className="create-order-modal__label">Имя клиента</span>
            <input
              className="create-order-modal__input"
              name="client"
              value={form.client}
              onChange={handleChange}
              placeholder="Иван Петров"
              required
            />
          </label>

          <label className="create-order-modal__field">
            <span className="create-order-modal__label">Телефон</span>
            <input
              className="create-order-modal__input"
              name="clientPhone"
              value={form.clientPhone}
              onChange={handleChange}
              placeholder="+7 900 000-00-00"
              type="tel"
              required
            />
          </label>

          <label className="create-order-modal__field">
            <span className="create-order-modal__label">Бренд</span>
            <input
              className="create-order-modal__input"
              name="brand"
              value={form.brand}
              onChange={handleChange}
              placeholder="Samsung"
            />
          </label>

          <label className="create-order-modal__field">
            <span className="create-order-modal__label">Модель устройства</span>
            <input
              className="create-order-modal__input"
              name="device"
              value={form.device}
              onChange={handleChange}
              placeholder="Galaxy S21"
              required
            />
          </label>

          <label className="create-order-modal__field">
            <span className="create-order-modal__label">
              Серийный номер (опционально)
            </span>
            <input
              className="create-order-modal__input"
              name="serialNumber"
              value={form.serialNumber}
              onChange={handleChange}
              placeholder="SN123456789"
            />
          </label>

          <label className="create-order-modal__field">
            <span className="create-order-modal__label">Неисправность</span>
            <textarea
              className="create-order-modal__input create-order-modal__textarea"
              name="defect"
              value={form.defect}
              onChange={handleChange}
              placeholder="Описание неисправности"
              required
            />
          </label>

          <label className="create-order-modal__field">
            <span className="create-order-modal__label">Стоимость, ₽</span>
            <input
              className="create-order-modal__input"
              name="price"
              value={form.price}
              onChange={handleChange}
              placeholder="4500"
              type="number"
              min="0"
              step="0.01"
              required
            />
          </label>

          {error && (
            <p className="create-order-modal__error" role="alert">
              {error}
            </p>
          )}

          <div className="create-order-modal__actions">
            <Button
              type="button"
              className="create-order-modal__button create-order-modal__button--secondary"
              onClick={onClose}
              disabled={submitting}
            >
              Отмена
            </Button>
            <Button
              type="submit"
              className="create-order-modal__button"
              disabled={submitting}
            >
              {submitting ? 'Создание...' : 'Создать заказ'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default CreateOrderModal