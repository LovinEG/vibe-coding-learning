import { supabase } from '../lib/supabase'

export async function getOrders() {
  const { data, error } = await supabase
    .from('orders')
    .select('*')

  if (error) {
    throw error
  }

  return data.map((order) => ({
    orderNumber: order.order_number,
    client: order.client,
    device: order.device,
    status: order.status,
    price: `${order.price} ₽`,
    defect: order.defect,
    acceptedAt: order.accepted_at,
  }))
}

export async function createOrder(order) {
  const { error } = await supabase
    .from('orders')
    .insert({
      order_number: order.orderNumber,
      client: order.client,
      device: order.device,
      status: order.status,
      price: order.price,
      defect: order.defect,
      accepted_at: order.acceptedAt,
    })

  if (error) {
    throw error
  }
}
