import { supabase } from '../lib/supabase'

// Запчасти с суммарным остатком по всем партиям склада.
export async function getParts() {
  const { data, error } = await supabase
    .from('parts')
    .select('*, stock_batches(quantity)')
    .order('name', { ascending: true })

  if (error) {
    throw error
  }

  return (data ?? []).map((part) => ({
    id: part.id,
    sku: part.sku,
    name: part.name,
    category: part.category,
    minStock: part.min_stock,
    retailPrice: part.retail_price,
    createdAt: part.created_at,
    totalStock: (part.stock_batches ?? []).reduce(
      (sum, batch) => sum + (batch.quantity ?? 0),
      0,
    ),
  }))
}

// Справочник поставщиков.
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

// Создание запчасти в номенклатуре.
export async function addPart(partData) {
  const { data, error } = await supabase
    .from('parts')
    .insert({
      sku: partData.sku,
      name: partData.name,
      category: partData.category,
      min_stock: partData.minStock ?? 0,
      retail_price: partData.retailPrice ?? null,
    })
    .select()
    .single()

  if (error) {
    throw error
  }

  return data
}

// Приход товара на склад (партия поставки).
export async function addStockBatch(batchData) {
  const { data, error } = await supabase
    .from('stock_batches')
    .insert({
      part_id: batchData.partId,
      supplier_id: batchData.supplierId ?? null,
      quantity: batchData.quantity,
      purchase_price: batchData.purchasePrice ?? null,
    })
    .select()
    .single()

  if (error) {
    throw error
  }

  return data
}