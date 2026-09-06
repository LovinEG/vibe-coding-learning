import { supabase } from '../lib/supabase'
import { logOrderEvent, mapOrderPart } from './orders'

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

// Список деталей, списанных на заказ (с данными номенклатуры,
// ценообразованием закупка+наценка и автором добавления).
export async function getOrderParts(orderId) {
  const { data, error } = await supabase
    .from('order_parts')
    .select('*, parts(id, sku, name, category), added_by_profile:profiles!added_by(full_name)')
    .eq('order_id', orderId)
    .order('created_at', { ascending: true })

  if (error) {
    throw error
  }

  return (data ?? []).map(mapOrderPart)
}

// Списание детали на заказ: запись в order_parts (закупка + наценка) +
// движение 'expense' + пересчёт итоговой суммы заказа + событие 'part_added'
// в хронологии заказа.
//
// partData: { partId, quantity, purchasePrice, markup, addedBy }.
// clientPrice считается автоматически: purchasePrice + markup.
// Легаси-совместимость: если закупочные данные не переданы, но есть
// priceAtTime (розничная цена), клиентская цена = priceAtTime.
export async function addOrderPart(orderId, partData = {}) {
  const {
    partId,
    quantity,
    purchasePrice = null,
    markup = null,
    addedBy = null,
    priceAtTime = null,
  } = partData

  if (!orderId || !partId) {
    throw new Error('addOrderPart: требуются orderId и partId')
  }

  const qty = Number(quantity)

  if (!Number.isInteger(qty) || qty < 1) {
    throw new Error('Количество должно быть целым числом не меньше 1')
  }

  // Итоговая цена для клиента: закупка + наценка.
  let clientPrice = null

  if (purchasePrice != null && markup != null) {
    clientPrice = Number(purchasePrice) + Number(markup)
  } else if (priceAtTime != null) {
    // Легаси-режим: розничная цена была фактической ценой клиента.
    clientPrice = Number(priceAtTime)
  }

  // Автор добавления: переданный addedBy или текущий пользователь сессии.
  const profileId = addedBy ?? (await getCurrentProfileId())

  // 1. Привязка детали к заказу с точным ценообразованием.
  const { data: created, error: insertError } = await supabase
    .from('order_parts')
    .insert({
      order_id: orderId,
      part_id: partId,
      quantity: qty,
      // price_at_time дублирует client_price для обратной совместимости
      // (removePartFromOrder и старые выборки читают эту колонку).
      price_at_time: clientPrice,
      purchase_price: purchasePrice,
      markup,
      client_price: clientPrice,
      master_id: profileId,
      added_by: profileId,
    })
    .select('*, parts(name)')
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

  // 3. Финансовый пересчёт заказа (+ стоимость деталей).
  const order = await recalcOrderPrice(orderId, Number(clientPrice ?? 0) * qty)

  // 4. Событие в хронологии заказа.
  const partName = created?.parts?.name ?? 'деталь'

  await logOrderEvent({
    orderId,
    status: 'part_added',
    title: `Добавлена деталь: ${partName}`,
    comment:
      clientPrice != null
        ? `${qty} шт. × ${clientPrice} ₽ = ${Number(clientPrice) * qty} ₽`
        : `${qty} шт.`,
    createdBy: profileId,
  })

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