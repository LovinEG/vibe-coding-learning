import { supabase } from '../lib/supabase'

function mapCashRegister(row) {
  const balance = Number(row.balance)

  return {
    id: row.id,
    name: row.name,
    type: row.type,
    balance: Number.isFinite(balance) ? balance : 0,
    isActive: row.is_active,
    createdAt: row.created_at,
  }
}

// Все кассы, старые сверху (сортировка по created_at asc).
export async function getCashRegisters() {
  const { data, error } = await supabase
    .from('cash_registers')
    .select('*')
    .order('created_at', { ascending: true })

  if (error) {
    throw error
  }

  return (data ?? []).map(mapCashRegister)
}

// Новая касса: название, тип, начальный остаток.
export async function addCashRegister({ name, type, balance }) {
  const { data, error } = await supabase
    .from('cash_registers')
    .insert({
      name,
      type: type || 'cash',
      balance: balance ?? 0,
    })
    .select()
    .single()

  if (error) {
    throw error
  }

  return mapCashRegister(data)
}

// Редактирование: меняем только название, тип и статус активности.
// Остаток изменяется кассовыми операциями, а не этой формой.
export async function updateCashRegister(id, data) {
  const updates = {}

  if (data.name !== undefined) {
    updates.name = data.name
  }
  if (data.type !== undefined) {
    updates.type = data.type
  }
  if (data.isActive !== undefined) {
    updates.is_active = data.isActive
  }

  const { data: updated, error } = await supabase
    .from('cash_registers')
    .update(updates)
    .eq('id', id)
    .select()
    .single()

  if (error) {
    throw error
  }

  return mapCashRegister(updated)
}

// Удаление кассы (история операций при этом не затрагивается).
export async function deleteCashRegister(id) {
  const { error } = await supabase.from('cash_registers').delete().eq('id', id)

  if (error) {
    throw error
  }
}