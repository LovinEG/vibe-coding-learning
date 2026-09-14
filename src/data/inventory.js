import { supabase } from '../lib/supabase'

// Запчасти с текущим остатком из журнала движений склада.
//
// Источник истины по остатку — VIEW public.v_part_stock, который считает
// income + return - expense - defect по stock_movements (миграция
// 20260919000000_create_part_stock_view.sql). Раньше остаток считался как
// sum(stock_batches.quantity) — это был приход за всё время, который не
// уменьшался при списании деталей на заказы.
// stock_batches остаётся источником партий и закупочных цен, но не остатка.
// parts.stock_quantity (deprecated) не читается.
//
// DTO сохранён прежним (id, sku, name, category, minStock, retailPrice,
// createdAt, totalStock) — UI и остальные потребители не меняются.
export async function getParts() {
  const [partsResult, stockResult] = await Promise.all([
    supabase.from('parts').select('*').order('name', { ascending: true }),
    supabase.from('v_part_stock').select('part_id, quantity_on_hand'),
  ])

  if (partsResult.error) {
    throw partsResult.error
  }

  if (stockResult.error) {
    throw stockResult.error
  }

  // Деталь без движений: VIEW возвращает по ней строку с остатком 0,
  // `?? 0` — страховка на случай отсутствия строки (результат тот же).
  const stockByPart = new Map(
    (stockResult.data ?? []).map((row) => [
      row.part_id,
      row.quantity_on_hand ?? 0,
    ]),
  )

  return (partsResult.data ?? []).map((part) => ({
    id: part.id,
    sku: part.sku,
    name: part.name,
    category: part.category,
    minStock: part.min_stock,
    retailPrice: part.retail_price,
    createdAt: part.created_at,
    totalStock: stockByPart.get(part.id) ?? 0,
  }))
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