import { supabase } from '../lib/supabase'

// Профили с джойном роли (id, name, code) и списком связанных разрешений.
// Права собираются из двух источников:
//   - role_permissions роли (базовые права роли);
//   - user_permissions (персональные/дополнительные права, access-list).
const USER_SELECT = '*, roles(id, name, code, role_permissions(permissions(*))), user_permissions(permissions(*))'

function mapUser(row) {
  const rolePermissions = (row.roles?.role_permissions ?? [])
    .map((item) => item.permissions)
    .filter(Boolean)

  const personalPermissions = (row.user_permissions ?? [])
    .map((item) => item.permissions)
    .filter(Boolean)

  // Дедупликация прав по id (роль + персональные могут пересекаться).
  const permissionMap = new Map()
  for (const permission of [...rolePermissions, ...personalPermissions]) {
    permissionMap.set(permission.id, permission)
  }

  return {
    id: row.id,
    fullName: row.full_name ?? '—',
    email: row.email ?? null,
    roleId: row.role_id ?? null,
    role: row.roles
      ? { id: row.roles.id, name: row.roles.name, code: row.roles.code }
      : null,
    permissions: Array.from(permissionMap.values()),
    createdAt: row.created_at,
  }
}

// Каталог сотрудников с ролями и правами.
export async function getUsers() {
  const { data, error } = await supabase
    .from('profiles')
    .select(USER_SELECT)
    .order('full_name', { ascending: true })

  if (error) {
    throw error
  }

  return (data ?? []).map(mapUser)
}

// Справочник всех ролей.
export async function getRoles() {
  const { data, error } = await supabase
    .from('roles')
    .select('id, name, code')
    .order('name', { ascending: true })

  if (error) {
    throw error
  }

  return data ?? []
}

// Смена роли пользователя. При смене роли персональные права очищаются
// (access-list привязан к контексту роли; новые права назначаются отдельно).
export async function updateUserRole(userId, roleId) {
  const { error: profileError } = await supabase
    .from('profiles')
    .update({ role_id: roleId, updated_at: new Date().toISOString() })
    .eq('id', userId)

  if (profileError) {
    throw profileError
  }

  const { error: permissionsError } = await supabase
    .from('user_permissions')
    .delete()
    .eq('user_id', userId)

  if (permissionsError) {
    throw permissionsError
  }
}

// Назначение персональных/дополнительных прав (access-list).
// Полностью заменяет текущий набор персональных прав пользователя.
export async function updateUserPermissions(userId, permissionIds) {
  // Сначала удаляем все текущие персональные права.
  const { error: deleteError } = await supabase
    .from('user_permissions')
    .delete()
    .eq('user_id', userId)

  if (deleteError) {
    throw deleteError
  }

  // Затем вставляем новый набор (если не пустой).
  if (permissionIds.length === 0) {
    return
  }

  const rows = permissionIds.map((permissionId) => ({
    user_id: userId,
    permission_id: permissionId,
  }))

  const { error: insertError } = await supabase
    .from('user_permissions')
    .insert(rows)

  if (insertError) {
    throw insertError
  }
}
