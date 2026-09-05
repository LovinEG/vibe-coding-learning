import { supabase } from './supabase'

export async function signIn(email, password) {
  const result = await supabase.auth.signInWithPassword({ email, password })

  return result
}

export async function getSession() {
  const result = await supabase.auth.getSession()

  return result
}