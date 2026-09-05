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

// id текущего профиля (profiles.id = auth.users.id) для авторства движения.
async function getCurrentProfileId() {
  const { data, error } = await supabase.auth.getUser()

  if (error) {
    throw error
  }

  return data?.user?.id ?? null
}

// Приход товара на склад: партия поставки + движение 'income'.
export async function addStockBatch({ partId, supplierId, quantity, purchasePrice }) {
  const { data, error } = await supabase
    .from('stock_batches')
    .insert({
      part_id: partId,
      supplier_id: supplierId ?? null,
      quantity,
      purchase_price: purchasePrice ?? null,
    })
    .select()
    .single()

  if (error) {
    throw error
  }

  const profileId = await getCurrentProfileId()

  const { error: movementError } = await supabase.from('stock_movements').insert({
    part_id: partId,
    movement_type: 'income',
    quantity,
    profile_id: profileId,
  })

  if (movementError) {
    throw movementError
  }

  return data
}