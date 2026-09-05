import { supabase } from '../lib/supabase'

const PAYMENT_SELECT =
  '*, cash_registers(name), orders(order_number), clients(name), profiles(full_name)'

function mapPayment(row) {
  const amount = Number(row.amount)

  return {
    id: row.id,
    cashRegisterId: row.cash_register_id,
    cashRegisterName: row.cash_registers?.name ?? '—',
    orderId: row.order_id ?? null,
    orderNumber: row.orders?.order_number ?? null,
    clientId: row.client_id ?? null,
    clientName: row.clients?.name ?? null,
    type: row.type,
    amount: Number.isFinite(amount) ? amount : 0,
    paymentMethod: row.payment_method,
    comment: row.comment ?? null,
    createdBy: row.created_by ?? null,
    createdByName: row.profiles?.full_name ?? null,
    createdAt: row.created_at,
  }
}

// Журнал платежей, свежие сверху.
export async function getPayments() {
  const { data, error } = await supabase
    .from('payments')
    .select(PAYMENT_SELECT)
    .order('created_at', { ascending: false })

  if (error) {
    throw error
  }

  return (data ?? []).map(mapPayment)
}

// Проведение платежа: INSERT в payments запускает триггер, который
// автоматически обновляет баланс кассы (income — плюс, expense — минус).
export async function addPayment({
  cashRegisterId,
  orderId,
  clientId,
  type,
  amount,
  paymentMethod,
  comment,
}) {
  // Автор операции фиксируется по текущему пользователю.
  const { data: userData } = await supabase.auth.getUser()

  const { data, error } = await supabase
    .from('payments')
    .insert({
      cash_register_id: cashRegisterId,
      order_id: orderId || null,
      client_id: clientId || null,
      type,
      amount,
      payment_method: paymentMethod,
      comment: comment || null,
      created_by: userData?.user?.id ?? null,
    })
    .select(PAYMENT_SELECT)
    .single()

  if (error) {
    throw error
  }

  return mapPayment(data)
}