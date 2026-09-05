import { useState, useEffect } from 'react'
import StatCard from '../ui/StatCard'
import { getOrders } from '../../data/orders'
import { formatPrice } from '../../lib/format'

function DashboardStats() {
  const [orders, setOrders] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false

    async function loadOrders() {
      try {
        const result = await getOrders()
        if (!cancelled) {
          setOrders(result || [])
        }
      } catch (err) {
        console.error('Не удалось загрузить статистику:', err)
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

  const totalOrders = orders.length
  const inWork = orders.filter((order) => order.status === 'В работе').length
  const completed = orders.filter(
    (order) => order.status === 'Готово к выдаче',
  ).length
  const revenue = orders.reduce(
    (sum, order) => sum + (Number(order.price) || 0),
    0,
  )

  const stats = [
    { label: 'Всего заказов', value: loading ? '—' : String(totalOrders) },
    { label: 'В работе', value: loading ? '—' : String(inWork) },
    { label: 'Завершено', value: loading ? '—' : String(completed) },
    { label: 'Выручка', value: loading ? '—' : formatPrice(revenue) },
  ]

  return (
    <div className="home-page__stats">
      {stats.map((stat) => (
        <StatCard key={stat.label} label={stat.label} value={stat.value} />
      ))}
    </div>
  )
}

export default DashboardStats
