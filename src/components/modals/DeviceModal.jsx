import { useEffect, useMemo, useState } from 'react'
import { addDevice, updateDevice } from '../../data/devices'
import { getClients } from '../../data/clients'
import Button from '../ui/Button'
import './DeviceModal.css'

const DEVICE_TYPES = ['Смартфон', 'Ноутбук', 'Планшет', 'Прочее']

const emptyForm = {
  clientId: '',
  brand: '',
  model: '',
  serialNumber: '',
  deviceType: 'Смартфон',
}

function createInitialForm(device) {
  return device
    ? {
        clientId: device.clientId ?? '',
        brand: device.brand ?? '',
        model: device.model ?? '',
        serialNumber: device.serialNumber ?? '',
        deviceType: device.deviceType || 'Смартфон',
      }
    : emptyForm
}

function DeviceModal({ open, device, onClose, onSaved }) {
  // Форма инициализируется один раз при монтировании: сброс при повторном
  // открытии обеспечивает key={...} на компоненте в DevicesPage
  // (идиома React для «state resets when prop changes»).
  const [form, setForm] = useState(() => createInitialForm(device))
  const [clients, setClients] = useState([])
  const [optionsLoading, setOptionsLoading] = useState(false)
  const [clientSearch, setClientSearch] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const isEditing = Boolean(device?.id)

  // Справочник клиентов запрашивается при каждом открытии модалки.
  useEffect(() => {
    if (!open) {
      return undefined
    }

    let cancelled = false

    async function loadClients() {
      setOptionsLoading(true)

      try {
        const result = await getClients()

        if (!cancelled) {
          setClients(result)
        }
      } catch (err) {
        if (!cancelled) {
          console.error('Не удалось загрузить клиентов:', err)
        }
      } finally {
        if (!cancelled) {
          setOptionsLoading(false)
        }
      }
    }

    loadClients()

    return () => {
      cancelled = true
    }
  }, [open])

  const normalizedClientSearch = clientSearch.trim().toLowerCase()

  const clientOptions = useMemo(() => {
    const matched = normalizedClientSearch
      ? clients.filter(
          (client) =>
            client.name.toLowerCase().includes(normalizedClientSearch) ||
            (client.phone ?? '').toLowerCase().includes(normalizedClientSearch),
        )
      : clients

    // Выбранный клиент должен оставаться в списке, даже если не подпадает
    // под текущий поиск.
    const selected = clients.find((client) => client.id === form.clientId)

    if (selected && !matched.some((client) => client.id === selected.id)) {
      return [selected, ...matched]
    }

    return matched
  }, [clients, normalizedClientSearch, form.clientId])

  if (!open) {
    return null
  }

  function handleChange(event) {
    const { name, value } = event.target
    setForm((prev) => ({ ...prev, [name]: value }))
  }

  function validate() {
    if (!form.clientId) {
      return 'Выберите клиента'
    }

    if (!form.brand.trim()) {
      return 'Укажите бренд устройства'
    }

    if (!form.model.trim()) {
      return 'Укажите модель устройства'
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
      const deviceData = {
        clientId: form.clientId,
        brand: form.brand.trim(),
        model: form.model.trim(),
        serialNumber: form.serialNumber.trim(),
        deviceType: form.deviceType,
      }

      if (isEditing) {
        await updateDevice(device.id, deviceData)
      } else {
        await addDevice(deviceData)
      }

      onClose()

      if (typeof onSaved === 'function') {
        onSaved()
      }
    } catch (err) {
      console.error('Ошибка сохранения устройства:', err)
      setError(
        err?.message
          ? `Не удалось сохранить устройство: ${err.message}`
          : 'Не удалось сохранить устройство',
      )
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div
      className="device-modal-overlay"
      onClick={submitting ? undefined : onClose}
      role="presentation"
    >
      <div
        className="device-modal"
        role="dialog"
        aria-modal="true"
        aria-label={isEditing ? 'Редактирование устройства' : 'Новое устройство'}
        onClick={(event) => event.stopPropagation()}
      >
        <h2 className="device-modal__title">
          {isEditing ? 'Редактирование устройства' : 'Новое устройство'}
        </h2>

        <form onSubmit={handleSubmit} noValidate>
          <label className="device-modal__field">
            <span className="device-modal__label">Клиент *</span>
            <input
              className="device-modal__input"
              type="search"
              placeholder="Поиск по имени или телефону..."
              value={clientSearch}
              onChange={(event) => setClientSearch(event.target.value)}
            />
            <select
              className="device-modal__input device-modal__select"
              name="clientId"
              value={form.clientId}
              onChange={handleChange}
              disabled={optionsLoading}
            >
              <option value="">
                {optionsLoading ? 'Загрузка клиентов...' : 'Выберите клиента'}
              </option>
              {clientOptions.map((client) => (
                <option key={client.id} value={client.id}>
                  {client.name}
                  {client.phone ? ` — ${client.phone}` : ''}
                </option>
              ))}
            </select>
          </label>

          {!optionsLoading && clientOptions.length === 0 ? (
            <p className="device-modal__hint device-modal__hint--error">
              Клиенты не найдены. Измените поисковый запрос.
            </p>
          ) : (
            <p className="device-modal__hint">
              Найдено клиентов: {clientOptions.length}
            </p>
          )}

          <label className="device-modal__field">
            <span className="device-modal__label">Бренд *</span>
            <input
              className="device-modal__input"
              name="brand"
              placeholder="Apple, Samsung, Xiaomi..."
              value={form.brand}
              onChange={handleChange}
            />
          </label>

          <label className="device-modal__field">
            <span className="device-modal__label">Модель *</span>
            <input
              className="device-modal__input"
              name="model"
              placeholder="iPhone 13 Pro"
              value={form.model}
              onChange={handleChange}
            />
          </label>

          <label className="device-modal__field">
            <span className="device-modal__label">Тип устройства</span>
            <select
              className="device-modal__input"
              name="deviceType"
              value={form.deviceType}
              onChange={handleChange}
            >
              {DEVICE_TYPES.map((type) => (
                <option key={type} value={type}>
                  {type}
                </option>
              ))}
            </select>
          </label>

          <label className="device-modal__field">
            <span className="device-modal__label">Серийный номер / IMEI</span>
            <input
              className="device-modal__input device-modal__input--mono"
              name="serialNumber"
              placeholder="F2LX9K3QWP1F"
              value={form.serialNumber}
              onChange={handleChange}
            />
          </label>

          {error ? (
            <p className="device-modal__error" role="alert">
              {error}
            </p>
          ) : null}

          <div className="device-modal__actions">
            <Button
              type="button"
              className="device-modal__button--secondary"
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

export default DeviceModal