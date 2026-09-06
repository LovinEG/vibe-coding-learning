import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  exportClientsToCsv,
  getClients,
} from '../data/clients'
import { formatCurrency, formatDate } from '../lib/format'
import Button from '../components/ui/Button'
import CreateClientModal from '../components/modals/CreateClientModal'
import './Page.css'

function ClientsPage() {
  const navigate = useNavigate()

  const [clients, setClients] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [isCreateOpen, setIsCreateOpen] = useState(false)

  // Дебаунс поиска: серверный запрос не дёргается на каждый символ.
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 350)

    return () => clearTimeout(timer)
  }, [search])

  useEffect(() => {
    let cancelled = false

    async function loadClients() {
      try {
        const result = await getClients({ search: debouncedSearch })

        if (!cancelled) {
          setClients(result)
          setError('')
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
  }, [debouncedSearch])



  return (
    <section className="page clients-page">
      <div className="clients-page__head">
        <h1 className="page__title">Клиенты</h1>
        <div className="clients-page__actions">
          <Button
            className="clients-page__action-button"
            onClick={() => exportClientsToCsv(clients)}
            disabled={clients.length === 0}
          >
            📥 Экспорт в CSV
          </Button>
          <Button onClick={() => setIsCreateOpen(true)}>+ Новый клиент</Button>
        </div>
      </div>

      <input
        className="clients-page__search"
        type="search"
        value={search}
        onChange={(event) => setSearch(event.target.value)}
        placeholder="Поиск по имени, телефону или email..."
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
            <span>Клиент</span>
            <span>Контакты</span>
            <span>Устройств</span>
            <span>Заказов</span>
            <span>LTV (выручка)</span>
            <span>Дата регистрации</span>
          </div>

          <ul className="clients-page__list">
            {clients.map((client) => (
              <li
                key={client.id}
                className="clients-page__row clients-page__row--clickable"
                onClick={() => navigate(`/clients/${client.id}`)}
              >
                <span className="clients-page__name">{client.name}</span>
                <span className="clients-page__contacts">
                  <span className="clients-page__phone">
                    {client.phone || '—'}
                  </span>
                  {client.email ? (
                    <span className="clients-page__email">{client.email}</span>
                  ) : null}
                </span>
                <span className="clients-page__counts">
                  {client.devicesCount}
                </span>
                <span className="clients-page__counts">
                  {client.ordersCount}
                </span>
                <span className="clients-page__ltv">
                  {formatCurrency(client.ltv)}
                </span>
                <span className="clients-page__date">
                  {formatDate(client.createdAt)}
                </span>
              </li>
            ))}
          </ul>

          {clients.length === 0 ? (
            <div className="clients-page__empty-state">
              <span className="clients-page__empty-icon" aria-hidden="true">
                👥
              </span>
              <p className="clients-page__empty-title">
                {debouncedSearch
                  ? 'Клиенты не найдены'
                  : 'Пока нет ни одного клиента'}
              </p>
              <p className="clients-page__empty-hint">
                Добавьте первого клиента, чтобы начать вести базу
              </p>
              {!debouncedSearch ? (
                <Button onClick={() => setIsCreateOpen(true)}>
                  + Новый клиент
                </Button>
              ) : null}
            </div>
          ) : null}
        </div>
      )}

      <CreateClientModal
        key={isCreateOpen ? 'open' : 'closed'}
        open={isCreateOpen}
        onClose={() => setIsCreateOpen(false)}
        onSaved={async () => {
          setError('')
          try {
            setClients(await getClients({ search: debouncedSearch }))
          } catch (err) {
            console.error('Не удалось обновить клиентов:', err)
          }
        }}
      />
    </section>
  )
}

export default ClientsPage
