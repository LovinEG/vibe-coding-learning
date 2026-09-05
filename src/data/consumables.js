import { supabase } from '../lib/supabase'

// Все расходники мастерской, по алфавиту.
export async function getConsumables() {
  const { data, error } = await supabase
    .from('consumables')
    .select('*')
    .order('name', { ascending: true })

  if (error) {
    throw error
  }

  return (data ?? []).map((row) => ({
    id: row.id,
    name: row.name,
    quantity: Number(row.quantity),
    unit: row.unit,
    minQuantity: Number(row.min_quantity),
    createdAt: row.created_at,
  }))
}

// Создание расходника (snake_case маппинг в БД).
export async function addConsumable({ name, quantity, unit, minQuantity }) {
  const { data, error } = await supabase
    .from('consumables')
    .insert({
      name,
      quantity: quantity ?? 0,
      unit: unit ?? 'шт',
      min_quantity: minQuantity ?? 0,
    })
    .select()
    .single()

  if (error) {
    throw error
  }

  return data
}

// Редактирование расходника (передаются только заполненные поля).
export async function updateConsumable(id, data) {
  const updates = {}

  if (data.name !== undefined) {
    updates.name = data.name
  }
  if (data.unit !== undefined) {
    updates.unit = data.unit
  }
  if (data.quantity !== undefined) {
    updates.quantity = data.quantity
  }
  if (data.minQuantity !== undefined) {
    updates.min_quantity = data.minQuantity
  }

  const { data: updated, error } = await supabase
    .from('consumables')
    .update(updates)
    .eq('id', id)
    .select()
    .single()

  if (error) {
    throw error
  }

  return updated
}

// Прямая корректировка остатка (списание/пополнение из UI).
export async function adjustConsumableQuantity(id, newQuantity) {
  const { data, error } = await supabase
    .from('consumables')
    .update({ quantity: newQuantity })
    .eq('id', id)
    .select()
    .single()

  if (error) {
    throw error
  }

  return data
}

// Удаление расходника.
export async function deleteConsumable(id) {
  const { error } = await supabase
    .from('consumables')
    .delete()
    .eq('id', id)

  if (error) {
    throw error
  }
}