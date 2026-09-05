import { supabase } from '../lib/supabase'

// Журнал движений склада (audit log): приход, списание, возврат, брак.
// Типы — по CHECK-констрейнту БД: income | expense | return | defect.
export async function getStockMovements() {
  const { data, error } = await supabase
    .from('stock_movements')
    .select(
      '*, parts(sku, name), profiles(full_name, email), orders(order_number)',
    )
    .order('created_at', { ascending: false })

  if (error) {
    throw error
  }

  return (data ?? []).map((row) => ({
    id: row.id,
    createdAt: row.created_at,
    partName: row.parts?.name ?? '—',
    sku: row.parts?.sku ?? '—',
    movementType: row.movement_type,
    quantity: row.quantity ?? 0,
    userName: row.profiles?.full_name || row.profiles?.email || null,
    orderId: row.order_id ?? null,
    orderNumber: row.orders?.order_number ?? null,
    comment: row.comment ?? null,
  }))
}