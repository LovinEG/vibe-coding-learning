import { supabase } from '../lib/supabase'

// Партии поставок с джойнами запчасти и поставщика, свежие сверху.
export async function getStockBatches() {
  const { data, error } = await supabase
    .from('stock_batches')
    .select('*, parts(sku, name, category), suppliers(name)')
    .order('created_at', { ascending: false })

  if (error) {
    throw error
  }

  return (data ?? []).map((batch) => {
    const quantity = batch.quantity ?? 0
    const purchasePrice =
      batch.purchase_price === null || batch.purchase_price === undefined
        ? null
        : Number(batch.purchase_price)

    return {
      id: batch.id,
      createdAt: batch.created_at,
      partId: batch.part_id,
      sku: batch.parts?.sku ?? null,
      partName: batch.parts?.name ?? null,
      category: batch.parts?.category ?? null,
      supplierName: batch.suppliers?.name ?? null,
      quantity,
      purchasePrice,
      total:
        purchasePrice !== null ? Number((quantity * purchasePrice).toFixed(2)) : null,
    }
  })
}

// Приход товара на склад — атомарная операция на сервере.
//
// RPC public.receive_stock_batch (миграция
// 20260920000000_create_receive_stock_batch_rpc.sql) в одной транзакции
// создаёт партию поставки (stock_batches) и движение 'income'
// (stock_movements) со связями batch_id / supplier_id / purchase_price и
// автором profile_id = auth.uid(). Раньше это были два отдельных INSERT
// из фронтенда: сбой второго оставлял партию без движения, и остаток
// склада (VIEW v_part_stock) не увеличивался.
//
// Контракт сохранён: те же аргументы ({ partId, supplierId, quantity,
// purchasePrice }) и тот же возврат — созданная партия. Ошибки сервера
// (нет права inventory.manage, quantity <= 0, цена < 0) приходят как
// обычный PostgrestError и пробрасываются наверх: StockBatchModal
// показывает err.message пользователю.
export async function addStockBatch({ partId, supplierId, quantity, purchasePrice }) {
  const { data, error } = await supabase.rpc('receive_stock_batch', {
    p_part_id: partId,
    p_supplier_id: supplierId ?? null,
    p_quantity: quantity,
    p_purchase_price: purchasePrice ?? null,
  })

  if (error) {
    throw error
  }

  return data
}