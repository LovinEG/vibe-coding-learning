import { useEffect, useMemo, useState } from 'react'
import UserRoleModal from '../components/modals/UserRoleModal'
import Button from '../components/ui/Button'
import { getUsers } from '../data/iam'
import { formatDate } from '../lib/format'
import { usePermission } from '../lib/usePermission'
import './Page.css'

const ROLE_BADGES = {
  admin: 'users-page__role-badge--admin',
  manager: 'users-page__role-badge--manager',
  technician: 'users-page__role-badge--technician',
  user: 'users-page__role-badge--user',
}

const ROLE_LABELS = {
  admin: 'Администратор',
  manager: 'Менеджер',
  technician: 'Техник',
  user: 'Сотрудник',
}

const ROLE_FILTERS = [
  { value: 'all', label: 'Все роли' },
  { value: 'admin', label: 'Администраторы' },
  { value: 'manager', label: 'Менеджеры' },
  { value: 'technician', label: 'Техники' },
  { value: 'user', label: 'Сотрудники' },
]

const MAX_VISIBLE_PERMISSIONS = 3

function UsersPage() {
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [search, setSearch] = useState('')
  const [roleFilter, setRoleFilter] = useState('all')
  const [modalOpen, setModalOpen] = useState(false)
  const [selectedUser, setSelectedUser] = useState(null)
  const [expandedPermissions, setExpandedPermissions] = useState(null)

  const canManage = usePermission('iam.manage')

  useEffect(() => {
    let cancelled = false

    async function loadUsers() {
      try {
        const result = await getUsers()

        if (!cancelled) {
          setUsers(result)
        }
      } catch (err) {
        console.error('Не удалось загрузить пользователей:', err)

        if (!cancelled) {
          setError(
            'Не удалось загрузить список пользователей. Попробуйте обновить страницу.',
          )
        }
      } finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
    }

    loadUsers()

    return () => {
      cancelled = true
    }
  }, [])

  function openModal(user) {
    setSelectedUser(user)
    setModalOpen(true)
  }

  function closeModal() {
    setModalOpen(false)
  }

  async function refreshUsers() {
    try {
      setError(null)
      setUsers(await getUsers())
    } catch (err) {
      console.error('Не удалось обновить список пользователей:', err)
      setError('Не удалось обновить список пользователей.')
    }
  }

  function togglePermissions(userId) {
    setExpandedPermissions((prev) => (prev === userId ? null : userId))
  }

  const totals = useMemo(() => {
    const counts = { total: users.length, admin: 0, manager: 0, technician: 0 }

    for (const user of users) {
      if (user.role && counts[user.role.code] !== undefined) {
        counts[user.role.code] += 1
      }
    }

    return counts
  }, [users])

  const normalizedSearch = search.trim().toLowerCase()

  const filteredUsers = useMemo(
    () =>
      users.filter((user) => {
        if (roleFilter !== 'all' && user.role?.code !== roleFilter) {
          return false
        }

        if (!normalizedSearch) {
          return true
        }

        return (
          user.fullName.toLowerCase().includes(normalizedSearch) ||
          (user.email && user.email.toLowerCase().includes(normalizedSearch))
        )
      }),
    [users, roleFilter, normalizedSearch],
  )

  if (!canManage) {
    return (
      <div className="page users-page">
        <p className="users-page__error" role="alert">
          У вас нет прав для просмотра раздела «Пользователи».
        </p>
      </div>
    )
  }

  return (
    <div className="page users-page">
      <div className="users-page__head">
        <div>
          <h1 className="users-page__title">Пользователи</h1>
          <p className="users-page__hint">
            Управление сотрудниками, ролями и правами доступа
          </p>
        </div>
      </div>

      <div className="users-page__totals">
        <div className="users-page__total">
          <span className="users-page__total-label">Всего сотрудников</span>
          <span className="users-page__total-value">{totals.total}</span>
        </div>
        <div className="users-page__total users-page__total--admin">
          <span className="users-page__total-label">Администраторы</span>
          <span className="users-page__total-value">{totals.admin}</span>
        </div>
        <div className="users-page__total users-page__total--manager">
          <span className="users-page__total-label">Менеджеры</span>
          <span className="users-page__total-value">{totals.manager}</span>
        </div>
        <div className="users-page__total users-page__total--technician">
          <span className="users-page__total-label">Техники</span>
          <span className="users-page__total-value">{totals.technician}</span>
        </div>
      </div>

      <input
        className="users-page__search"
        type="search"
        placeholder="Поиск по имени или email..."
        value={search}
        onChange={(event) => setSearch(event.target.value)}
        aria-label="Поиск пользователей"
      />

      <div className="users-page__filters">
        {ROLE_FILTERS.map((filter) => (
          <button
            key={filter.value}
            type="button"
            className={`users-page__filter${
              roleFilter === filter.value ? ' is-active' : ''
            }`}
            onClick={() => setRoleFilter(filter.value)}
          >
            {filter.label}
          </button>
        ))}
      </div>

      {loading ? (
        <p className="users-page__empty">Загрузка...</p>
      ) : error ? (
        <p className="users-page__error" role="alert">
          {error}
        </p>
      ) : filteredUsers.length === 0 ? (
        <p className="users-page__empty">Пользователи не найдены</p>
      ) : (
        <div className="users-page__table">
          <div className="users-page__table-header">
            <span>Сотрудник</span>
            <span>Роль</span>
            <span>Назначенные права</span>
            <span>Дата регистрации</span>
            <span>Действия</span>
          </div>

          <ul className="users-page__list">
            {filteredUsers.map((user) => (
              <li key={user.id} className="users-page__row">
                <span className="users-page__user">
                  <span className="users-page__user-name">{user.fullName}</span>
                  <span className="users-page__user-email">{user.email ?? '—'}</span>
                </span>
                <span>
                  <span
                    className={`users-page__role-badge ${
                      ROLE_BADGES[user.role?.code] ?? ''
                    }`}
                  >
                    {user.role ? ROLE_LABELS[user.role.code] || user.role.name : '—'}
                  </span>
                </span>
                <span className="users-page__permissions">
                  {user.permissions.length === 0 ? (
                    <span className="users-page__permissions-empty">—</span>
                  ) : (
                    <>
                      {user.permissions
                        .slice(0, MAX_VISIBLE_PERMISSIONS)
                        .map((permission) => (
                          <span
                            key={permission.id}
                            className="users-page__permission-badge"
                          >
                            {permission.code}
                          </span>
                        ))}
                      {user.permissions.length > MAX_VISIBLE_PERMISSIONS ? (
                        <button
                          type="button"
                          className="users-page__permissions-toggle"
                          onClick={() => togglePermissions(user.id)}
                        >
                          +{user.permissions.length - MAX_VISIBLE_PERMISSIONS}
                        </button>
                      ) : null}
                      {expandedPermissions === user.id ? (
                        <div className="users-page__permissions-expanded">
                          {user.permissions.map((permission) => (
                            <span
                              key={permission.id}
                              className="users-page__permission-badge"
                            >
                              {permission.code}
                            </span>
                          ))}
                        </div>
                      ) : null}
                    </>
                  )}
                </span>
                <span className="users-page__date">
                  {formatDate(user.createdAt)}
                </span>
                <span className="users-page__actions">
                  <Button
                    type="button"
                    className="users-page__edit-button"
                    onClick={() => openModal(user)}
                  >
                    Изменить роль / права
                  </Button>
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <UserRoleModal
        key={modalOpen ? `open-${selectedUser?.id}` : 'closed'}
        open={modalOpen}
        onClose={closeModal}
        user={selectedUser}
        onSaved={refreshUsers}
      />
    </div>
  )
}

export default UsersPage

