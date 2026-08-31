import './Page.css'
import StatCard from '../components/ui/StatCard'

const stats = [
  { label: 'Активные заказы', value: '12' },
  { label: 'Просроченные заказы', value: '3' },
  { label: 'Выручка', value: '254 000 ₽' },
]

function HomePage() {
  return (
    <section className="page">
      <h1 className="page__title">Главная</h1>
      <p>Обзор работы сервисного центра</p>
      <div className="home-page__stats">
        {stats.map((stat) => (
          <StatCard key={stat.label} label={stat.label} value={stat.value} />
        ))}
      </div>
    </section>
  )
}

export default HomePage
