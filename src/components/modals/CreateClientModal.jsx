import { useState } from 'react'
import { createClient, updateClient } from '../../data/clients'
import Button from '../ui/Button'
import './CreateClientModal.css'

// Модалка создания/редактирования клиента. Если передан client — режим
// редактирования (поля презаполняются, сохранение через updateClient).
function CreateClientModal({ open, client, onClose, onSaved }) {
  const isEditing = Boolean(client?.id)

  const [form, setForm] = useState(() => ({
    name: client?.name ?? '',
    phone: client?.phone ?? '',
    email: client?.email ?? '',
    notes: client?.notes ?? '',
  }))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  if (!open) {
    return null
  }

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

    if (!form.name.trim()) {
      setError('Укажите имя клиента')
      return
    }

    if (!form.phone.trim()) {
      setError('Укажите телефон клиента')
      return
    }

    setSaving(true)

    try {
      const payload = {
        name: form.name.trim(),
        phone: form.phone.trim(),
        email: form.email.trim() || null,
        notes: form.notes.trim() || null,
      }

      if (isEditing) {
        await updateClient(client.id, payload)
      } else {
        await createClient(payload)
      }

      if (typeof onSaved === 'function') {
        onSaved()
      }
      onClose()
    } catch (err) {
      console.error('Не удалось сохранить клиента:', err)
      setError('Не удалось сохранить клиента. Попробуйте ещё раз.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div
      className="create-client-overlay"
      onClick={handleOverlayClick}
      role="presentation"
    >
      <div
        className="create-client-modal"
        onClick={handleCardClick}
        role="dialog"
        aria-modal="true"
        aria-label={isEditing ? 'Редактирование клиента' : 'Новый клиент'}
      >
        <div className="create-client-modal__head">
          <h2 className="create-client-modal__title">
            {isEditing ? 'Редактирование клиента' : 'Новый клиент'}
          </h2>
          <button
            type="button"
            className="create-client-modal__close"
            onClick={onClose}
            aria-label="Закрыть"
          >
            ×
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <label className="create-client-modal__field">
            <span className="create-client-modal__label">ФИО *</span>
            <input
              className="create-client-modal__input"
              name="name"
              value={form.name}
              onChange={handleChange}
              placeholder="Иван Петров"
              required
            />
          </label>

          <div className="create-client-modal__row">
            <label className="create-client-modal__field">
              <span className="create-client-modal__label">Телефон *</span>
              <input
                className="create-client-modal__input"
                name="phone"
                value={form.phone}
                onChange={handleChange}
                placeholder="+7 900 000-00-00"
                type="tel"
                required
              />
            </label>

            <label className="create-client-modal__field">
              <span className="create-client-modal__label">Email</span>
              <input
                className="create-client-modal__input"
                name="email"
                value={form.email}
                onChange={handleChange}
                placeholder="client@mail.ru"
                type="email"
              />
            </label>
          </div>

          <label className="create-client-modal__field">
            <span className="create-client-modal__label">
              Заметки / Комментарий
            </span>
            <textarea
              className="create-client-modal__input create-client-modal__textarea"
              name="notes"
              rows={3}
              value={form.notes}
              onChange={handleChange}
              placeholder="Постоянный клиент, предпочитает WhatsApp..."
            />
          </label>

          {error ? (
            <p className="create-client-modal__error" role="alert">
              {error}
            </p>
          ) : null}

          <div className="create-client-modal__actions">
            <Button
              type="button"
              className="create-client-modal__button--secondary"
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

export default CreateClientModal
