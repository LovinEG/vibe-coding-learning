import { supabase } from '../lib/supabase'

// id текущего пользователя — он же profiles.id (1:1 с auth.users).
async function getCurrentProfileId() {
  const { data, error } = await supabase.auth.getUser()

  if (error) {
    throw error
  }

  return data?.user?.id ?? null
}

// Итоговая сумма заказа (orders.price) складывается из базовой стоимости
// работ (задаётся при создании заказа) и стоимости списанных запчастей.
// Пересчёт выполняется инкрементально: + стоимость при добавлении,
// - при удалении, чтобы ручная цена работ не терялась.
async function recalcOrderPrice(orderId, delta) {
  const { data: order, error: orderError } = await supabase
    .from('orders')
    .select('price')
    .eq('id', orderId)
    .single()

  if (orderError) {
    throw orderError
  }

  const newPrice = Math.max(0, Number(order?.price ?? 0) + delta)

  const { data: updated, error: updateError } = await supabase
    .from('orders')
    .update({ price: newPrice })
    .eq('id', orderId)
    .select()
    .single()

  if (updateError) {
    throw updateError
  }

  return updated
}

// Список деталей, списанных на заказ (с данными номенклатуры).
export async function getOrderParts(orderId) {
  const { data, error } = await supabase
    .from('order_parts')
    .select('*, parts(id, sku, name, category)')
    .eq('order_id', orderId)
    .order('created_at', { ascending: true })

  if (error) {
    throw error
  }

  return (data ?? []).map((row) => ({
    id: row.id,
    orderId: row.order_id,
    partId: row.part_id,
    partName: row.parts?.name ?? '—',
    partSku: row.parts?.sku ?? '—',
    quantity: row.quantity,
    priceAtTime: row.price_at_time === null ? null : Number(row.price_at_time),
    sum: Number(row.price_at_time ?? 0) * Number(row.quantity ?? 0),
  }))
}

// Списание детали на заказ: запись в order_parts + движение 'expense'
// + пересчёт итоговой суммы заказа.
export async function addPartToOrder({
  orderId,
  partId,
  quantity,
  priceAtTime,
}) {
  const profileId = await getCurrentProfileId()
  const qty = Number(quantity)

  // 1. Привязка детали к заказу.
  const { data: created, error: insertError } = await supabase
    .from('order_parts')
    .insert({
      order_id: orderId,
      part_id: partId,
      quantity: qty,
      price_at_time: priceAtTime ?? null,
      master_id: profileId,
    })
    .select()
    .single()

  if (insertError) {
    throw insertError
  }

  // 2. Движение товара: расход со склада.
  const { error: movementError } = await supabase
    .from('stock_movements')
    .insert({
      part_id: partId,
      movement_type: 'expense',
      quantity: qty,
      profile_id: profileId,
      order_id: orderId,
    })

  if (movementError) {
    throw movementError
  }

  // 3. Финансовый пересчёт заказа.
  const order = await recalcOrderPrice(orderId, Number(priceAtTime ?? 0) * qty)

  return { orderPart: created, order }
}

// Удаление детали из заказа: удаление записи + компенсирующее движение
// 'return' (возврат на склад) + пересчёт итоговой суммы заказа.
export async function removePartFromOrder(orderPartId, orderId) {
  const profileId = await getCurrentProfileId()

  // 1. Читаем запись ДО удаления: нужны part_id, quantity и цена.
  const { data: row, error: rowError } = await supabase
    .from('order_parts')
    .select('part_id, quantity, price_at_time')
    .eq('id', orderPartId)
    .single()

  if (rowError) {
    throw rowError
  }

  // 2. Удаляем привязку детали к заказу.
  const { error: deleteError } = await supabase
    .from('order_parts')
    .delete()
    .eq('id', orderPartId)

  if (deleteError) {
    throw deleteError
  }

  // 3. Компенсирующее движение: возврат на склад.
  const { error: movementError } = await supabase
    .from('stock_movements')
    .insert({
      part_id: row.part_id,
      movement_type: 'return',
      quantity: row.quantity,
      profile_id: profileId,
      order_id: orderId,
    })

  if (movementError) {
    throw movementError
  }

  // 4. Финансовый пересчёт заказа.
  const order = await recalcOrderPrice(
    orderId,
    -(Number(row.price_at_time ?? 0) * Number(row.quantity ?? 0)),
  )

  return { order }
}