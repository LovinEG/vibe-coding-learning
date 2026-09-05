import { useState } from 'react'
import { addSupplier, updateSupplier } from '../../data/suppliers'
import Button from '../ui/Button'
import './SupplierModal.css'

const emptyForm = {
  name: '',
  phone: '',
  email: '',
  address: '',
  notes: '',
}

function createInitialForm(supplier) {
  return supplier
    ? {
        name: supplier.name ?? '',
        phone: supplier.phone ?? '',
        email: supplier.email ?? '',
        address: supplier.address ?? '',
        notes: supplier.notes ?? '',
      }
    : emptyForm
}

function SupplierModal({ open, supplier, onClose, onSaved }) {
  // Форма инициализируется один раз при монтировании: сброс при повторном
  // открытии обеспечивает key={...} на компоненте в SuppliersPage
  // (идиома React для «state resets when prop changes»).
  const [form, setForm] = useState(() => createInitialForm(supplier))
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const isEditing = Boolean(supplier?.id)

  if (!open) {
    return null
  }

  function handleChange(event) {
    const { name, value } = event.target
    setForm((prev) => ({ ...prev, [name]: value }))
  }

  function validate() {
    if (!form.name.trim()) {
      return 'Укажите название поставщика'
    }

    const email = form.email.trim()
    if (email && !/^\S+@\S+\.\S+$/.test(email)) {
      return 'Укажите корректный email или оставьте поле пустым'
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
      const supplierData = {
        name: form.name.trim(),
        phone: form.phone.trim() || null,
        email: form.email.trim() || null,
        address: form.address.trim() || null,
        notes: form.notes.trim() || null,
      }

      if (isEditing) {
        await updateSupplier(supplier.id, supplierData)
      } else {
        await addSupplier(supplierData)
      }

      onClose()
      if (typeof onSaved === 'function') {
        onSaved()
      }
    } catch (err) {
      console.error('Ошибка сохранения поставщика:', err)
      setError(
        err?.message
          ? `Не удалось сохранить поставщика: ${err.message}`
          : 'Не удалось сохранить поставщика',
      )
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div
      className="supplier-modal-overlay"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !submitting) {
          onClose()
        }
      }}
    >
      <div
        className="supplier-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="supplier-modal-title"
      >
        <h2 className="supplier-modal__title" id="supplier-modal-title">
          {isEditing ? 'Редактировать поставщика' : 'Новый поставщик'}
        </h2>

        {error ? (
          <p className="supplier-modal__error" role="alert">
            {error}
          </p>
        ) : null}

        <form onSubmit={handleSubmit} noValidate>
          <label className="supplier-modal__field">
            <span className="supplier-modal__label">Название *</span>
            <input
              className="supplier-modal__input"
              name="name"
              value={form.name}
              onChange={handleChange}
              placeholder="ООО «ЗапчастиОпт»"
              disabled={submitting}
            />
          </label>

          <label className="supplier-modal__field">
            <span className="supplier-modal__label">Телефон</span>
            <input
              className="supplier-modal__input"
              name="phone"
              value={form.phone}
              onChange={handleChange}
              placeholder="+7 495 123-45-67"
              disabled={submitting}
            />
          </label>

          <label className="supplier-modal__field">
            <span className="supplier-modal__label">Email</span>
            <input
              className="supplier-modal__input"
              name="email"
              type="email"
              value={form.email}
              onChange={handleChange}
              placeholder="sales@example.ru"
              disabled={submitting}
            />
          </label>

          <label className="supplier-modal__field">
            <span className="supplier-modal__label">Адрес</span>
            <input
              className="supplier-modal__input"
              name="address"
              value={form.address}
              onChange={handleChange}
              placeholder="г. Москва, ул. Складская, д. 1"
              disabled={submitting}
            />
          </label>

          <label className="supplier-modal__field">
            <span className="supplier-modal__label">Заметки</span>
            <textarea
              className="supplier-modal__input supplier-modal__textarea"
              name="notes"
              value={form.notes}
              onChange={handleChange}
              placeholder="Условия поставки, контакты менеджера..."
              disabled={submitting}
            />
          </label>

          <div className="supplier-modal__actions">
            <Button
              className="supplier-modal__button--secondary"
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

export default SupplierModal