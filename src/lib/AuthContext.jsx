import { useEffect, useRef, useState } from 'react'
import { getSession } from './auth'
import { supabase } from './supabase'
import { AuthContext } from './authContext'

// Стабильная ссылка на пустой массив: состояние «прав нет» не должно
// вызывать лишние ререндеры консьюмеров контекста.
const EMPTY_PERMISSIONS = []

export function AuthProvider({ children }) {
  const [loading, setLoading] = useState(true)
  const [session, setSession] = useState(null)
  const [user, setUser] = useState(null)
  const [profile, setProfile] = useState(null)
  const [permissions, setPermissions] = useState(EMPTY_PERMISSIONS)
  const loadedProfileIdRef = useRef(null)

  function clearProfile() {
    loadedProfileIdRef.current = null
    setProfile(null)
    setPermissions(EMPTY_PERMISSIONS)
  }

  // Загружает профиль пользователя с ролью и правами (RBAC).
  async function loadProfile(userId) {
    if (!userId || loadedProfileIdRef.current === userId) {
      return
    }

    loadedProfileIdRef.current = userId

    const { data, error } = await supabase
      .from('profiles')
      .select('*, roles(*, role_permissions(permissions(*)))')
      .eq('id', userId)
      .single()

    if (error) {
      // PGRST116 — профиль не найден (пользователь создан до внедрения RBAC).
      console.warn('Профиль пользователя не найден или недоступен:', error.message)
      setProfile(null)
      setPermissions(EMPTY_PERMISSIONS)
      return
    }

    const permissionCodes = (data?.roles?.role_permissions ?? [])
      .map((item) => item.permissions?.code)
      .filter(Boolean)

    setProfile(data)
    setPermissions(permissionCodes)
  }

  useEffect(() => {
    let isSubscribed = true

    async function loadInitialSession() {
      const result = await getSession()

      if (!isSubscribed) {
        return
      }

      const { data, error } = result

      if (error) {
        setSession(null)
        setUser(null)
      } else {
        setSession(data.session)
        setUser(data.session?.user ?? null)
      }

      const initialUser = error ? null : data.session?.user

      if (initialUser) {
        await loadProfile(initialUser.id)
      }

      setLoading(false)
    }

    loadInitialSession()

    const { data: authListener } = supabase.auth.onAuthStateChange(
      (event, currentSession) => {
        if (!isSubscribed) {
          return
        }

        setSession(currentSession)
        setUser(currentSession?.user ?? null)

        if (event === 'SIGNED_OUT') {
          clearProfile()
        } else if (currentSession?.user) {
          loadProfile(currentSession.user.id)
        }

        setLoading(false)
      },
    )

    return () => {
      isSubscribed = false
      authListener?.subscription?.unsubscribe()
    }
  }, [])

  return (
    <AuthContext.Provider value={{ loading, session, user, profile, permissions }}>
      {children}
    </AuthContext.Provider>
  )
}