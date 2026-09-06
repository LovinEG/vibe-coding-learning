import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  getClientById,
} from '../data/clients'
import { ACTIVE_ORDER_STATUSES } from '../data/orders'
import { formatCurrency, formatDate } from '../lib/format'
import Button from '../components/ui/Button'
import Card from '../components/ui/Card'
import CreateClientModal from '../components/modals/CreateClientModal'
import DeviceModal from '../components/modals/DeviceModal'
import './Page.css'

const TABS = [
  { value: 'orders', label: 'История заказов' },
  { value: 'devices', label: 'Устройства' },
]

// Бейдж статуса заказа (цвета как в карточке заказа).
const ORDER_STATUS_BADGES = {
  Новый: 'client-detail-page__order-badge--new',
  'В работе': 'client-detail-page__order-badge--in-work',
  'Ожидает деталь': 'client-detail-page__order-badge--waiting',
  'Готово к выдаче': 'client-detail-page__order-badge--ready',
  Выдан: 'client-detail-page__order-badge--issued',
}

function ClientDetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()

  const [client, setClient] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [activeTab, setActiveTab] = useState('orders')
  const [editModalOpen, setEditModalOpen] = useState(false)
  const [deviceModalOpen, setDeviceModalOpen] = useState(false)
  const [deviceModalKey, setDeviceModalKey] = useState(0)

  const loadClient = useCallback(async () => {
    try {
      const data = await getClientById(id)
      setClient(data)
      setError(null)
    } catch (err) {
      console.error('Не удалось загрузить клиента:', err)
      setError('Не удалось загрузить клиента. Возможно, он был удалён.')
    } finally {
      setLoading(false)
    }
  }, [id])

  useEffect(() => {
    let cancelled = false

    async function loadInitial() {
      try {
        const data = await getClientById(id)

        if (!cancelled) {
          setClient(data)
          setError(null)
        }
      } catch (err) {
        console.error('Не удалось загрузить клиента:', err)

        if (!cancelled) {
          setError('Не удалось загрузить клиента. Возможно, он был удалён.')
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
    if (!client) {
      return null
    }

    return {
      ltv: client.ltv,
      totalOrders: client.orders.length,
      activeOrders: client.orders.filter((order) =>
        ACTIVE_ORDER_STATUSES.includes(order.status),
      ).length,
      devices: client.devices.length,
    }
  }, [client])

  if (loading) {
    return (
      <div className="page client-detail-page">
        <p className="client-detail-page__empty">Загрузка...</p>
      </div>
    )
  }

  if (error || !client) {
    return (
      <div className="page client-detail-page">
        <p className="client-detail-page__alert" role="alert">
          {error ?? 'Клиент не найден.'}
        </p>
        <Button
          className="client-detail-page__small-button"
          onClick={() => navigate('/clients')}
        >
          ← К списку клиентов
        </Button>
      </div>
    )
  }

  if (!client) {
    return null
  }

  return (
    <div className="page client-detail-page">
      {/* Хлебные крошки */}
      <nav className="client-detail-page__breadcrumbs" aria-label="Навигация">
        <button
          type="button"
          className="client-detail-page__breadcrumb-link"
          onClick={() => navigate('/clients')}
        >
          Клиенты
        </button>
        <span className="client-detail-page__breadcrumb-sep" aria-hidden="true">
          /
        </span>
        <span className="client-detail-page__breadcrumb-current">
          {client.name}
        </span>
      </nav>

      {/* Шапка клиента */}
      <header className="client-detail-page__header">
        <div>
          <h1 className="client-detail-page__title">{client.name}</h1>
          <div className="client-detail-page__header-tags">
            <span className="client-detail-page__tag">
              📅 В базе с {formatDate(client.createdAt)}
            </span>
            {client.ordersCount > 0 ? (
              <span className="client-detail-page__tag client-detail-page__tag--accent">
                🔁 {client.ordersCount} заказ(ов)
              </span>
            ) : (
              <span className="client-detail-page__tag">Новый клиент</span>
            )}
          </div>
        </div>

        <Button
          className="client-detail-page__edit-button"
          onClick={() => setEditModalOpen(true)}
        >
          ✏️ Редактировать профиль
        </Button>
      </header>

      {/* Дашборд метрик */}
      <div className="client-detail-page__metrics">
        <div className="client-detail-page__metric client-detail-page__metric--accent">
          <span className="client-detail-page__metric-label">
            LTV (всего оплачено)
          </span>
          <span className="client-detail-page__metric-value">
            {formatCurrency(metrics.ltv)}
          </span>
        </div>
        <div className="client-detail-page__metric">
          <span className="client-detail-page__metric-label">
            Всего заказов
          </span>
          <span className="client-detail-page__metric-value">
            {metrics.totalOrders}
          </span>
        </div>
        <div className="client-detail-page__metric">
          <span className="client-detail-page__metric-label">
            Активных в работе
          </span>
          <span className="client-detail-page__metric-value">
            {metrics.activeOrders}
          </span>
        </div>
        <div className="client-detail-page__metric">
          <span className="client-detail-page__metric-label">
            Привязанных устройств
          </span>
          <span className="client-detail-page__metric-value">
            {metrics.devices}
          </span>
        </div>
      </div>


      <div className="client-detail-page__grid">
        {/* Профиль (слева) */}
        <Card className="client-detail-page__panel">
          <h2 className="client-detail-page__panel-title">Профиль</h2>
          <dl className="client-detail-page__contacts">
            <div>
              <dt>Телефон</dt>
              <dd>{client.phone || '—'}</dd>
            </div>
            <div>
              <dt>Email</dt>
              <dd>{client.email ?? '—'}</dd>
            </div>
            <div>
              <dt>Дата регистрации</dt>
              <dd>{formatDate(client.createdAt)}</dd>
            </div>
            <div>
              <dt>Последнее обновление</dt>
              <dd>{formatDate(client.updatedAt)}</dd>
            </div>
          </dl>

          <h3 className="client-detail-page__notes-title">Заметки о клиенте</h3>
          <p className="client-detail-page__notes">
            {client.notes ?? 'Заметок пока нет'}
          </p>
        </Card>

        {/* Табы (справа) */}
        <Card className="client-detail-page__panel">
          <div className="client-detail-page__tabs" role="tablist">
            {TABS.map((tab) => (
              <button
                key={tab.value}
                type="button"
                role="tab"
                aria-selected={activeTab === tab.value}
                className={`client-detail-page__tab${
                  activeTab === tab.value
                    ? ' client-detail-page__tab--active'
                    : ''
                }`}
                onClick={() => setActiveTab(tab.value)}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {activeTab === 'orders' ? (
            client.orders.length === 0 ? (
              <p className="client-detail-page__empty">
                У клиента пока нет заказов
              </p>
            ) : (
              <div className="client-detail-page__table">
                <div className="client-detail-page__orders-header">
                  <span>№</span>
                  <span>Устройство</span>
                  <span>Неисправность</span>
                  <span>Статус</span>
                  <span>Сумма</span>
                  <span>Дата</span>
                </div>
                <ul className="client-detail-page__orders-list">
                  {client.orders.map((order) => (
                    <li
                      key={order.id}
                      className="client-detail-page__orders-row"
                      onClick={() => navigate(`/orders/${order.id}`)}
                    >
                      <span className="client-detail-page__orders-number">
                        {order.id ? `#${order.id.slice(0, 6)}` : '—'}
                      </span>
                      <span>{order.device ?? '—'}</span>
                      <span className="client-detail-page__orders-defect">
                        {order.defect ?? '—'}
                      </span>
                      <span>
                        <span
                          className={`client-detail-page__order-badge ${
                            ORDER_STATUS_BADGES[order.status] ?? ''
                          }`}
                        >
                          {order.status}
                        </span>
                      </span>
                      <span className="client-detail-page__orders-price">
                        {formatCurrency(order.price)}
                      </span>
                      <span className="client-detail-page__orders-date">
                        {formatDate(order.acceptedAt)}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )
          ) : (
            <>
              <div className="client-detail-page__devices-head">
                <p className="client-detail-page__devices-count">
                  Привязано устройств: {client.devices.length}
                </p>
                <Button
                  className="client-detail-page__small-button"
                  onClick={() => {
                    setDeviceModalKey((prev) => prev + 1)
                    setDeviceModalOpen(true)
                  }}
                >
                  + Добавить устройство
                </Button>
              </div>

              {client.devices.length === 0 ? (
                <p className="client-detail-page__empty">
                  У клиента нет привязанных устройств
                </p>
              ) : (
                <ul className="client-detail-page__devices">
                  {client.devices.map((device) => (
                    <li key={device.id} className="client-detail-page__device">
                      <div className="client-detail-page__device-main">
                        <span className="client-detail-page__device-name">
                          {device.brand} {device.model}
                        </span>
                        <span className="client-detail-page__device-sn">
                          {device.serialNumber
                            ? `IMEI/SN: ${device.serialNumber}`
                            : 'IMEI/SN не указан'}
                        </span>
                      </div>
                      <span className="client-detail-page__device-date">
                        Добавлено: {formatDate(device.createdAt)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </Card>
      </div>


      {editModalOpen ? (
        <CreateClientModal
          key={`edit-${client.id}-${client.updatedAt ?? ''}`}
          open
          client={client}
          onClose={() => setEditModalOpen(false)}
          onSaved={loadClient}
        />
      ) : null}

      {deviceModalOpen ? (
        <DeviceModal
          key={deviceModalKey}
          open
          device={{ clientId: client.id }}
          onClose={() => setDeviceModalOpen(false)}
          onSaved={loadClient}
        />
      ) : null}
    </div>
  )
}

export default ClientDetailPage

