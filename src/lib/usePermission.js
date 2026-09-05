import { useMemo } from 'react'
import { useAuth } from './useAuth'

// Возвращает true, если у текущего пользователя есть право permissionCode
// или его роль — admin (админ по умолчанию имеет все права).
export function usePermission(permissionCode) {
  const { profile, permissions } = useAuth()

  return useMemo(() => {
    const isAdmin = profile?.roles?.code === 'admin'

    if (isAdmin) {
      return true
    }

    if (!permissionCode) {
      return false
    }

    return permissions.includes(permissionCode)
  }, [profile, permissions, permissionCode])
}
