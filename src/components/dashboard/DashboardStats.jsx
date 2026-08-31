import StatCard from '../ui/StatCard'
import { stats } from '../../data/dashboard'

function DashboardStats() {
  return (
    <div className="home-page__stats">
      {stats.map((stat) => (
        <StatCard key={stat.label} label={stat.label} value={stat.value} />
      ))}
    </div>
  )
}

export default DashboardStats
