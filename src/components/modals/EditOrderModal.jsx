import { useEffect, useState } from 'react'
import { REPAIR_TYPE_OPTIONS, updateOrder } from '../../data/orders'
import { getEmployees } from '../../data/tasks'
import Button from '../ui/Button'
import './EditOrderModal.css'

// ISO-строка → значение для <input type="datetime-local">.
function toLocalInput(iso) {
  if (!iso) {
    return ''
  }

  const date = new Date(iso)

  if (Number.isNaN(date.getTime())) {
    return ''
  }

  const pad = (value) => String(value).padStart(2, '0')

  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(
    date.getDate(),
  )}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

// Модалка редактирования заказа: мастер, тип ремонта, срок, стоимость,
// неисправность и данные приёмки. Презаполняется данными заказа.
function EditOrderModal({ order, onClose, onSaved }) {
  const [employees, setEmployees] = useState([])
  const [form, setForm] = useState({
    masterId: order.masterId ?? '',
    repairType: order.repairType ?? '',
    deadlineAt: toLocalInput(order.deadlineAt),
    estimatedCost: order.price ?? '',
    problemDescription: order.defect ?? '',
    appearance: order.appearance ?? '',
    equipment: order.equipment ?? '',
    deviceCondition: order.deviceCondition ?? '',
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false

    getEmployees()
      .then((data) => {
        if (!cancelled) {
          setEmployees(data ?? [])
        }
      })
      .catch((err) => console.error('Не удалось загрузить мастеров:', err))

    return () => {
      cancelled = true
    }
  }, [])

  function handleChange(event) {
    const { name, value } = event.target
    setForm((prev) => ({ ...prev, [name]: value }))
  }

  function handleOverlayClick(event) {
    if (event.target === event.currentTarget) {
      onClose()
    }
  }

  function handleCardClick(event) {
    event.stopPropagation()
  }

  async function handleSubmit(event) {
    event.preventDefault()
    setError('')

    const estimatedCost = Number(form.estimatedCost)

    if (
      form.estimatedCost === '' ||
      !Number.isFinite(estimatedCost) ||
      estimatedCost < 0
    ) {
      setError('Предварительная стоимость — неотрицательное число')
      return
    }

    setSaving(true)

    try {
      await updateOrder(order.id, {
        masterId: form.masterId || null,
        repairType: form.repairType || null,
        deadlineAt: form.deadlineAt
          ? new Date(form.deadlineAt).toISOString()
          : null,
        estimatedCost,
        problemDescription: form.problemDescription.trim() || null,
        appearance: form.appearance.trim() || null,
        equipment: form.equipment.trim() || null,
        deviceCondition: form.deviceCondition.trim() || null,
      })

      if (typeof onSaved === 'function') {
        onSaved()
      }
      onClose()
    } catch (err) {
      console.error('Не удалось сохранить заказ:', err)
      setError('Не удалось сохранить изменения. Попробуйте ещё раз.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div
      className="edit-order-overlay"
      onClick={handleOverlayClick}
      role="presentation"
    >
      <div
        className="edit-order-modal"
        onClick={handleCardClick}
        role="dialog"
        aria-modal="true"
        aria-label={`Редактирование заказа ${order.orderNumber}`}
      >
        <div className="edit-order-modal__head">
          <h2 className="edit-order-modal__title">
            Редактирование заказа {order.orderNumber}
          </h2>
          <button
            type="button"
            className="edit-order-modal__close"
            onClick={onClose}
            aria-label="Закрыть"
          >
            ×
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="edit-order-modal__row">
            <label className="edit-order-modal__field">
              <span>Ответственный мастер</span>
              <select
                className="edit-order-modal__input"
                name="masterId"
                value={form.masterId}
                onChange={handleChange}
              >
                <option value="">Не назначен</option>
                {employees.map((employee) => (
                  <option key={employee.id} value={employee.id}>
                    {employee.fullName}
                  </option>
                ))}
              </select>
            </label>

            <label className="edit-order-modal__field">
              <span>Тип ремонта</span>
              <select
                className="edit-order-modal__input"
                name="repairType"
                value={form.repairType}
                onChange={handleChange}
              >
                <option value="">Не указан</option>
                {REPAIR_TYPE_OPTIONS.map((type) => (
                  <option key={type} value={type}>
                    {type}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="edit-order-modal__row">
            <label className="edit-order-modal__field">
              <span>Срок / Дедлайн</span>
              <input
                className="edit-order-modal__input"
                type="datetime-local"
                name="deadlineAt"
                value={form.deadlineAt}
                onChange={handleChange}
              />
            </label>

            <label className="edit-order-modal__field">
              <span>Предварительная стоимость, ₽ *</span>
              <input
                className="edit-order-modal__input"
                type="number"
                name="estimatedCost"
                min="0"
                step="0.01"
                value={form.estimatedCost}
                onChange={handleChange}
              />
            </label>
          </div>

          <label className="edit-order-modal__field">
            <span>Заявленная неисправность</span>
            <textarea
              className="edit-order-modal__input edit-order-modal__textarea"
              rows={3}
              name="problemDescription"
              placeholder="Что заявил клиент при приёме..."
              value={form.problemDescription}
              onChange={handleChange}
            />
          </label>

          <div className="edit-order-modal__row edit-order-modal__row--three">
            <label className="edit-order-modal__field">
              <span>Внешний вид</span>
              <input
                className="edit-order-modal__input"
                type="text"
                name="appearance"
                placeholder="Царапины, потёртости..."
                value={form.appearance}
                onChange={handleChange}
              />
            </label>

            <label className="edit-order-modal__field">
              <span>Комплектация</span>
              <input
                className="edit-order-modal__input"
                type="text"
                name="equipment"
                placeholder="Зарядка, чехол, коробка..."
                value={form.equipment}
                onChange={handleChange}
              />
            </label>

            <label className="edit-order-modal__field">
              <span>Состояние устройства</span>
              <input
                className="edit-order-modal__input"
                type="text"
                name="deviceCondition"
                placeholder="Сколы, следы влаги..."
                value={form.deviceCondition}
                onChange={handleChange}
              />
            </label>
          </div>

          {error ? (
            <p className="edit-order-modal__error" role="alert">
              {error}
            </p>
          ) : null}

          <div className="edit-order-modal__actions">
            <Button
              type="button"
              className="edit-order-modal__button--secondary"
              onClick={onClose}
              disabled={saving}
            >
              Отмена
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? 'Сохранение...' : 'Сохранить'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default EditOrderModal

