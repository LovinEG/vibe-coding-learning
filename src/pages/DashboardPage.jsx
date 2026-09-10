import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  getDashboardSummary,
  buildActionItems,
  buildFinanceSummary,
  buildStockWarnings,
} from '../data/dashboard'
import { isOverdueOrder } from '../data/orders'
import { formatCurrency, formatDate, formatDateTime } from '../lib/format'
import { useAuth } from '../lib/useAuth'
import Button from '../components/ui/Button'
import Card from '../components/ui/Card'
import CreateOrderModal from '../components/modals/CreateOrderModal'
import ShiftModal from '../components/modals/ShiftModal'
import './Page.css'

const STATUS_BADGES = {
  Новый: 'dashboard-page__status-badge--new',
  Диагностика: 'dashboard-page__status-badge--diagnostics',
  'В работе': 'dashboard-page__status-badge--in-work',
  'Ожидает деталь': 'dashboard-page__status-badge--waiting',
  'Готово к выдаче': 'dashboard-page__status-badge--ready',
  Закрыт: 'dashboard-page__status-badge--closed',
  Отменён: 'dashboard-page__status-badge--cancelled',
  // Легаси-статус: остался только для отображения старых заказов.
  Выдан: 'dashboard-page__status-badge--issued',
}

// Быстрые фильтры таблицы активных заказов.
const ORDER_FILTERS = [
  { value: 'all', label: 'Все' },
  { value: 'Новый', label: 'Новый' },
  { value: 'Диагностика', label: 'Диагностика' },
  { value: 'В работе', label: 'В работе' },
  { value: 'Ожидает деталь', label: 'Ожидает деталь' },
  { value: 'Готово к выдаче', label: 'Готово' },
]

function getGreeting(hour) {
  if (hour < 12) {
    return 'Доброе утро'
  }
  if (hour < 18) {
    return 'Добрый день'
  }
  return 'Добрый вечер'
}

function DashboardPage() {
  const [summary, setSummary] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [orderFilter, setOrderFilter] = useState('all')
  const [orderSearch, setOrderSearch] = useState('')
  const [isCreateOpen, setIsCreateOpen] = useState(false)
  // Управление сменой прямо на дашборде: { open, mode } — mode 'open'|'close'.
  const [shiftModal, setShiftModal] = useState({ open: false, mode: 'open' })

  const navigate = useNavigate()
  const { profile, user } = useAuth()

  useEffect(() => {
    let cancelled = false

    async function loadSummary() {
      try {
        const data = await getDashboardSummary()
        if (!cancelled) {
          setSummary(data)
        }
      } catch (err) {
        console.error('Не удалось загрузить данные дашборда:', err)
        if (!cancelled) {
          setError('Не удалось загрузить данные дашборда. Попробуйте обновить страницу.')
        }
      } finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
    }

    loadSummary()

    return () => {
      cancelled = true
    }
  }, [])

  const now = useMemo(() => new Date(), [])

  const actionItems = useMemo(() => {
    if (!summary) {
      return []
    }
    return buildActionItems({
      orders: summary.orders.active,
      parts: summary.parts,
      batches: summary.batches,
      tasks: summary.tasks,
      now,
    })
  }, [summary, now])

  const finance = useMemo(() => {
    if (!summary) {
      return null
    }
    return buildFinanceSummary(summary.payments.income, summary.orders.all, now)
  }, [summary, now])

  const stock = useMemo(() => {
    if (!summary) {
      return null
    }
    return buildStockWarnings(
      summary.parts,
      summary.orders.awaitingParts,
      summary.batches,
      now,
    )
  }, [summary, now])

  // Таблица активных заказов: фильтр + живой поиск.
  const visibleOrders = useMemo(() => {
    if (!summary) {
      return []
    }

    const normalizedSearch = orderSearch.trim().toLowerCase()

    return summary.orders.active.filter((order) => {
      if (orderFilter !== 'all' && order.status !== orderFilter) {
        return false
      }

      if (!normalizedSearch) {
        return true
      }

      return [order.orderNumber, order.client, order.device]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
        .includes(normalizedSearch)
    })
  }, [summary, orderFilter, orderSearch])

  if (loading) {
    return (
      <div className="page dashboard-page">
        <p className="dashboard-page__empty">Загрузка...</p>
      </div>
    )
  }

  if (error || !summary) {
    return (
      <div className="page dashboard-page">
        <p className="dashboard-page__alert" role="alert">
          {error ?? 'Данные дашборда недоступны.'}
        </p>
      </div>
    )
  }

  const { metrics, shift } = summary
  const userName = profile?.full_name || user?.email || 'Сотрудник'

  // Виджет смены — только для manager: admin/user/technician смены
  // не требуют (shift restriction на них не распространяется).
  const isManager = profile?.roles?.code === 'manager'

  function go(path) {
    navigate(path)
  }

  // Обновление состояния дашборда на лету после открытия/закрытия смены.
  function refreshSummary() {
    return getDashboardSummary()
      .then(setSummary)
      .catch((err) => {
        console.error('Не удалось обновить данные дашборда:', err)
      })
  }

  function openShiftModal(mode) {
    setShiftModal({ open: true, mode })
  }

  const metricCards = [
    {
      label: 'В работе',
      value: String(metrics.activeOrders),
      to: '/orders',
      accent: false,
    },
    {
      label: 'Просрочено / SLA',
      value: String(metrics.overdueOrders),
      to: '/orders?overdue=true',
      accent: metrics.overdueOrders > 0,
    },
    {
      label: 'Принято сегодня',
      value: String(metrics.acceptedToday),
      to: '/orders',
      accent: false,
    },
    {
      label: 'Закрыто сегодня',
      value: String(metrics.closedToday),
      to: '/orders',
      accent: false,
    },
    {
      label: 'Требуют согласования',
      value: String(metrics.awaitingApproval),
      to: '/orders?approval=pending',
      accent: false,
    },
    {
      label: 'Ожидают деталь',
      value: String(metrics.awaitingParts),
      to: '/orders?status=waiting',
      accent: metrics.awaitingParts > 0,
    },
    {
      label: 'Выручка за смену',
      value: formatCurrency(metrics.shiftRevenue),
      to: '/payments',
      accent: true,
    },
    {
      label: 'Деньги в кассах',
      value: formatCurrency(metrics.cashTotal),
      to: '/cash-registers',
      accent: false,
    },
  ]

  return (
    <div className="page dashboard-page">
      <header className="dashboard-page__header">
        <div className="dashboard-page__greeting">
          <h1 className="dashboard-page__title">
            {getGreeting(now.getHours())}, {userName}
          </h1>
          {isManager ? (
            <p className="dashboard-page__shift">
              {shift.isOpen ? (
                <>
                  <span className="dashboard-page__shift-dot" aria-hidden="true" />
                  Статус: открыта · {formatDateTime(shift.openedAt)}
                  {shift.operator ? ` · ${shift.operator}` : ''}
                </>
              ) : (
                <>
                  Статус: закрыта
                  <button
                    type="button"
                    className="dashboard-page__shift-open-button"
                    onClick={() => openShiftModal('open')}
                  >
                    🔓 Открыть смену сейчас
                  </button>
                </>
              )}
              {shift.isOpen ? (
                <Button
                  className="dashboard-page__shift-action"
                  onClick={() => openShiftModal('close')}
                >
                  🔒 Закрыть смену
                </Button>
              ) : null}
            </p>
          ) : null}
        </div>

        <div className="dashboard-page__actions">
          <Button onClick={() => setIsCreateOpen(true)}>+ Новый заказ</Button>
          <Button
            className="dashboard-page__action--secondary"
            onClick={() => go('/clients')}
          >
            Найти клиента
          </Button>
          {isManager && shift.isOpen ? (
            <Button
              className="dashboard-page__action--secondary"
              onClick={() => openShiftModal('close')}
            >
              🔒 Закрыть смену
            </Button>
          ) : null}
          {isManager && !shift.isOpen ? (
            <Button
              className="dashboard-page__action--secondary"
              onClick={() => openShiftModal('open')}
            >
              🔓 Открыть смену
            </Button>
          ) : null}
        </div>
      </header>

      <div className="dashboard-page__metrics">
        {metricCards.map((card) => (
          <button
            key={card.label}
            type="button"
            className={`dashboard-page__metric${
              card.accent ? ' dashboard-page__metric--accent' : ''
            }`}
            onClick={() => go(card.to)}
          >
            <span className="dashboard-page__metric-label">{card.label}</span>
            <span className="dashboard-page__metric-value">{card.value}</span>
          </button>
        ))}
      </div>

      <div className="dashboard-page__content">
        <Card className="dashboard-page__panel">
          <h2 className="dashboard-page__panel-title">Важные задачи</h2>
          {actionItems.length === 0 ? (
            <p className="dashboard-page__empty">
              Все под контролем — требующих внимания событий нет.
            </p>
          ) : (
            <ul className="dashboard-page__action-list">
              {actionItems.map((item) => (
                <li key={item.id} className="dashboard-page__action">
                  <span className="dashboard-page__action-icon" aria-hidden="true">
                    {item.icon}
                  </span>
                  <span className="dashboard-page__action-body">
                    <span className="dashboard-page__action-title">{item.title}</span>
                    <span className="dashboard-page__action-desc">
                      {item.description}
                    </span>
                  </span>
                  <Button
                    className="dashboard-page__action-button"
                    onClick={() => go(item.to)}
                  >
                    {item.actionLabel}
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <div className="dashboard-page__side">
          <Card className="dashboard-page__panel">
            <h2 className="dashboard-page__panel-title">
              Складские предупреждения
            </h2>
            <ul className="dashboard-page__stock-list">
              <li className="dashboard-page__stock-group">
                <button
                  type="button"
                  className="dashboard-page__stock-head"
                  onClick={() => go('/warehouse')}
                >
                  <span>⚠️ Заканчиваются</span>
                  <span className="dashboard-page__stock-count">
                    {stock.lowStock.length}
                  </span>
                </button>
                {stock.lowStock.slice(0, 3).map((part) => (
                  <p key={part.id} className="dashboard-page__stock-item">
                    {part.name} — {part.totalStock} из {part.minStock}
                  </p>
                ))}
              </li>
              <li className="dashboard-page__stock-group">
                <button
                  type="button"
                  className="dashboard-page__stock-head"
                  onClick={() => go('/warehouse')}
                >
                  <span>🔴 Отсутствуют</span>
                  <span className="dashboard-page__stock-count">
                    {stock.outOfStock.length}
                  </span>
                </button>
                {stock.outOfStock.slice(0, 3).map((part) => (
                  <p key={part.id} className="dashboard-page__stock-item">
                    {part.name} — остаток 0
                  </p>
                ))}
              </li>
              <li className="dashboard-page__stock-group">
                <button
                  type="button"
                  className="dashboard-page__stock-head"
                  onClick={() => go('/orders?status=waiting')}
                >
                  <span>🚚 Ожидаются поставки</span>
                  <span className="dashboard-page__stock-count">
                    {stock.expectedDeliveries.length}
                  </span>
                </button>
                {stock.expectedDeliveries.slice(0, 3).map((order) => (
                  <p key={order.id} className="dashboard-page__stock-item">
                    Заказ {order.orderNumber} · {order.client}
                  </p>
                ))}
              </li>
            </ul>
          </Card>

          <Card className="dashboard-page__panel">
            <h2 className="dashboard-page__panel-title">Финансы</h2>
            <div className="dashboard-page__finance">
              <div className="dashboard-page__finance-row">
                <span>Выручка за день</span>
                <span className="dashboard-page__finance-value">
                  {formatCurrency(finance.revenueToday)}
                </span>
              </div>
              <div className="dashboard-page__finance-row">
                <span>За неделю</span>
                <span className="dashboard-page__finance-value">
                  {formatCurrency(finance.revenueWeek)}
                </span>
              </div>
              <div className="dashboard-page__finance-row">
                <span>За месяц</span>
                <span className="dashboard-page__finance-value">
                  {formatCurrency(finance.revenueMonth)}
                </span>
              </div>
              <div className="dashboard-page__finance-split">
                <span>Наличные: {formatCurrency(finance.cashToday)}</span>
                <span>Безнал: {formatCurrency(finance.cashlessToday)}</span>
              </div>
              <div className="dashboard-page__finance-row dashboard-page__finance-row--receivables">
                <span>
                  Дебиторка ({finance.receivableOrders.length} заказов)
                </span>
                <span className="dashboard-page__finance-value">
                  {formatCurrency(finance.receivables)}
                </span>
              </div>
            </div>
          </Card>
        </div>
      </div>


      <Card className="dashboard-page__panel dashboard-page__orders">
        <div className="dashboard-page__orders-head">
          <h2 className="dashboard-page__panel-title">Активные заказы</h2>
          <input
            className="dashboard-page__search"
            type="search"
            placeholder="Поиск по номеру, клиенту, устройству..."
            value={orderSearch}
            onChange={(event) => setOrderSearch(event.target.value)}
            aria-label="Поиск по активным заказам"
          />
        </div>

        <div className="dashboard-page__filters">
          {ORDER_FILTERS.map((filter) => (
            <button
              key={filter.value}
              type="button"
              className={`dashboard-page__filter${
                orderFilter === filter.value ? ' is-active' : ''
              }`}
              onClick={() => setOrderFilter(filter.value)}
            >
              {filter.label}
            </button>
          ))}
        </div>

        {visibleOrders.length === 0 ? (
          <p className="dashboard-page__empty">Активных заказов не найдено</p>
        ) : (
          <div className="dashboard-page__table">
            <div className="dashboard-page__table-header">
              <span>Заказ</span>
              <span>Клиент</span>
              <span>Устройство</span>
              <span>Статус</span>
              <span>Мастер</span>
              <span>Срок</span>
              <span>Стоимость</span>
            </div>
            <ul className="dashboard-page__table-list">
              {visibleOrders.map((order) => (
                <li
                  key={order.id}
                  className="dashboard-page__table-row"
                  onClick={() => go(`/orders/${order.id}`)}
                >
                  <span className="dashboard-page__order-number">
                    {order.orderNumber}
                    {isOverdueOrder(order) ? (
                      <span className="orders-page__overdue-badge dashboard-page__overdue-badge">
                        ⏰ Просрочено
                      </span>
                    ) : null}
                    {order.approvalStatus === 'pending' ? (
                      <span className="orders-page__overdue-badge dashboard-page__overdue-badge dashboard-page__overdue-badge--approval">
                        📤 Ожидает согласования
                      </span>
                    ) : null}
                  </span>
                  <span>{order.client ?? '—'}</span>
                  <span>{order.device ?? '—'}</span>
                  <span>
                    <span
                      className={`dashboard-page__status-badge ${
                        STATUS_BADGES[order.status] ?? ''
                      }`}
                    >
                      {order.status}
                    </span>
                  </span>
                  {/* Мастер и срок: в схеме orders нет master_id/deadline —
                      показываем «—» и дату приёма как ориентир по сроку. */}
                  <span>—</span>
                  <span>{formatDate(order.acceptedAt)}</span>
                  <span className="dashboard-page__order-price">
                    {formatCurrency(order.price)}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </Card>

      <CreateOrderModal
        open={isCreateOpen}
        onClose={() => setIsCreateOpen(false)}
        onOrderCreated={() => {
          getDashboardSummary()
            .then(setSummary)
            .catch((err) => console.error('Не удалось обновить дашборд:', err))
        }}
      />

      <ShiftModal
        // key меняется только при открытии/закрытии или смене мода —
        // во время ввода в форме он стабилен (не пересоздаёт компонент).
        key={shiftModal.open ? shiftModal.mode : 'closed'}
        open={shiftModal.open}
        mode={shiftModal.mode}
        shift={shift}
        onClose={() => setShiftModal({ open: false, mode: 'open' })}
        onSaved={refreshSummary}
      />
    </div>
  )
}

export default DashboardPage

