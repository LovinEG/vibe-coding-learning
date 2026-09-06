import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Button from '../components/ui/Button'
import CreateOrderModal from '../components/modals/CreateOrderModal'
import StatusDropdown from '../components/ui/StatusDropdown'
import {
  exportOrdersToCsv,
  getOrders,
  isOverdueOrder,
  REPAIR_TYPE_OPTIONS,
  updateOrder,
} from '../data/orders'
import { getEmployees } from '../data/tasks'
import { formatDate, formatPrice } from '../lib/format'
import './Page.css'

const STATUSES = ['Новый', 'В работе', 'Ожидает деталь', 'Готово к выдаче']
const FILTERS = ['Все', ...STATUSES, 'Просроченные']

// Периоды для фильтра по дате приёма (скользящие окна от сегодня).
const DATE_FILTERS = [
  { value: 'all', label: 'За всё время' },
  { value: 'today', label: 'За сегодня' },
  { value: 'week', label: 'За неделю' },
  { value: 'month', label: 'За месяц' },
]

function OrdersPage() {
  const navigate = useNavigate()

  const [orders, setOrders] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [activeFilter, setActiveFilter] = useState('Все')
  const [masterFilter, setMasterFilter] = useState('all')
  const [repairTypeFilter, setRepairTypeFilter] = useState('all')
  const [dateFilter, setDateFilter] = useState('all')
  const [overdueOnly, setOverdueOnly] = useState(false)
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [employees, setEmployees] = useState([])
  const [isCreateOpen, setIsCreateOpen] = useState(false)
  const [updatingId, setUpdatingId] = useState(null)

  // Дебаунс поиска: не дёргаем сервер на каждый символ.
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 350)

    return () => clearTimeout(timer)
  }, [search])

  // Справочник мастеров для фильтра.
  useEffect(() => {
    let cancelled = false

    getEmployees()
      .then((data) => {
        if (!cancelled) {
          setEmployees(data ?? [])
        }
      })
      .catch((err) => console.error('Не удалось загрузить мастеров:', err))

    return () => {
      cancelled = true
    }
  }, [])

  // Серверная загрузка с фильтрами; обновления «тихие» — список на экране
  // не мигает лоадером при смене фильтров.
  useEffect(() => {
    let cancelled = false

    async function loadOrders() {
      try {
        const result = await getOrders({
          search: debouncedSearch,
          status: activeFilter,
          masterId: masterFilter !== 'all' ? masterFilter : null,
          repairType: repairTypeFilter !== 'all' ? repairTypeFilter : null,
          isOverdue: overdueOnly || activeFilter === 'Просроченные',
        })

        if (!cancelled) {
          setOrders(result)
          setError('')
        }
      } catch (err) {
        console.error('Не удалось загрузить заказы:', err)

        if (!cancelled) {
          setError('Не удалось загрузить заказы. Попробуйте обновить страницу.')
        }
      } finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
    }

    loadOrders()

    return () => {
      cancelled = true
    }
  }, [debouncedSearch, activeFilter, masterFilter, repairTypeFilter, overdueOnly])

  // Обновление после создания заказа: с текущими фильтрами.
  async function refreshOrders() {
    setError('')

    try {
      const result = await getOrders({
        search: debouncedSearch,
        status: activeFilter,
        masterId: masterFilter !== 'all' ? masterFilter : null,
        repairType: repairTypeFilter !== 'all' ? repairTypeFilter : null,
        isOverdue: overdueOnly || activeFilter === 'Просроченные',
      })
      setOrders(result)
    } catch (err) {
      console.error('Не удалось загрузить заказы:', err)
      setError('Не удалось загрузить заказы. Попробуйте обновить страницу.')
    }
  }

  async function handleStatusChange(orderId, newStatus) {
    const currentOrder = orders.find((item) => item.id === orderId)

    if (!currentOrder || currentOrder.status === newStatus || updatingId) {
      return
    }

    setUpdatingId(orderId)

    try {
      await updateOrder(orderId, { status: newStatus })
      setOrders((prev) =>
        prev.map((item) =>
          item.id === orderId ? { ...item, status: newStatus } : item,
        ),
      )
    } catch (err) {
      console.error('Не удалось обновить статус:', err)
      setError(
        `Не удалось обновить статус заказа ${currentOrder.orderNumber}. Попробуйте ещё раз.`,
      )
    } finally {
      setUpdatingId(null)
    }
  }

  // Клиентская допфильтрация по дате приёма (скользящее окно).
  const dateCutoff = useMemo(() => {
    const start = new Date()
    start.setHours(0, 0, 0, 0)

    if (dateFilter === 'today') {
      return start
    }

    if (dateFilter === 'week') {
      const week = new Date(start)
      week.setDate(week.getDate() - 7)
      return week
    }

    if (dateFilter === 'month') {
      const month = new Date(start)
      month.setMonth(month.getMonth() - 1)
      return month
    }

    return null
  }, [dateFilter])

  const visibleOrders = useMemo(
    () =>
      orders.filter((order) => {
        if (
          dateCutoff &&
          order.acceptedAt &&
          new Date(order.acceptedAt) < dateCutoff
        ) {
          return false
        }

        return true
      }),
    [orders, dateCutoff],
  )

  return (
    <section className="page">
      <div className="orders-page__head">
        <h1 className="page__title">Заказы</h1>
        <div className="orders-page__actions">
          <Button onClick={() => setIsCreateOpen(true)}>+ Создать заказ</Button>
          <Button
            className="orders-page__action-button"
            onClick={() => exportOrdersToCsv(visibleOrders)}
            disabled={visibleOrders.length === 0}
          >
            Экспорт CSV
          </Button>
          <Button
            className={`orders-page__action-button${
              filtersOpen ? ' orders-page__action-button--active' : ''
            }`}
            onClick={() => setFiltersOpen((prev) => !prev)}
            aria-expanded={filtersOpen}
          >
            Фильтры
          </Button>
        </div>
      </div>

      <input
        className="orders-page__search"
        type="search"
        value={search}
        onChange={(event) => setSearch(event.target.value)}
        placeholder="Поиск по №, клиенту, телефону, устройству, IMEI или SN..."
        aria-label="Поиск заказов"
      />

      <div className="orders-page__filters">
        {FILTERS.map((filter) => (
          <button
            key={filter}
            type="button"
            className={
              filter === activeFilter
                ? 'orders-page__filter active'
                : 'orders-page__filter'
            }
            onClick={() => setActiveFilter(filter)}
          >
            {filter}
          </button>
        ))}
      </div>

      {filtersOpen ? (
        <div className="orders-page__filters-panel">
          <label className="orders-page__filter-field">
            <span>Статус</span>
            <select
              value={activeFilter}
              onChange={(event) => setActiveFilter(event.target.value)}
            >
              {FILTERS.map((filter) => (
                <option key={filter} value={filter}>
                  {filter}
                </option>
              ))}
            </select>
          </label>

          <label className="orders-page__filter-field">
            <span>Мастер</span>
            <select
              value={masterFilter}
              onChange={(event) => setMasterFilter(event.target.value)}
            >
              <option value="all">Все мастера</option>
              {employees.map((employee) => (
                <option key={employee.id} value={employee.id}>
                  {employee.fullName}
                </option>
              ))}
            </select>
          </label>

          <label className="orders-page__filter-field">
            <span>Тип ремонта</span>
            <select
              value={repairTypeFilter}
              onChange={(event) => setRepairTypeFilter(event.target.value)}
            >
              <option value="all">Все типы</option>
              {REPAIR_TYPE_OPTIONS.map((type) => (
                <option key={type} value={type}>
                  {type}
                </option>
              ))}
            </select>
          </label>

          <label className="orders-page__filter-field">
            <span>Дата приёма</span>
            <select
              value={dateFilter}
              onChange={(event) => setDateFilter(event.target.value)}
            >
              {DATE_FILTERS.map((filter) => (
                <option key={filter.value} value={filter.value}>
                  {filter.label}
                </option>
              ))}
            </select>
          </label>

          <label className="orders-page__filter-checkbox">
            <input
              type="checkbox"
              checked={overdueOnly}
              onChange={(event) => setOverdueOnly(event.target.checked)}
            />
            <span>Только просроченные</span>
          </label>
        </div>
      ) : null}

      {error ? (
        <p className="orders-page__error" role="alert">
          {error}
        </p>
      ) : null}

      {loading ? (
        <p className="orders-page__empty">Загрузка...</p>
      ) : (
        <div className="orders-page__table">
          <div className="orders-page__table-header">
            <span>Номер</span>
            <span>Клиент</span>
            <span>Устройство</span>
            <span>Неисправность</span>
            <span>Стоимость</span>
            <span>Статус</span>
            <span>Дата</span>
          </div>

          <ul className="orders-page__list">
            {visibleOrders.map((order) => (
              <li
                key={order.id ?? order.orderNumber}
                className="orders-page__row orders-page__row--clickable"
                onClick={() => navigate(`/orders/${order.id}`)}
              >
                <span className="orders-page__number">
                  <span className="orders-page__number-link">
                    {order.orderNumber}
                  </span>
                  {isOverdueOrder(order) ? (
                    <span className="orders-page__overdue-badge">
                      ⏰ Просрочено
                    </span>
                  ) : null}
                </span>
                <span>
                  <span className="orders-page__client">{order.client}</span>
                  {order.clientPhone ? (
                    <span className="orders-page__phone">
                      {order.clientPhone}
                    </span>
                  ) : null}
                </span>
                <span>{order.device}</span>
                <span className="orders-page__defect">{order.defect}</span>
                <span className="orders-page__price">
                  {formatPrice(order.price)}
                </span>
                <span onClick={(event) => event.stopPropagation()}>
                  <StatusDropdown
                    value={order.status}
                    onChange={(newStatus) =>
                      handleStatusChange(order.id, newStatus)
                    }
                    disabled={updatingId === order.id}
                  />
                </span>
                <span className="orders-page__date">
                  {formatDate(order.acceptedAt)}
                </span>
              </li>
            ))}
          </ul>

          {visibleOrders.length === 0 ? (
            <p className="orders-page__empty">Заказы не найдены</p>
          ) : null}
        </div>
      )}

      <CreateOrderModal
        open={isCreateOpen}
        onClose={() => setIsCreateOpen(false)}
        onOrderCreated={refreshOrders}
      />
    </section>
  )
}

export default OrdersPage
