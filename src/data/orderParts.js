import { supabase } from '../lib/supabase'
import { logOrderEvent, mapOrderPart, recalcOrderPrice } from './orders'
import { logOrderTimelineEvent } from './orderEvents'

// id текущего пользователя — он же profiles.id (1:1 с auth.users).
async function getCurrentProfileId() {
  const { data, error } = await supabase.auth.getUser()

  if (error) {
    throw error
  }

  return data?.user?.id ?? null
}

// Итоговая сумма заказа: базовая стоимость работ + детали + доп. работы.
// recalcOrderPrice — общий хелпер, живёт в orders.js.

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

  // 4. Событие в хронологии заказа (легаси order_status_history).
  const partName = created?.parts?.name ?? 'деталь'

  await logOrderEvent({
    orderId,
    status: 'part_added',
    title: `Добавлена деталь: ${partName}`,
    comment:
      clientPrice != null
        ? `${qty} шт. × ${clientPrice} BYN = ${Number(clientPrice) * qty} BYN`
        : `${qty} шт.`,
    createdBy: profileId,
  })

  // 5. Событие таймлайна (Stage 3): part_added с названием детали и
  // количеством. Не дублирует logOrderEvent — это order_events; легаси-
  // строка с тем же типом дедуплицируется при построении ленты.
  // Сбой записи не откатывает списание детали.
  await logOrderTimelineEvent({
    orderId,
    type: 'part_added',
    message: `Добавлена деталь: ${partName}, ${qty} шт.`,
    metadata: { part_id: partId, name: partName, quantity: qty },
    authorId: profileId,
  })

  return { orderPart: created, order }
}

// Минимальное чтение для финансового отчёта: строки order_parts по набору
// заказов (только поля, нужные для себестоимости: purchase_price — снимок
// на момент списания; текущий parts.purchase_price не используется).
export async function getOrderPartsByOrderIds(orderIds) {
  if (!Array.isArray(orderIds) || orderIds.length === 0) {
    return []
  }

  const { data, error } = await supabase
    .from('order_parts')
    .select('order_id, quantity, purchase_price')
    .in('order_id', orderIds)

  if (error) {
    throw error
  }

  return data ?? []
}

// Удаление детали из заказа: удаление записи + компенсирующее движение
// 'return' (возврат на склад) + пересчёт итоговой суммы заказа + событие
// 'part_removed' в таймлайне заказа.
export async function removePartFromOrder(orderPartId, orderId) {
  const profileId = await getCurrentProfileId()

  // 1. Читаем запись ДО удаления: нужны part_id, quantity, цена и название
  // детали (для текста события таймлайна).
  const { data: row, error: rowError } = await supabase
    .from('order_parts')
    .select('part_id, quantity, price_at_time, parts(name)')
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

  // 5. Событие таймлайна (Stage 3): part_removed. В легаси-истории
  // (order_status_history) кода 'part_removed' нет, поэтому событие
  // пишется только в order_events — история не трогается.
  // Сбой записи не откатывает возврат детали на склад.
  const partName = row?.parts?.name ?? 'деталь'
  const partQuantity = Number(row?.quantity ?? 0)

  await logOrderTimelineEvent({
    orderId,
    type: 'part_removed',
    message: `Удалена деталь: ${partName}, ${partQuantity} шт.`,
    metadata: { part_id: row?.part_id ?? null, name: partName, quantity: partQuantity },
    authorId: profileId,
  })

  return { order }
}