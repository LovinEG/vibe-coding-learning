import Card from './Card'
import './StatCard.css'

function StatCard({ label, value, className }) {
  return (
    <Card className={className}>
      <p className="stat-card__label">{label}</p>
      <p className="stat-card__value">{value}</p>
    </Card>
  )
}

export default StatCard
