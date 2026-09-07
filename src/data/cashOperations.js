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

// ---------------- Смены ----------------
// Смены фиксируются кассовыми операциями с особыми категориями:
// «Открытие смены» (income — стартовый остаток) и «Закрытие смены»
// (expense, amount = 0 — маркер закрытия, итоговый остаток пишем в комментарий).
// Дашборд определяет статус смены по этим категориям за сегодня.
export const SHIFT_OPEN_CATEGORY = 'Открытие смены'
export const SHIFT_CLOSE_CATEGORY = 'Закрытие смены'
export const SHIFT_WITHDRAWAL_CATEGORY = 'Инкассация / выемка'

// Открытие смены: стартовый остаток наличных проводится приходом по кассе.
export async function openShift({ cashRegisterId, startCash, comment }) {
  return addCashOperation({
    cashRegisterId,
    type: 'income',
    category: SHIFT_OPEN_CATEGORY,
    amount: Number(startCash) || 0,
    comment: comment || null,
  })
}

// Закрытие смены: при инкассации/выемке проводится расход,
// затем — нулевой маркер закрытия с итоговым остатком в комментарии.
export async function closeShift({
  cashRegisterId,
  closingBalance,
  withdrawal,
  comment,
}) {
  const withdrawalAmount = Number(withdrawal) || 0

  if (withdrawalAmount > 0) {
    await addCashOperation({
      cashRegisterId,
      type: 'expense',
      category: SHIFT_WITHDRAWAL_CATEGORY,
      amount: withdrawalAmount,
      comment: comment || null,
    })
  }

  return addCashOperation({
    cashRegisterId,
    type: 'expense',
    category: SHIFT_CLOSE_CATEGORY,
    amount: 0,
    comment:
      `Итоговый остаток: ${Number(closingBalance) || 0}` +
      (comment ? ` · ${comment}` : ''),
  })
}
