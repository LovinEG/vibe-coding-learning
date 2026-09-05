import { useState, useEffect } from 'react'
import Card from '../ui/Card'
import OrderItem from '../ui/OrderItem'
import Button from '../ui/Button'
import { getOrders } from '../../data/orders'
import CreateOrderModal from '../modals/CreateOrderModal'

const filters = ['Все', 'В работе', 'Ожидает деталь', 'Готово к выдаче']

function ActiveOrders() {
  const [activeFilter, setActiveFilter] = useState('Все')
  const [orders, setOrders] = useState([])
  const [loading, setLoading] = useState(true)
  const [isCreateOpen, setIsCreateOpen] = useState(false)

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
    try {
      const result = await getOrders()
      setOrders(result)
    } catch (err) {
      console.error('Не удалось загрузить заказы:', err)
    } finally {
      setLoading(false)
    }
  }

  const filteredOrders =
    activeFilter === 'Все'
      ? orders
      : orders.filter((order) => order.status === activeFilter)

  return (
    <div className="home-page__orders">
      <Card>
        <div className="home-page__orders-head">
          <h2>Активные заказы</h2>
          <Button onClick={() => setIsCreateOpen(true)}>Новый заказ</Button>
        </div>
        <div className="home-page__orders-filters">
          {filters.map((filter) => (
            <button
              key={filter}
              type="button"
              className={
                filter === activeFilter
                  ? 'home-page__orders-filter active'
                  : 'home-page__orders-filter'
              }
              onClick={() => setActiveFilter(filter)}
            >
              {filter}
            </button>
          ))}
        </div>
        <div className="home-page__orders-header">
          <span>Заказ</span>
          <span>Клиент</span>
          <span>Устройство</span>
          <span>Статус</span>
          <span>Стоимость</span>
        </div>
        {loading ? (
          <p>Загрузка...</p>
        ) : (
          <ul className="home-page__orders-list">
            {filteredOrders.map((order) => (
              <OrderItem
                key={order.orderNumber}
                orderNumber={order.orderNumber}
                client={order.client}
                device={order.device}
                status={order.status}
                price={order.price}
              />
            ))}
          </ul>
        )}

        <CreateOrderModal
          open={isCreateOpen}
          onClose={() => setIsCreateOpen(false)}
          onOrderCreated={refreshOrders}
        />
      </Card>
    </div>
  )
}

export default ActiveOrders
