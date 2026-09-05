import { supabase } from '../lib/supabase'

// Справочник поставщиков, отсортированный по названию.
export async function getSuppliers() {
  const { data, error } = await supabase
    .from('suppliers')
    .select('*')
    .order('name', { ascending: true })

  if (error) {
    throw error
  }

  return data ?? []
}

// Создание поставщика.
export async function addSupplier(supplierData) {
  const { data, error } = await supabase
    .from('suppliers')
    .insert({
      name: supplierData.name,
      phone: supplierData.phone ?? null,
      email: supplierData.email ?? null,
      address: supplierData.address ?? null,
      notes: supplierData.notes ?? null,
    })
    .select()
    .single()

  if (error) {
    throw error
  }

  return data
}

// Обновление поставщика по id.
export async function updateSupplier(id, supplierData) {
  const { data, error } = await supabase
    .from('suppliers')
    .update({
      name: supplierData.name,
      phone: supplierData.phone ?? null,
      email: supplierData.email ?? null,
      address: supplierData.address ?? null,
      notes: supplierData.notes ?? null,
    })
    .eq('id', id)
    .select()
    .single()

  if (error) {
    throw error
  }

  return data
}

// Удаление поставщика (supplier_id в stock_batches очищается через on delete set null).
export async function deleteSupplier(id) {
  const { error } = await supabase.from('suppliers').delete().eq('id', id)

  if (error) {
    throw error
  }

  return true
}