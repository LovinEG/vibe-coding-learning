import './Button.css'

function Button({ children, type = 'button', disabled, onClick, className }) {
  const classes = ['ui-button', className].filter(Boolean).join(' ')

  return (
    <button
      type={type}
      className={classes}
      disabled={disabled}
      onClick={onClick}
    >
      {children}
    </button>
  )
}

export default Button
