import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { getRoles, updateUserRole, updateUserPermissions } from '../../data/iam'
import Button from '../ui/Button'
import './UserRoleModal.css'

// Группировка разрешений по домену (префикс до точки).
function groupPermissionsByModule(permissions) {
  const groups = new Map()

  for (const permission of permissions) {
    const module = permission.code.split('.')[0]

    if (!groups.has(module)) {
      groups.set(module, [])
    }

    groups.get(module).push(permission)
  }

  return Array.from(groups.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([module, items]) => ({
      module,
      permissions: items.sort((a, b) => a.code.localeCompare(b.code)),
    }))
}

async function getAllPermissions() {
  const { data, error } = await supabase
    .from('permissions')
    .select('id, code, module, description')
    .order('code', { ascending: true })

  if (error) {
    throw error
  }

  return data ?? []
}

function UserRoleModal({ open, onClose, user, onSaved }) {
  const [roles, setRoles] = useState([])
  const [allPermissions, setAllPermissions] = useState([])
  const [selectedRoleId, setSelectedRoleId] = useState(() => user?.roleId ?? '')
  const [selectedPermissionIds, setSelectedPermissionIds] = useState(
    () => user?.permissions.map((p) => p.id) ?? [],
  )
  const [optionsLoading, setOptionsLoading] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!open) {
      return undefined
    }

    let cancelled = false

    async function loadOptions() {
      setOptionsLoading(true)

      try {
        const [rolesResult, permissionsResult] = await Promise.all([
          getRoles(),
          getAllPermissions(),
        ])

        if (!cancelled) {
          setRoles(rolesResult)
          setAllPermissions(permissionsResult)
        }
      } catch (err) {
        if (!cancelled) {
          console.error('Не удалось загрузить справочники IAM:', err)
        }
      } finally {
        if (!cancelled) {
          setOptionsLoading(false)
        }
      }
    }

    loadOptions()

    return () => {
      cancelled = true
    }
  }, [open])

  const permissionGroups = useMemo(
    () => groupPermissionsByModule(allPermissions),
    [allPermissions],
  )

  if (!open) {
    return null
  }

  function handleRoleChange(event) {
    setSelectedRoleId(event.target.value)
  }

  function handlePermissionToggle(permissionId) {
    setSelectedPermissionIds((prev) =>
      prev.includes(permissionId)
        ? prev.filter((id) => id !== permissionId)
        : [...prev, permissionId],
    )
  }

  function handleOverlayClick(event) {
    if (event.target === event.currentTarget) {
      onClose()
    }
  }

  function handleCardClick(event) {
    event.stopPropagation()
  }

  async function handleSubmit(event) {
    event.preventDefault()

    if (!selectedRoleId) {
      setError('Выберите роль')
      return
    }

    setError('')
    setSubmitting(true)

    try {
      await updateUserRole(user.id, selectedRoleId)
      await updateUserPermissions(user.id, selectedPermissionIds)
      onSaved()
      onClose()
    } catch (err) {
      console.error('Не удалось сохранить роль/права:', err)
      setError('Не удалось сохранить изменения. Попробуйте ещё раз.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div
      className="user-role-modal-overlay"
      onClick={handleOverlayClick}
      role="presentation"
    >
      <div
        className="user-role-modal"
        onClick={handleCardClick}
        role="dialog"
        aria-modal="true"
        aria-label={`Роль и права: ${user?.fullName ?? ''}`}
      >
        <h2 className="user-role-modal__title">Роль и права доступа</h2>

        <form onSubmit={handleSubmit}>
          <div className="user-role-modal__user">
            <label className="user-role-modal__field">
              <span className="user-role-modal__label">Пользователь</span>
              <input
                className="user-role-modal__input user-role-modal__input--readonly"
                type="text"
                value={user?.fullName ?? ''}
                readOnly
                tabIndex={-1}
              />
            </label>
            <label className="user-role-modal__field">
              <span className="user-role-modal__label">Email</span>
              <input
                className="user-role-modal__input user-role-modal__input--readonly"
                type="email"
                value={user?.email ?? '—'}
                readOnly
                tabIndex={-1}
              />
            </label>
          </div>

          <label className="user-role-modal__field">
            <span className="user-role-modal__label">Роль *</span>
            <select
              className="user-role-modal__input"
              name="roleId"
              value={selectedRoleId}
              onChange={handleRoleChange}
              disabled={optionsLoading}
            >
              <option value="">
                {optionsLoading ? 'Загрузка ролей...' : 'Выберите роль'}
              </option>
              {roles.map((role) => (
                <option key={role.id} value={role.id}>
                  {role.name}
                </option>
              ))}
            </select>
          </label>

          <div className="user-role-modal__permissions">
            <span className="user-role-modal__label">
              Гранулярные разрешения
            </span>
            {optionsLoading ? (
              <p className="user-role-modal__hint">Загрузка разрешений...</p>
            ) : permissionGroups.length === 0 ? (
              <p className="user-role-modal__hint">
                Разрешения не найдены.
              </p>
            ) : (
              <div className="user-role-modal__permission-groups">
                {permissionGroups.map((group) => (
                  <fieldset
                    key={group.module}
                    className="user-role-modal__permission-group"
                  >
                    <legend className="user-role-modal__group-title">
                      {group.module}.*
                    </legend>
                    {group.permissions.map((permission) => (
                      <label
                        key={permission.id}
                        className="user-role-modal__checkbox"
                      >
                        <input
                          type="checkbox"
                          checked={selectedPermissionIds.includes(permission.id)}
                          onChange={() => handlePermissionToggle(permission.id)}
                        />
                        <span className="user-role-modal__checkbox-code">
                          {permission.code}
                        </span>
                        {permission.description ? (
                          <span className="user-role-modal__checkbox-desc">
                            {permission.description}
                          </span>
                        ) : null}
                      </label>
                    ))}
                  </fieldset>
                ))}
              </div>
            )}
          </div>

          {error ? (
            <p className="user-role-modal__error" role="alert">
              {error}
            </p>
          ) : null}

          <div className="user-role-modal__actions">
            <Button
              type="button"
              className="user-role-modal__button--secondary"
              onClick={onClose}
              disabled={submitting}
            >
              Отмена
            </Button>
            <Button type="submit" disabled={submitting || optionsLoading}>
              {submitting ? 'Сохранение...' : 'Сохранить'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default UserRoleModal

