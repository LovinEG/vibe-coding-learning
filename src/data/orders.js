import { supabase } from '../lib/supabase'

export async function getOrders() {
  const { data, error } = await supabase
    .from('orders')
    .select('*, clients(*), devices(*)')

  if (error) {
    throw error
  }

  return data.map((order) => ({
    orderNumber: order.order_number,
    client: order.clients?.name || order.client,
    device: order.devices
      ? `${order.devices.brand || ''} ${order.devices.model || ''}`.trim()
      : order.device,
    status: order.status,
    price: `${order.price} ₽`,
    defect: order.defect,
    acceptedAt: order.accepted_at,
    clientPhone: order.clients?.phone || null,
    clientId: order.client_id,
    deviceId: order.device_id,
  }))
}

export async function createOrder(orderData) {
  // 1. Создаём клиента
  const { data: clientData, error: clientError } = await supabase
    .from('clients')
    .insert({
      name: orderData.client,
      phone: orderData.clientPhone || '',
    })
    .select()
    .single()

  if (clientError) {
    throw clientError
  }

  // 2. Создаём устройство клиента
  const { data: deviceData, error: deviceError } = await supabase
    .from('devices')
    .insert({
      client_id: clientData.id,
      brand: orderData.brand || 'Не указано',
      model: orderData.device,
      serial_number: orderData.serialNumber || null,
    })
    .select()
    .single()

  if (deviceError) {
    throw deviceError
  }

  // 3. Создаём заказ
  const { data: createdOrder, error: orderError } = await supabase
    .from('orders')
    .insert({
      order_number: orderData.orderNumber,
      client_id: clientData.id,
      device_id: deviceData.id,
      // для совместимости дублируем текстовые поля
      client: orderData.client,
      device: orderData.device,
      status: orderData.status,
      price: orderData.price,
      defect: orderData.defect,
      accepted_at: orderData.acceptedAt,
    })
    .select()
    .single()

  if (orderError) {
    throw orderError
  }

  return createdOrder
}

export async function updateOrder(orderNumber, updates) {
  const { data, error } = await supabase
    .from('orders')
    .update({
      client: updates.client,
      device: updates.device,
      status: updates.status,
      price: updates.price,
      defect: updates.defect,
      accepted_at: updates.acceptedAt,
    })
    .eq('order_number', orderNumber)
    .select()

  if (error) {
    throw error
  }

  if (!data || data.length === 0) {
    throw new Error(`Заказ ${orderNumber} не найден или не был обновлён`)
  }
}

export async function deleteOrder(orderNumber) {
  const { data, error } = await supabase
    .from('orders')
    .delete()
    .eq('order_number', orderNumber)
    .select()

  if (error) {
    throw error
  }

  if (!data || data.length === 0) {
    throw new Error(`Заказ ${orderNumber} не найден или не был удалён`)
  }
}
