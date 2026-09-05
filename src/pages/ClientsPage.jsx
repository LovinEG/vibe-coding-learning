import { useEffect, useState } from 'react'
import { getClients } from '../data/clients'
import './Page.css'

function formatDate(value) {
  if (!value) {
    return '—'
  }

  const date = new Date(value)

  if (Number.isNaN(date.getTime())) {
    return '—'
  }

  return new Intl.DateTimeFormat('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(date)
}

function ClientsPage() {
  const [clients, setClients] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')

  useEffect(() => {
    let cancelled = false

    async function loadClients() {
      try {
        const result = await getClients()
        if (!cancelled) {
          setClients(result)
        }
      } catch (err) {
        console.error('Не удалось загрузить клиентов:', err)
        if (!cancelled) {
          setError(
            'Не удалось загрузить клиентов. Попробуйте обновить страницу.',
          )
        }
      } finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
    }

    loadClients()

    return () => {
      cancelled = true
    }
  }, [])

  const normalizedSearch = search.trim().toLowerCase()
  const visibleClients = clients.filter((client) => {
    if (!normalizedSearch) {
      return true
    }

    return [client.name, client.phone]
      .filter(Boolean)
      .join(' ')
      .toLowerCase()
      .includes(normalizedSearch)
  })

  return (
    <section className="page">
      <h1 className="page__title">Клиенты</h1>

      <input
        className="clients-page__search"
        type="search"
        value={search}
        onChange={(event) => setSearch(event.target.value)}
        placeholder="Поиск по имени или телефону..."
        aria-label="Поиск клиентов"
      />

      {error ? (
        <p className="clients-page__error" role="alert">
          {error}
        </p>
      ) : null}

      {loading ? (
        <p className="clients-page__empty">Загрузка...</p>
      ) : (
        <div className="clients-page__table">
          <div className="clients-page__table-header">
            <span>Имя клиента</span>
            <span>Телефон</span>
            <span>Дата регистрации</span>
            <span>Устройства / заказы</span>
          </div>

          <ul className="clients-page__list">
            {visibleClients.map((client) => (
              <li key={client.id} className="clients-page__row">
                <span className="clients-page__name">{client.name}</span>
                <span className="clients-page__phone">
                  {client.phone || '—'}
                </span>
                <span className="clients-page__date">
                  {formatDate(client.createdAt)}
                </span>
                <span className="clients-page__counts">
                  {client.devicesCount} / {client.ordersCount}
                </span>
              </li>
            ))}
          </ul>

          {visibleClients.length === 0 ? (
            <p className="clients-page__empty">Клиенты не найдены</p>
          ) : null}
        </div>
      )}
    </section>
  )
}

export default ClientsPage
