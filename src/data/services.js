import { supabase } from '../lib/supabase'

function mapService(row) {
  return {
    id: row.id,
    name: row.name,
    price: Number(row.price) || 0,
    durationMinutes: row.duration_minutes ?? null,
    isActive: row.is_active ?? true,
    createdAt: row.created_at,
  }
}

// Справочник типовых услуг (активные, по названию).
export async function getServices() {
  const { data, error } = await supabase
    .from('services')
    .select('*')
    .eq('is_active', true)
    .order('name', { ascending: true })

  if (error) {
    throw error
  }

  return (data ?? []).map(mapService)
}
