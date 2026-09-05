import { useState, useEffect } from 'react'
import Button from '../components/ui/Button'
import CreateOrderModal from '../components/modals/CreateOrderModal'
import StatusDropdown from '../components/ui/StatusDropdown'
import { getOrders, updateOrder } from '../data/orders'
import { formatDate, formatPrice } from '../lib/format'
import './Page.css'

const STATUSES = ['Новый', 'В работе', 'Ожидает деталь', 'Готово к выдаче']
const FILTERS = ['Все', ...STATUSES]

function OrdersPage() {
  const [orders, setOrders] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [activeFilter, setActiveFilter] = useState('Все')
  const [isCreateOpen, setIsCreateOpen] = useState(false)
  const [updatingId, setUpdatingId] = useState(null)

  useEffect(() => {
    let cancelled = false

    async function loadOrders() {
      try {
        const result = await getOrders()
        if (!cancelled) {
          setOrders(result)
        }
      } catch (err) {
        console.error('Не удалось загрузить заказы:', err)
        if (!cancelled) {
          setError('Не удалось загрузить заказы. Попробуйте обновить страницу.')
        }
      } finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
    }

    loadOrders()

    return () => {
      cancelled = true
    }
  }, [])

  async function refreshOrders() {
    setLoading(true)
    setError('')

    try {
      const result = await getOrders()
      setOrders(result)
    } catch (err) {
      console.error('Не удалось загрузить заказы:', err)
      setError('Не удалось загрузить заказы. Попробуйте обновить страницу.')
    } finally {
      setLoading(false)
    }
  }

  async function handleStatusChange(orderId, newStatus) {
    const currentOrder = orders.find((item) => item.id === orderId)

    if (!currentOrder || currentOrder.status === newStatus || updatingId) {
      return
    }

    setUpdatingId(orderId)

    try {
      await updateOrder(orderId, { status: newStatus })
      setOrders((prev) =>
        prev.map((item) =>
          item.id === orderId ? { ...item, status: newStatus } : item,
        ),
      )
    } catch (err) {
      console.error('Не удалось обновить статус:', err)
      setError(
        `Не удалось обновить статус заказа ${currentOrder.orderNumber}. Попробуйте ещё раз.`,
      )
    } finally {
      setUpdatingId(null)
    }
  }

  const normalizedSearch = search.trim().toLowerCase()
  const visibleOrders = orders.filter((order) => {
    if (activeFilter !== 'Все' && order.status !== activeFilter) {
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

  return (
    <section className="page">
      <div className="orders-page__head">
        <h1 className="page__title">Заказы</h1>
        <Button onClick={() => setIsCreateOpen(true)}>Новый заказ</Button>
      </div>

      <input
        className="orders-page__search"
        type="search"
        value={search}
        onChange={(event) => setSearch(event.target.value)}
        placeholder="Поиск по номеру, клиенту или устройству..."
        aria-label="Поиск заказов"
      />

      <div className="orders-page__filters">
        {FILTERS.map((filter) => (
          <button
            key={filter}
            type="button"
            className={
              filter === activeFilter
                ? 'orders-page__filter active'
                : 'orders-page__filter'
            }
            onClick={() => setActiveFilter(filter)}
          >
            {filter}
          </button>
        ))}
      </div>

      {error ? (
        <p className="orders-page__error" role="alert">
          {error}
        </p>
      ) : null}

      {loading ? (
        <p className="orders-page__empty">Загрузка...</p>
      ) : (
        <div className="orders-page__table">
          <div className="orders-page__table-header">
            <span>Номер</span>
            <span>Клиент</span>
            <span>Устройство</span>
            <span>Неисправность</span>
            <span>Стоимость</span>
            <span>Статус</span>
            <span>Дата</span>
          </div>

          <ul className="orders-page__list">
            {visibleOrders.map((order) => (
              <li
                key={order.id ?? order.orderNumber}
                className="orders-page__row"
              >
                <span className="orders-page__number">{order.orderNumber}</span>
                <span>
                  <span className="orders-page__client">{order.client}</span>
                  {order.clientPhone ? (
                    <span className="orders-page__phone">
                      {order.clientPhone}
                    </span>
                  ) : null}
                </span>
                <span>{order.device}</span>
                <span className="orders-page__defect">{order.defect}</span>
                <span className="orders-page__price">
                  {formatPrice(order.price)}
                </span>
                <span>
                  <StatusDropdown
                    value={order.status}
                    onChange={(newStatus) =>
                      handleStatusChange(order.id, newStatus)
                    }
                    disabled={updatingId === order.id}
                  />
                </span>
                <span className="orders-page__date">
                  {formatDate(order.acceptedAt)}
                </span>
              </li>
            ))}
          </ul>

          {visibleOrders.length === 0 ? (
            <p className="orders-page__empty">Заказы не найдены</p>
          ) : null}
        </div>
      )}

      <CreateOrderModal
        open={isCreateOpen}
        onClose={() => setIsCreateOpen(false)}
        onOrderCreated={refreshOrders}
      />
    </section>
  )
}

export default OrdersPage
