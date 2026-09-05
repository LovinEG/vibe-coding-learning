import { NavLink } from 'react-router-dom'
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
      { label: 'Устройства', soon: true },
      { label: 'Задачи', soon: true },
    ],
  },
  {
    title: 'Склад',
    permission: 'inventory.read',
    items: [
      { to: '/inventory', label: 'Запчасти' },
      { label: 'Партии', soon: true },
      { label: 'Расходники', soon: true },
      { label: 'Поставщики', soon: true },
      { label: 'Движения', soon: true },
    ],
  },
  {
    title: 'Финансы',
    permission: 'finance.view',
    items: [
      { label: 'Касса', soon: true },
      { label: 'Оплаты', soon: true },
      { label: 'Операции', soon: true },
    ],
  },
  {
    title: 'Команда',
    permission: 'team.manage',
    items: [
      { label: 'Сотрудники', soon: true },
      { label: 'Роли', soon: true },
    ],
  },
  {
    title: 'Аналитика',
    items: [
      { label: 'Отчёты', soon: true },
      { label: 'AI-Помощник', soon: true },
    ],
  },
]

function Sidebar({ isOpen, onNavigate }) {
  // Хуки вызываются безусловно и в фиксированном порядке (правила хуков).
  // finance.view и team.manage пока отсутствуют в справочнике permissions:
  // разделы увидят только админы (админ-обход в usePermission),
  // а после добавления прав в миграцию доступ станет гранулярным.
  const permissions = {
    'orders.view': usePermission('orders.view'),
    'inventory.read': usePermission('inventory.read'),
    'finance.view': usePermission('finance.view'),
    'team.manage': usePermission('team.manage'),
  }

  const visibleSections = NAV_SECTIONS.filter(
    (section) => !section.permission || permissions[section.permission],
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
