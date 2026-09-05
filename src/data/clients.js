import { supabase } from '../lib/supabase'

export async function getClients() {
  const { data, error } = await supabase
    .from('clients')
    .select('*, devices(*), orders(*)')
    .order('created_at', { ascending: false })

  if (error) {
    throw error
  }

  return (data ?? []).map((client) => ({
    id: client.id,
    name: client.name,
    phone: client.phone,
    createdAt: client.created_at,
    devicesCount: client.devices?.length ?? 0,
    ordersCount: client.orders?.length ?? 0,
  }))
}