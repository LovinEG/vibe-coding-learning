import { useEffect, useState } from 'react'
import { getSession } from './auth'
import { supabase } from './supabase'
import { AuthContext } from './authContext'

export function AuthProvider({ children }) {
  const [loading, setLoading] = useState(true)
  const [session, setSession] = useState(null)
  const [user, setUser] = useState(null)

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
        setLoading(false)
      },
    )

    return () => {
      isSubscribed = false
      authListener?.subscription?.unsubscribe()
    }
  }, [])

  return (
    <AuthContext.Provider value={{ loading, session, user }}>
      {children}
    </AuthContext.Provider>
  )
}