import { useState } from 'react'
import './Page.css'
import StatCard from '../components/ui/StatCard'
import Card from '../components/ui/Card'
import TaskItem from '../components/ui/TaskItem'
import OrderItem from '../components/ui/OrderItem'

const stats = [
  { label: 'Активные заказы', value: '12' },
  { label: 'Просроченные заказы', value: '3' },
  { label: 'Выручка', value: '254 000 ₽' },
]

const tasks = [
  { title: 'Проверить заказ #1042', due: 'Сегодня' },
  { title: 'Связаться с клиентом #1038', due: 'Сегодня' },
  { title: 'Заказать дисплей iPhone 13', due: 'Завтра' },
]

const orders = [
  {
    orderNumber: '#1042',
    client: 'Иван Петров',
    device: 'iPhone 13',
    status: 'В работе',
    price: '3 500 ₽',
  },
  {
    orderNumber: '#1038',
    client: 'Анна Смирнова',
    device: 'Samsung S22',
    status: 'Ожидает деталь',
    price: '5 200 ₽',
  },
  {
    orderNumber: '#1035',
    client: 'Олег Кузнецов',
    device: 'MacBook Air',
    status: 'Готово к выдаче',
    price: '8 900 ₽',
  },
]

function HomePage() {
  const [count, setCount] = useState(0)
  const [filter, setFilter] = useState('all')

  const filteredOrders =
    filter === 'all'
      ? orders
      : orders.filter((order) => order.status === filter)

  return (
    <section className="page">
      <h1 className="page__title">Главная</h1>
      <p>Обзор работы сервисного центра</p>
      <p>Счётчик: {count}</p>
      <button onClick={() => setCount(count + 1)}>+1</button>
      <div className="home-page__stats">
        {stats.map((stat) => (
          <StatCard key={stat.label} label={stat.label} value={stat.value} />
        ))}
      </div>
      <Card>
        <h2>Важные задачи</h2>
        <ul className="home-page__tasks">
          {tasks.map((task) => (
            <TaskItem
              key={task.title}
              title={task.title}
              dueLabel={task.due}
            />
          ))}
        </ul>
      </Card>
      <div className="home-page__orders">
        <Card>
          <h2>Активные заказы</h2>
          <button onClick={() => setFilter('all')}>Все</button>
          <button onClick={() => setFilter('В работе')}>В работе</button>
          <button onClick={() => setFilter('Ожидает деталь')}>Ожидает деталь</button>
          <button onClick={() => setFilter('Готово к выдаче')}>Готово к выдаче</button>
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
        </Card>
      </div>
    </section>
  )
}

export default HomePage
