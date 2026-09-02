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
  }))
}