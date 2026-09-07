import { supabase } from '../lib/supabase'

// Маппинг строки parts из БД (snake_case) в объект приложения (camelCase).
function mapPart(row) {
  const purchasePrice = Number(row.purchase_price)
  const sellingPrice = Number(row.selling_price)

  return {
    id: row.id,
    createdAt: row.created_at,
    name: row.name,
    sku: row.sku,
    category: row.category ?? 'Общие',
    purchasePrice: Number.isFinite(purchasePrice) ? purchasePrice : 0,
    sellingPrice: Number.isFinite(sellingPrice) ? sellingPrice : 0,
    stockQuantity: row.stock_quantity ?? 0,
    minStockLimit: row.min_stock_limit ?? 2,
  }
}

const PART_SELECT =
  'id, created_at, name, sku, category, purchase_price, selling_price, stock_quantity, min_stock_limit'

// Номенклатура склада с серверным поиском и фильтрами.
// filters: { search, category, lowStock }.
// Сортировка по умолчанию: created_at desc (свежие детали сверху).
export async function getParts(filters = {}) {
  let query = supabase
    .from('parts')
    .select(PART_SELECT)
    .order('created_at', { ascending: false })

  const search = filters.search?.trim()

  if (search) {
    const pattern = `%${search.replace(/[%_,()]/g, ' ')}%`

    query = query.or(`name.ilike.${pattern},sku.ilike.${pattern}`)
  }

  if (filters.category) {
    query = query.eq('category', filters.category)
  }

  const { data, error } = await query

  if (error) {
    throw error
  }

  let parts = (data ?? []).map(mapPart)

  // Фильтр «заканчиваются»: остаток не выше минимального порога
  // (сравнение двух колонок в PostgREST из клиента недоступно — фильтруем тут).
  if (filters.lowStock) {
    parts = parts.filter(
      (part) => part.stockQuantity <= part.minStockLimit,
    )
  }

  return parts
}

// Детальная информация о детали.
export async function getPartById(partId) {
  const { data, error } = await supabase
    .from('parts')
    .select(PART_SELECT)
    .eq('id', partId)
    .single()

  if (error) {
    console.error(
      `Supabase: не удалось загрузить деталь (id=${partId}):`,
      error,
    )
    throw error
  }

  return mapPart(data)
}

// Добавление новой детали.
export async function addPart(partData) {
  const { data, error } = await supabase
    .from('parts')
    .insert({
      name: partData.name,
      sku: partData.sku,
      category: partData.category || 'Общие',
      purchase_price: partData.purchasePrice ?? 0,
      selling_price: partData.sellingPrice ?? 0,
      stock_quantity: partData.stockQuantity ?? 0,
      min_stock_limit: partData.minStockLimit ?? 2,
    })
    .select(PART_SELECT)
    .single()

  if (error) {
    console.error('Supabase: не удалось добавить деталь:', error)
    throw error
  }

  return mapPart(data)
}

// Редактирование: обновляем только переданные поля.
export async function updatePart(partId, partData) {
  const updates = {}

  if (partData.name !== undefined) {
    updates.name = partData.name
  }
  if (partData.sku !== undefined) {
    updates.sku = partData.sku
  }
  if (partData.category !== undefined) {
    updates.category = partData.category || 'Общие'
  }
  if (partData.purchasePrice !== undefined) {
    updates.purchase_price = partData.purchasePrice ?? 0
  }
  if (partData.sellingPrice !== undefined) {
    updates.selling_price = partData.sellingPrice ?? 0
  }
  if (partData.stockQuantity !== undefined) {
    updates.stock_quantity = partData.stockQuantity ?? 0
  }
  if (partData.minStockLimit !== undefined) {
    updates.min_stock_limit = partData.minStockLimit ?? 2
  }

  const { data, error } = await supabase
    .from('parts')
    .update(updates)
    .eq('id', partId)
    .select(PART_SELECT)
    .single()

  if (error) {
    console.error(
      `Supabase: не удалось обновить деталь (id=${partId}):`,
      error,
    )
    throw error
  }

  return mapPart(data)
}

// Приход (+) / списание (-) остатка. Итог не уходит в минус:
// при нехватке выбрасываем ошибку, ничего не меняя.
export async function updateStock(partId, quantityChange) {
  const change = Number(quantityChange) || 0

  const { data: current, error: fetchError } = await supabase
    .from('parts')
    .select('stock_quantity')
    .eq('id', partId)
    .single()

  if (fetchError) {
    console.error(
      `Supabase: не удалось получить остаток детали (id=${partId}):`,
      fetchError,
    )
    throw fetchError
  }

  const newQuantity = (current?.stock_quantity ?? 0) + change

  if (newQuantity < 0) {
    throw new Error(
      `Недостаточно деталей на складе: списание ${Math.abs(change)} при остатке ${current?.stock_quantity ?? 0}`,
    )
  }

  return updatePart(partId, { stockQuantity: newQuantity })
}

// Экспорт склада в CSV (Excel-совместимый: BOM + разделитель «;»).
export function exportPartsToCsv(partsList) {
  const headers = [
    'Артикул',
    'Название',
    'Категория',
    'Остаток',
    'Мин. остаток',
    'Цена закупки',
    'Цена продажи',
  ]

  const escapeCell = (value) => {
    const text = value === null || value === undefined ? '' : String(value)
    return `"${text.replace(/"/g, '""')}"`
  }

  const rows = partsList.map((part) =>
    [
      part.sku,
      part.name,
      part.category,
      part.stockQuantity,
      part.minStockLimit,
      part.purchasePrice,
      part.sellingPrice,
    ]
      .map(escapeCell)
      .join(';'),
  )

  const csv = ['\uFEFF', headers.map(escapeCell).join(';'), ...rows].join('\r\n')

  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')

  link.href = url
  link.download = `warehouse-${new Date().toISOString().slice(0, 10)}.csv`
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}

// Уникальные категории для фильтра склада.
export async function getWarehouseCategories() {
  const { data, error } = await supabase
    .from('parts')
    .select('category')

  if (error) {
    console.error('Supabase: не удалось получить категории склада:', error)
    throw error
  }

  const categories = Array.from(
    new Set((data ?? []).map((row) => row.category?.trim()).filter(Boolean)),
  )

  return categories.sort((a, b) => a.localeCompare(b, 'ru'))
}
