import { useState, useEffect } from 'react'
import Card from '../ui/Card'
import OrderItem from '../ui/OrderItem'
import { getOrders } from '../../data/orders'

const filters = ['Все', 'В работе', 'Ожидает деталь', 'Готово к выдаче']

function ActiveOrders() {
  const [activeFilter, setActiveFilter] = useState('Все')
  const [orders, setOrders] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function loadOrders() {
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

    loadOrders()
  }, [])

  const filteredOrders =
    activeFilter === 'Все'
      ? orders
      : orders.filter((order) => order.status === activeFilter)

  return (
    <div className="home-page__orders">
      <Card>
        <h2>Активные заказы</h2>
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
      </Card>
    </div>
  )
}

export default ActiveOrders
