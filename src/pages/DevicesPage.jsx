import { useEffect, useMemo, useState } from 'react'
import DeviceModal from '../components/modals/DeviceModal'
import Button from '../components/ui/Button'
import { deleteDevice, getDevices } from '../data/devices'
import { formatDate } from '../lib/format'
import { usePermission } from '../lib/usePermission'

function DevicesPage() {
  const [devices, setDevices] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [search, setSearch] = useState('')
  const [modal, setModal] = useState({ open: false, device: null })
  const [deletingId, setDeletingId] = useState(null)

  // Право на управление устройствами: orders.create ИЛИ clients.manage.
  // clients.manage пока не сеян в миграцию — раздел увидят админы
  // (admin-обход в хуке) и пользователи с правом создания заказов.
  // ВАЖНО: оба хука вызываются безусловно (правила хуков), объединение — ниже.
  const canCreateOrders = usePermission('orders.create')
  const canManageClients = usePermission('clients.manage')
  const canManage = canCreateOrders || canManageClients

  useEffect(() => {
    let cancelled = false

    async function loadDevices() {
      try {
        const result = await getDevices()

        if (!cancelled) {
          setDevices(result)
        }
      } catch (err) {
        if (!cancelled) {
          console.error('Не удалось загрузить устройства:', err)
          setError(
            'Не удалось загрузить устройства. Попробуйте обновить страницу.',
          )
        }
      } finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
    }

    loadDevices()

    return () => {
      cancelled = true
    }
  }, [])

  function openCreate() {
    setModal({ open: true, device: null })
  }

  function openEdit(device) {
    setModal({ open: true, device })
  }

  function closeModal() {
    setModal({ open: false, device: null })
  }

  async function refreshDevices() {
    try {
      setError(null)
      setDevices(await getDevices())
    } catch (err) {
      console.error('Не удалось обновить список устройств:', err)
      setError('Не удалось обновить список устройств.')
    }
  }

  async function handleDelete(device) {
    const confirmed = window.confirm(
      `Удалить устройство «${device.brand} ${device.model}»? В связанных заказах ссылка на устройство будет очищена.`,
    )

    if (!confirmed) {
      return
    }

    setDeletingId(device.id)

    try {
      await deleteDevice(device.id)
      setDevices((prev) => prev.filter((item) => item.id !== device.id))
    } catch (err) {
      console.error('Не удалось удалить устройство:', err)
      setError(
        `Не удалось удалить устройство «${device.brand} ${device.model}».`,
      )
    } finally {
      setDeletingId(null)
    }
  }

  const normalizedSearch = search.trim().toLowerCase()

  const filteredDevices = useMemo(
    () =>
      devices.filter(
        (device) =>
          !normalizedSearch ||
          device.model.toLowerCase().includes(normalizedSearch) ||
          device.brand.toLowerCase().includes(normalizedSearch) ||
          (device.serialNumber ?? '')
            .toLowerCase()
            .includes(normalizedSearch) ||
          (device.clientName ?? '').toLowerCase().includes(normalizedSearch) ||
          (device.clientPhone ?? '').toLowerCase().includes(normalizedSearch),
      ),
    [devices, normalizedSearch],
  )

  return (
    <div className="page devices-page">
      <header className="devices-page__head">
        <h1 className="devices-page__title">Устройства</h1>
        {canManage ? (
          <Button type="button" onClick={openCreate}>
            + Добавить устройство
          </Button>
        ) : null}
      </header>

      <input
        className="devices-page__search"
        type="search"
        placeholder="Поиск по модели, бренду, серийному номеру или клиенту..."
        value={search}
        onChange={(event) => setSearch(event.target.value)}
      />

      {loading ? (
        <p>Загрузка...</p>
      ) : error ? (
        <p className="devices-page__error" role="alert">
          {error}
        </p>
      ) : filteredDevices.length === 0 ? (
        <p className="devices-page__empty">Устройства не найдены</p>
      ) : (
        <div className="devices-page__table">
          <div className="devices-page__table-header">
            <span>Тип / Бренд</span>
            <span>Модель</span>
            <span>Серийный номер / IMEI</span>
            <span>Владелец</span>
            <span>Дата добавления</span>
            {canManage ? <span>Действия</span> : null}
          </div>
          <ul className="devices-page__list">
            {filteredDevices.map((device) => (
              <li key={device.id} className="devices-page__row">
                <span className="devices-page__type">
                  <em>{device.deviceType ?? 'Прочее'}</em>
                  {device.brand}
                </span>
                <span>{device.model}</span>
                <span className="devices-page__serial">
                  {device.serialNumber || '—'}
                </span>
                <span className="devices-page__owner">
                  {device.clientName ?? '—'}
                  {device.clientPhone ? (
                    <small>{device.clientPhone}</small>
                  ) : null}
                </span>
                <span className="devices-page__date">
                  {formatDate(device.createdAt)}
                </span>
                {canManage ? (
                  <span className="devices-page__actions">
                    <Button
                      type="button"
                      className="devices-page__action-button"
                      onClick={() => openEdit(device)}
                      disabled={deletingId === device.id}
                    >
                      Изменить
                    </Button>
                    <Button
                      type="button"
                      className="devices-page__action-button devices-page__action-button--danger"
                      onClick={() => handleDelete(device)}
                      disabled={deletingId === device.id}
                    >
                      {deletingId === device.id ? 'Удаление...' : 'Удалить'}
                    </Button>
                  </span>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      )}

      <DeviceModal
        key={modal.open ? modal.device?.id ?? 'new' : 'closed'}
        open={modal.open}
        device={modal.device}
        onClose={closeModal}
        onSaved={refreshDevices}
      />
    </div>
  )
}

export default DevicesPage