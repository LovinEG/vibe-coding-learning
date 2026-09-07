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
// «Открытие смены» и «Закрытие смены» — служебные маркеры с amount = 0
// (баланс кассы они не меняют), при расхождении создаётся корректирующая
// запись излишка/недостачи. Дашборд определяет статус смены по категориям.
export const SHIFT_OPEN_CATEGORY = 'Открытие смены'
export const SHIFT_CLOSE_CATEGORY = 'Закрытие смены'
export const SHIFT_WITHDRAWAL_CATEGORY = 'Инкассация / выемка'
export const SHIFT_SURPLUS_CATEGORY = 'Излишек при открытии смены'
export const SHIFT_SHORTAGE_CATEGORY = 'Недостача при открытии смены'

// Открытие смены. Введённая пользователем сумма — фактический остаток
// наличных в кассе (стартовый баланс), а НЕ сумма прихода:
// 1) сама запись «Открытие смены» фиксируется с amount: 0 — служебный
//    маркер, деньги к кассе повторно не прибавляются;
// 2) если фактический остаток отличается от учётного баланса кассы,
//    создаётся отдельная корректирующая запись на разницу
//    (излишек — income, недостача — expense), которая и меняет баланс.
export async function openShift({ cashRegisterId, startCash, comment }) {
  const startCashAmount = Number(startCash) || 0

  try {
    // Текущий учётный баланс кассы.
    const { data: register, error: registerError } = await supabase
      .from('cash_registers')
      .select('balance')
      .eq('id', cashRegisterId)
      .single()

    if (registerError) {
      throw registerError
    }

    // Служебный маркер открытия смены: баланс не меняет.
    const marker = await addCashOperation({
      cashRegisterId,
      type: 'income',
      category: SHIFT_OPEN_CATEGORY,
      amount: 0,
      comment:
        `Стартовый остаток: ${startCashAmount}` +
        (comment ? ` · ${comment}` : ''),
    })

    // Корректировка учётного баланса на разницу (излишек/недостача).
    const currentBalance = Number(register?.balance) || 0
    const diff = startCashAmount - currentBalance

    if (diff !== 0) {
      await addCashOperation({
        cashRegisterId,
        type: diff > 0 ? 'income' : 'expense',
        category:
          diff > 0
            ? SHIFT_SURPLUS_CATEGORY
            : SHIFT_SHORTAGE_CATEGORY,
        amount: Math.abs(diff),
        comment: `Открытие смены: учётный ${currentBalance}, фактический ${startCashAmount}`,
      })
    }

    return marker
  } catch (error) {
    // Ошибки базы не проглатываются: лог + проброс наверх,
    // чтобы ShiftModal показал пользователю уведомление об ошибке.
    console.error('Failed to open shift:', error)
    throw error
  }
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
