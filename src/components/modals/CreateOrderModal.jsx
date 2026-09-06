import { useEffect, useState } from 'react'
import { createOrder, REPAIR_TYPE_OPTIONS } from '../../data/orders'
import { getClients } from '../../data/clients'
import { getDevices } from '../../data/devices'
import { getEmployees } from '../../data/tasks'
import Button from '../ui/Button'
import './CreateOrderModal.css'

const emptyForm = {
  clientMode: 'new', // 'new' — быстрый ввод, 'existing' — выбор из базы
  existingClientId: '',
  client: '',
  clientPhone: '',
  existingDeviceId: '', // '' — новое устройство
  brand: '',
  device: '',
  serialNumber: '',
  repairType: '',
  masterId: '',
  deadlineAt: '', // datetime-local
  price: '',
  defect: '',
  appearance: '',
  equipment: '',
  deviceCondition: '',
}

function generateOrderNumber() {
  // Временная автонумерация: # + случайное 6-значное число
  return `#${Math.floor(100000 + Math.random() * 900000)}`
}

function CreateOrderModal({ open, onClose, onOrderCreated }) {
  const [form, setForm] = useState(emptyForm)
  const [clients, setClients] = useState([])
  const [devices, setDevices] = useState([])
  const [employees, setEmployees] = useState([])
  const [optionsLoading, setOptionsLoading] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  // Справочники (клиенты, устройства, мастера) — при каждом открытии.
  useEffect(() => {
    if (!open) {
      return undefined
    }

    let cancelled = false

    async function loadOptions() {
      setOptionsLoading(true)

      try {
        const [clientsData, devicesData, employeesData] = await Promise.all([
          getClients(),
          getDevices(),
          getEmployees(),
        ])

        if (!cancelled) {
          setClients(clientsData)
          setDevices(devicesData)
          setEmployees(employeesData)
        }
      } catch (err) {
        if (!cancelled) {
          console.error('Не удалось загрузить справочники:', err)
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

  // Устройства выбранного существующего клиента.
  const selectedClient =
    clients.find((client) => client.id === form.existingClientId) ?? null

  const selectedClientDevices = selectedClient
    ? devices.filter((device) => device.clientId === selectedClient.id)
    : []

  const selectedDevice =
    form.existingDeviceId === 'new'
      ? null
      : selectedClientDevices.find(
          (device) => device.id === form.existingDeviceId,
        ) ?? null

  function handleChange(event) {
    const { name, value } = event.target
    setForm((prev) => ({ ...prev, [name]: value }))
  }

  function handleClientModeChange(mode) {
    setForm((prev) => ({
      ...prev,
      clientMode: mode,
      existingClientId: mode === 'existing' ? prev.existingClientId : '',
      existingDeviceId: mode === 'existing' ? prev.existingDeviceId : '',
    }))
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

    // --- Валидация клиента ---
    const isExistingClient = form.clientMode === 'existing'

    if (isExistingClient && !form.existingClientId) {
      setError('Выберите существующего клиента')
      return
    }

    if (!isExistingClient && (!form.client.trim() || !form.clientPhone.trim())) {
      setError('Укажите имя и телефон клиента')
      return
    }

    // --- Валидация устройства ---
    const useExistingDevice =
      isExistingClient &&
      form.existingDeviceId !== '' &&
      form.existingDeviceId !== 'new'

    if (!useExistingDevice && !form.device.trim()) {
      setError('Укажите модель устройства')
      return
    }

    // --- Валидация стоимости ---
    const estimatedCost = Number(form.price)

    if (
      form.price === '' ||
      !Number.isFinite(estimatedCost) ||
      estimatedCost < 0
    ) {
      setError('Предварительная стоимость — неотрицательное число')
      return
    }

    setSubmitting(true)

    try {
      // Данные выбранного клиента/устройства — для текстовых дублей в orders.
      const clientName = isExistingClient
        ? selectedClient?.name ?? ''
        : form.client.trim()
      const clientPhone = isExistingClient
        ? selectedClient?.phone ?? ''
        : form.clientPhone.trim()
      const deviceModel = useExistingDevice
        ? `${selectedDevice?.brand ?? ''} ${selectedDevice?.model ?? ''}`.trim()
        : form.device.trim()

      await createOrder({
        orderNumber: generateOrderNumber(),
        // Клиент: существующий (clientId) или быстрый ввод нового.
        clientId: isExistingClient ? form.existingClientId : null,
        client: clientName,
        clientPhone,
        // Устройство: существующее (deviceId) или новое из полей формы.
        deviceId: useExistingDevice ? form.existingDeviceId : null,
        brand: useExistingDevice
          ? selectedDevice?.brand ?? ''
          : form.brand.trim(),
        device: deviceModel,
        serialNumber: useExistingDevice
          ? selectedDevice?.serialNumber ?? null
          : form.serialNumber.trim() || null,
        status: 'Новый',
        // Первичная приёмка.
        defect: form.defect.trim(),
        appearance: form.appearance.trim() || null,
        equipment: form.equipment.trim() || null,
        deviceCondition: form.deviceCondition.trim() || null,
        // Параметры ремонта и финансы.
        repairType: form.repairType || null,
        masterId: form.masterId || null,
        // Дедлайн конвертируется в ISO перед отправкой в БД.
        deadlineAt: form.deadlineAt
          ? new Date(form.deadlineAt).toISOString()
          : null,
        price: estimatedCost,
        acceptedAt: new Date().toISOString(),
      })

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

  if (!open) {
    return null
  }

  return (
    <div className="create-order-overlay" onClick={handleOverlayClick}>
      <div
        className="create-order-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="create-order-title"
        onClick={handleCardClick}
      >
        <h2 id="create-order-title" className="create-order-modal__title">
          Новый заказ
        </h2>

        <form className="create-order-modal__form" onSubmit={handleSubmit}>
          {/* --- Клиент --- */}
          <p className="create-order-modal__section-title">Клиент</p>

          <div className="create-order-modal__mode-toggle">
            <button
              type="button"
              className={`create-order-modal__mode-button${
                form.clientMode === 'new'
                  ? ' create-order-modal__mode-button--active'
                  : ''
              }`}
              onClick={() => handleClientModeChange('new')}
            >
              Новый клиент
            </button>
            <button
              type="button"
              className={`create-order-modal__mode-button${
                form.clientMode === 'existing'
                  ? ' create-order-modal__mode-button--active'
                  : ''
              }`}
              onClick={() => handleClientModeChange('existing')}
            >
              Существующий
            </button>
          </div>

          {form.clientMode === 'existing' ? (
            <label className="create-order-modal__field">
              <span className="create-order-modal__label">
                Выберите клиента *
              </span>
              <select
                className="create-order-modal__input"
                name="existingClientId"
                value={form.existingClientId}
                onChange={handleChange}
                disabled={optionsLoading}
              >
                <option value="">
                  {optionsLoading ? 'Загрузка...' : 'Клиент из базы'}
                </option>
                {clients.map((client) => (
                  <option key={client.id} value={client.id}>
                    {client.name} · {client.phone}
                  </option>
                ))}
              </select>
            </label>
          ) : (
            <>
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
            </>
          )}

          {/* --- Устройство --- */}
          <p className="create-order-modal__section-title">Устройство</p>

          {form.clientMode === 'existing' ? (
            <label className="create-order-modal__field">
              <span className="create-order-modal__label">
                Устройство клиента
              </span>
              <select
                className="create-order-modal__input"
                name="existingDeviceId"
                value={form.existingDeviceId}
                onChange={handleChange}
              >
                <option value="">Новое устройство</option>
                {selectedClientDevices.map((device) => (
                  <option key={device.id} value={device.id}>
                    {device.brand} {device.model}
                    {device.serialNumber ? ` · SN ${device.serialNumber}` : ''}
                  </option>
                ))}
                <option value="new">+ Новое устройство</option>
              </select>
            </label>
          ) : null}

          {!(form.clientMode === 'existing' && selectedDevice) ? (
            <>
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
                <span className="create-order-modal__label">
                  Модель устройства
                </span>
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
                  IMEI / Серийный номер (опционально)
                </span>
                <input
                  className="create-order-modal__input"
                  name="serialNumber"
                  value={form.serialNumber}
                  onChange={handleChange}
                  placeholder="SN123456789"
                />
              </label>
            </>
          ) : null}

          {/* --- Параметры ремонта --- */}
          <p className="create-order-modal__section-title">
            Параметры ремонта
          </p>

          <div className="create-order-modal__row">
            <label className="create-order-modal__field">
              <span className="create-order-modal__label">Тип ремонта</span>
              <select
                className="create-order-modal__input"
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

            <label className="create-order-modal__field">
              <span className="create-order-modal__label">
                Ответственный мастер
              </span>
              <select
                className="create-order-modal__input"
                name="masterId"
                value={form.masterId}
                onChange={handleChange}
                disabled={optionsLoading}
              >
                <option value="">Не назначен</option>
                {employees.map((employee) => (
                  <option key={employee.id} value={employee.id}>
                    {employee.fullName}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <label className="create-order-modal__field">
            <span className="create-order-modal__label">Срок / Дедлайн</span>
            <input
              className="create-order-modal__input"
              type="datetime-local"
              name="deadlineAt"
              value={form.deadlineAt}
              onChange={handleChange}
            />
          </label>

          <label className="create-order-modal__field">
            <span className="create-order-modal__label">
              Предварительная стоимость, ₽
            </span>
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

          {/* --- Первичная приёмка --- */}
          <p className="create-order-modal__section-title">
            Первичная приёмка
          </p>

          <label className="create-order-modal__field">
            <span className="create-order-modal__label">
              Заявленная неисправность
            </span>
            <textarea
              className="create-order-modal__input create-order-modal__textarea"
              name="defect"
              value={form.defect}
              onChange={handleChange}
              placeholder="Описание неисправности со слов клиента"
              required
            />
          </label>

          <label className="create-order-modal__field">
            <span className="create-order-modal__label">Внешнее состояние</span>
            <input
              className="create-order-modal__input"
              name="appearance"
              value={form.appearance}
              onChange={handleChange}
              placeholder="Мелкие царапины на экране"
            />
          </label>

          <label className="create-order-modal__field">
            <span className="create-order-modal__label">Комплектация</span>
            <input
              className="create-order-modal__input"
              name="equipment"
              value={form.equipment}
              onChange={handleChange}
              placeholder="Без комплекта / Чехол"
            />
          </label>

          <label className="create-order-modal__field">
            <span className="create-order-modal__label">
              Состояние устройства
            </span>
            <input
              className="create-order-modal__input"
              name="deviceCondition"
              value={form.deviceCondition}
              onChange={handleChange}
              placeholder="Не включается"
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