import './Card.css'

function Card({ children, className }) {
  const classes = ['ui-card', className].filter(Boolean).join(' ')

  return <div className={classes}>{children}</div>
}

export default Card
