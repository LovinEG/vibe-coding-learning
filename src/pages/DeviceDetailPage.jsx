import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { getDeviceById } from '../data/devices'
import { ACTIVE_ORDER_STATUSES } from '../data/orders'
import { formatCurrency, formatDate } from '../lib/format'
import Button from '../components/ui/Button'
import Card from '../components/ui/Card'
import './Page.css'

// Бейдж статуса ремонта (цвета как в карточке заказа).
const REPAIR_STATUS_BADGES = {
  Новый: 'device-detail-page__order-badge--new',
  'В работе': 'device-detail-page__order-badge--in-work',
  'Ожидает деталь': 'device-detail-page__order-badge--waiting',
  'Готово к выдаче': 'device-detail-page__order-badge--ready',
  Выдан: 'device-detail-page__order-badge--issued',
}

function DeviceDetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()

  const [device, setDevice] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    let cancelled = false

    async function loadInitial() {
      try {
        const data = await getDeviceById(id)

        if (!cancelled) {
          setDevice(data)
          setError(null)
        }
      } catch (err) {
        console.error('Не удалось загрузить устройство:', err)

        if (!cancelled) {
          setError('Не удалось загрузить устройство. Возможно, оно было удалено.')
        }
      } finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
    }

    loadInitial()

    return () => {
      cancelled = true
    }
  }, [id])

  const metrics = useMemo(() => {
    if (!device) {
      return null
    }

    return {
      total: device.orders.length,
      completed: device.orders.filter(
        (order) => !ACTIVE_ORDER_STATUSES.includes(order.status),
      ).length,
      active: device.orders.filter((order) =>
        ACTIVE_ORDER_STATUSES.includes(order.status),
      ).length,
    }
  }, [device])

  if (loading) {
    return (
      <div className="page device-detail-page">
        <p className="device-detail-page__empty">Загрузка...</p>
      </div>
    )
  }

  if (error || !device) {
    return (
      <div className="page device-detail-page">
        <p className="device-detail-page__alert" role="alert">
          {error ?? 'Устройство не найдено.'}
        </p>
        <Button
          className="device-detail-page__small-button"
          onClick={() => navigate('/devices')}
        >
          ← К списку устройств
        </Button>
      </div>
    )
  }

  return (
    <div className="page device-detail-page">
      {/* Хлебные крошки */}
      <nav className="device-detail-page__breadcrumbs" aria-label="Навигация">
        <button
          type="button"
          className="device-detail-page__breadcrumb-link"
          onClick={() => navigate('/devices')}
        >
          Устройства
        </button>
        <span className="device-detail-page__breadcrumb-sep" aria-hidden="true">
          /
        </span>
        <span className="device-detail-page__breadcrumb-current">
          {device.brand} {device.model}
        </span>
      </nav>

      {/* Метрики ремонтов */}
      <div className="device-detail-page__metrics">
        <div className="device-detail-page__metric">
          <span className="device-detail-page__metric-label">
            Всего ремонтов
          </span>
          <span className="device-detail-page__metric-value">
            {metrics.total}
          </span>
        </div>
        <div className="device-detail-page__metric">
          <span className="device-detail-page__metric-label">
            Завершённых ремонтов
          </span>
          <span className="device-detail-page__metric-value">
            {metrics.completed}
          </span>
        </div>
        <div className="device-detail-page__metric">
          <span className="device-detail-page__metric-label">
            Активных в работе
          </span>
          <span className="device-detail-page__metric-value">
            {metrics.active}
          </span>
        </div>
      </div>


      <div className="device-detail-page__grid">
        {/* Карточка устройства (слева) */}
        <Card className="device-detail-page__panel">
          <div className="device-detail-page__panel-head">
            <h2 className="device-detail-page__panel-title">Устройство</h2>
            <Button
              className="device-detail-page__small-button"
              onClick={() => navigate('/orders')}
            >
              + Создать заказ
            </Button>
          </div>

          <h3 className="device-detail-page__device-title">
            {device.brand} {device.model}
          </h3>

          <dl className="device-detail-page__specs">
            <div>
              <dt>Бренд</dt>
              <dd>{device.brand ?? '—'}</dd>
            </div>
            <div>
              <dt>Модель</dt>
              <dd>{device.model ?? '—'}</dd>
            </div>
            <div>
              <dt>Тип</dt>
              <dd>{device.deviceType ?? '—'}</dd>
            </div>
            <div>
              <dt>IMEI</dt>
              <dd className="device-detail-page__mono">{device.imei ?? '—'}</dd>
            </div>
            <div>
              <dt>Серийный номер</dt>
              <dd className="device-detail-page__mono">
                {device.serialNumber ?? '—'}
              </dd>
            </div>
            <div>
              <dt>Дата добавления</dt>
              <dd>{formatDate(device.createdAt)}</dd>
            </div>
          </dl>

          {/* Блок владельца */}
          <h3 className="device-detail-page__owner-title">Владелец</h3>
          <div className="device-detail-page__owner">
            <div className="device-detail-page__owner-info">
              <span className="device-detail-page__owner-name">
                {device.clientName ?? '—'}
              </span>
              <span className="device-detail-page__owner-phone">
                {device.clientPhone ?? 'Телефон не указан'}
              </span>
            </div>
            {device.clientId ? (
              <Button
                className="device-detail-page__small-button"
                onClick={() => navigate(`/clients/${device.clientId}`)}
              >
                Перейти к клиенту
              </Button>
            ) : null}
          </div>
        </Card>


        {/* История ремонтов (справа) */}
        <Card className="device-detail-page__panel">
          <h2 className="device-detail-page__panel-title">
            История ремонтов — {device.orders.length}
          </h2>

          {device.orders.length === 0 ? (
            <p className="device-detail-page__empty">
              Ремонтов по этому устройству пока не было
            </p>
          ) : (
            <div className="device-detail-page__table">
              <div className="device-detail-page__orders-header">
                <span>№ Заказа</span>
                <span>Заявленный дефект</span>
                <span>Мастер</span>
                <span>Статус</span>
                <span>Стоимость</span>
                <span>Дата</span>
              </div>
              <ul className="device-detail-page__orders-list">
                {device.orders.map((order) => (
                  <li
                    key={order.id}
                    className="device-detail-page__orders-row"
                    onClick={() => navigate(`/orders/${order.id}`)}
                  >
                    <span className="device-detail-page__orders-number">
                      {order.id ? `#${order.id.slice(0, 6)}` : '—'}
                    </span>
                    <span className="device-detail-page__orders-defect">
                      {order.defect ?? '—'}
                    </span>
                    <span>{order.masterName ?? '—'}</span>
                    <span>
                      <span
                        className={`device-detail-page__order-badge ${
                          REPAIR_STATUS_BADGES[order.status] ?? ''
                        }`}
                      >
                        {order.status}
                      </span>
                    </span>
                    <span className="device-detail-page__orders-price">
                      {formatCurrency(order.price)}
                    </span>
                    <span className="device-detail-page__orders-date">
                      {formatDate(order.createdAt)}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </Card>
      </div>
    </div>
  )
}

export default DeviceDetailPage

