import { supabase } from '../lib/supabase'

const OPERATION_SELECT =
  '*, cash_registers(name), profiles(full_name)'

function mapOperation(row) {
  const amount = Number(row.amount)

  return {
    id: row.id,
    cashRegisterId: row.cash_register_id,
    cashRegisterName: row.cash_registers?.name ?? '—',
    type: row.type,
    category: row.category,
    amount: Number.isFinite(amount) ? amount : 0,
    comment: row.comment ?? null,
    createdBy: row.created_by ?? null,
    createdByName: row.profiles?.full_name ?? null,
    createdAt: row.created_at,
  }
}

// Список кассовых операций, свежие сверху.
export async function getCashOperations() {
  const { data, error } = await supabase
    .from('cash_operations')
    .select(OPERATION_SELECT)
    .order('created_at', { ascending: false })

  if (error) {
    throw error
  }

  return (data ?? []).map(mapOperation)
}

// Проведение операции: INSERT в cash_operations запускает триггер, который
// автоматически обновляет баланс кассы (income — плюс, expense — минус).
export async function addCashOperation({
  cashRegisterId,
  type,
  category,
  amount,
  comment,
}) {
  const { data: userData } = await supabase.auth.getUser()

  const { data, error } = await supabase
    .from('cash_operations')
    .insert({
      cash_register_id: cashRegisterId,
      type,
      category,
      amount,
      comment: comment || null,
      created_by: userData?.user?.id ?? null,
    })
    .select(OPERATION_SELECT)
    .single()

  if (error) {
    throw error
  }

  return mapOperation(data)
}
