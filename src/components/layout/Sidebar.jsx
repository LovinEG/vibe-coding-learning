import './Sidebar.css'

function Sidebar({ isOpen }) {
  return (
    <aside
      className={`sidebar${isOpen ? ' is-open' : ''}`}
      aria-label="Боковая панель"
    >
      <div className="sidebar__brand">
        <span className="sidebar__mark" aria-hidden="true" />
        <span className="sidebar__title">LovinTech CRM</span>
      </div>
      <nav className="sidebar__nav" aria-hidden="true">
        <div className="sidebar__item sidebar__item--accent" />
        <div className="sidebar__item" />
        <div className="sidebar__item" />
        <div className="sidebar__item" />
      </nav>
    </aside>
  )
}

export default Sidebar
