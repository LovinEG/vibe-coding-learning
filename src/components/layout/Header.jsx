import './Header.css'

function Header({ onMenuToggle }) {
  return (
    <header className="header">
      <button
        type="button"
        className="header__menu"
        aria-label="Открыть меню"
        onClick={onMenuToggle}
      >
        <span className="header__menu-icon" aria-hidden="true" />
      </button>
      <span className="header__label">Рабочая область</span>
      <span className="header__spacer" />
      <span className="header__slot" aria-hidden="true" />
    </header>
  )
}

export default Header
