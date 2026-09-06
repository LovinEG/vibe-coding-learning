import Card from './Card'
import './StatCard.css'

function StatCard({ label, value, variant, className }) {
  const classes = ['stat-card', variant ? `stat-card--${variant}` : '', className]
    .filter(Boolean)
    .join(' ')

  return (
    <Card className={classes}>
      <p className="stat-card__label">{label}</p>
      <p className="stat-card__value">{value}</p>
    </Card>
  )
}

export default StatCard
