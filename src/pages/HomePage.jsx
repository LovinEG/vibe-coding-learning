import './Page.css'
import DashboardStats from '../components/dashboard/DashboardStats'
import ImportantTasks from '../components/dashboard/ImportantTasks'
import ActiveOrders from '../components/dashboard/ActiveOrders'

function HomePage() {
  return (
    <section className="page">
      <h1 className="page__title">Главная</h1>
      <p>Обзор работы сервисного центра</p>
      <DashboardStats />
      <ImportantTasks />
      <ActiveOrders />
    </section>
  )
}

export default HomePage
