import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import DeviceModal from '../components/modals/DeviceModal'
import Button from '../components/ui/Button'
import {
  deleteDevice,
  exportDevicesToCsv,
  getDevices,
} from '../data/devices'
import { formatDate } from '../lib/format'
import { usePermission } from '../lib/usePermission'
import './Page.css'

function DevicesPage() {
  const navigate = useNavigate()

  const [devices, setDevices] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [modal, setModal] = useState({ open: false, device: null })
  const [deletingId, setDeletingId] = useState(null)

  // Право на управление устройствами: orders.create ИЛИ clients.manage.
  // clients.manage пока не сеян в миграцию — раздел увидят админы
  // (admin-обход в хуке) и пользователи с правом создания заказов.
  // ВАЖНО: оба хука вызываются безусловно (правила хуков), объединение — ниже.
  const canCreateOrders = usePermission('orders.create')
  const canManageClients = usePermission('clients.manage')
  const canManage = canCreateOrders || canManageClients

  // Дебаунс поиска: серверный запрос не дёргается на каждый символ.
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 350)

    return () => clearTimeout(timer)
  }, [search])

  useEffect(() => {
    let cancelled = false

    async function loadDevices() {
      try {
        const result = await getDevices({ search: debouncedSearch })

        if (!cancelled) {
          setDevices(result)
          setError(null)
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
  }, [debouncedSearch])

  function openCreate() {
    setModal({ open: true, device: null })
  }

  function closeModal() {
    setModal({ open: false, device: null })
  }

  async function refreshDevices() {
    try {
      setError(null)
      setDevices(await getDevices({ search: debouncedSearch }))
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

  return (
    <div className="page devices-page">
      <header className="devices-page__head">
        <h1 className="devices-page__title">Устройства</h1>
        <div className="devices-page__actions">
          <Button
            type="button"
            className="devices-page__export-button"
            onClick={() => exportDevicesToCsv(devices)}
            disabled={devices.length === 0}
          >
            📥 Экспорт в CSV
          </Button>
          {canManage ? (
            <Button type="button" onClick={openCreate}>
              + Добавить устройство
            </Button>
          ) : null}
        </div>
      </header>

      <input
        className="devices-page__search"
        type="search"
        placeholder="Поиск по марке, модели, IMEI или серийному номеру..."
        value={search}
        onChange={(event) => setSearch(event.target.value)}
      />

      {loading ? (
        <p className="devices-page__empty">Загрузка...</p>
      ) : error ? (
        <p className="devices-page__error" role="alert">
          {error}
        </p>
      ) : devices.length === 0 ? (
        <div className="devices-page__empty-state">
          <span className="devices-page__empty-icon" aria-hidden="true">
            📱
          </span>
          <p className="devices-page__empty-title">
            {debouncedSearch
              ? 'Устройства не найдены'
              : 'Пока нет ни одного устройства'}
          </p>
          <p className="devices-page__empty-hint">
            Добавьте устройство, чтобы привязывать к нему ремонты
          </p>
          {canManage && !debouncedSearch ? (
            <Button type="button" onClick={openCreate}>
              + Добавить устройство
            </Button>
          ) : null}
        </div>
      ) : (
        <div className="devices-page__table">
          <div className="devices-page__table-header">
            <span>Устройство</span>
            <span>IMEI / SN</span>
            <span>Владелец</span>
            <span>Заказов</span>
            <span>Дата добавления</span>
            {canManage ? <span>Действия</span> : null}
          </div>
          <ul className="devices-page__list">
            {devices.map((device) => (
              <li
                key={device.id}
                className="devices-page__row devices-page__row--clickable"
                onClick={() => navigate(`/devices/${device.id}`)}
              >
                <span className="devices-page__type">
                  <em>{device.deviceType ?? 'Прочее'}</em>
                  {device.brand} {device.model}
                </span>
                <span className="devices-page__serial">
                  {device.imei ? <span>IMEI: {device.imei}</span> : null}
                  {device.serialNumber ? <span>SN: {device.serialNumber}</span> : null}
                  {!device.imei && !device.serialNumber ? '—' : null}
                </span>
                <span className="devices-page__owner">
                  {device.clientId ? (
                    <span
                      className="devices-page__owner-link"
                      role="link"
                      tabIndex={0}
                      onClick={(event) => {
                        event.stopPropagation()
                        navigate(`/clients/${device.clientId}`)
                      }}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter') {
                          event.stopPropagation()
                          navigate(`/clients/${device.clientId}`)
                        }
                      }}
                    >
                      {device.clientName ?? '—'}
                    </span>
                  ) : (
                    device.clientName ?? '—'
                  )}
                  {device.clientPhone ? (
                    <small>{device.clientPhone}</small>
                  ) : null}
                </span>
                <span className="devices-page__repairs-count">
                  {device.ordersCount} /{' '}
                  <span className="devices-page__repairs-active">
                    {device.activeOrdersCount}
                  </span>
                </span>
                <span className="devices-page__date">
                  {formatDate(device.createdAt)}
                </span>
                {canManage ? (
                  <span className="devices-page__actions">
                    <Button
                      type="button"
                      className="devices-page__action-button"
                      onClick={(event) => {
                        event.stopPropagation()
                        setModal({ open: true, device })
                      }}
                      disabled={deletingId === device.id}
                    >
                      Изменить
                    </Button>
                    <Button
                      type="button"
                      className="devices-page__action-button devices-page__action-button--danger"
                      onClick={(event) => {
                        event.stopPropagation()
                        handleDelete(device)
                      }}
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