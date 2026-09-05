import { NavLink } from 'react-router-dom'
import { usePermission } from '../../lib/usePermission'
import './Sidebar.css'

const navItems = [
  { to: '/', label: 'Главная', end: true },
  { to: '/orders', label: 'Заказы' },
  { to: '/clients', label: 'Клиенты' },
]

function Sidebar({ isOpen, onNavigate }) {
  const canReadInventory = usePermission('inventory.read')

  const items = canReadInventory
    ? [...navItems, { to: '/inventory', label: 'Склад' }]
    : navItems

  return (
    <aside
      className={`sidebar${isOpen ? ' is-open' : ''}`}
      aria-label="Боковая панель"
    >
      <div className="sidebar__brand">
        <span className="sidebar__mark" aria-hidden="true" />
        <span className="sidebar__title">LovinTech CRM</span>
      </div>
      <nav className="sidebar__nav">
        {items.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            className={({ isActive }) =>
              `sidebar__item${isActive ? ' is-active' : ''}`
            }
            onClick={onNavigate}
          >
            {item.label}
          </NavLink>
        ))}
      </nav>
    </aside>
  )
}

export default Sidebar
