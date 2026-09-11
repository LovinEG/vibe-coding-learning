import { NavLink } from 'react-router-dom'
import { useAuth } from '../../lib/useAuth'
import { usePermission } from '../../lib/usePermission'
import './Sidebar.css'

// Структура навигации: активные разделы (с роутами) и сущности,
// запланированные к разработке (soon: true → бейдж «Скоро»).
// permission — код права, скрывающий весь раздел при его отсутствии.
const NAV_SECTIONS = [
  {
    title: 'Главное',
    items: [{ to: '/', label: 'Дашборд', end: true }],
  },
  {
    title: 'Обслуживание',
    permission: 'orders.view',
    items: [
      { to: '/orders', label: 'Заказы' },
      { to: '/clients', label: 'Клиенты' },
      { to: '/devices', label: 'Устройства' },
      { to: '/tasks', label: 'Задачи' },
    ],
  },
  {
    title: 'Склад',
    permission: 'inventory.read',
    items: [
      { to: '/inventory', label: 'Запчасти' },
      { to: '/stock-batches', label: 'Партии' },
      { to: '/consumables', label: 'Расходники' },
      { to: '/suppliers', label: 'Поставщики' },
      { to: '/stock-movements', label: 'Движения' },
    ],
  },
  {
    title: 'Финансы',
    permission: 'finance.view',
    items: [
      { to: '/cash-registers', label: 'Кассы' },
      { to: '/payments', label: 'Оплаты' },
      { to: '/operations', label: 'Операции' },
      { to: '/transactions', label: 'Финансовый отчёт' },
    ],
  },
  {
    title: 'Команда',
    permission: 'iam.manage',
    items: [
      { to: '/users', label: 'Сотрудники' },
      { label: 'Роли', soon: true },
    ],
  },
  {
    title: 'Аналитика',
    items: [
      { to: '/ai-assistant', label: 'AI Ассистент' },
      { label: 'Отчёты', soon: true },
    ],
  },
]

function Sidebar({ isOpen, onNavigate }) {
  // Хуки вызываются безусловно и в фиксированном порядке (правила хуков).
  // finance.view добавлен миграцией касс (ШАГ 6); iam.manage добавлен
  // миграцией IAM (ШАГ 10) — раздел «Команда» виден пользователям с правом
  // iam.manage или админам (админ-обход в usePermission).
  const permissions = {
    'orders.view': usePermission('orders.view'),
    'inventory.read': usePermission('inventory.read'),
    'finance.view': usePermission('finance.view'),
    'iam.manage': usePermission('iam.manage'),
  }

  // Навигационный UX-фильтр по роли: менеджеру не показываются
  // «Финансовый отчёт» и весь раздел «Аналитика» (admin/user/technician —
  // как раньше). Route /ai-assistant при прямом переходе по URL не
  // блокируется, права и БД не затрагиваются.
  const { profile } = useAuth()
  const isManager = profile?.roles?.code === 'manager'

  const visibleSections = NAV_SECTIONS.map((section) => {
    if (isManager && section.title === 'Аналитика') {
      return { ...section, items: [] }
    }

    return {
      ...section,
      items: section.items.filter(
        (item) => !(isManager && item.to === '/transactions'),
      ),
    }
  }).filter(
    (section) =>
      (!section.permission || permissions[section.permission]) &&
      section.items.length > 0,
  )

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
        {visibleSections.map((section) => (
          <div className="sidebar__section" key={section.title}>
            <p className="sidebar__section-title">{section.title}</p>
            {section.items.map((item) =>
              item.soon ? (
                <span
                  key={item.label}
                  className="sidebar__item sidebar__item--soon"
                  aria-disabled="true"
                >
                  {item.label}
                  <span className="sidebar__soon">Скоро</span>
                </span>
              ) : (
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
              ),
            )}
          </div>
        ))}
      </nav>
    </aside>
  )
}

export default Sidebar
