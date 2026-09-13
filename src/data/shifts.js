import { supabase } from '../lib/supabase'
import { getPayments } from './payments'

// Чтение смен из public.shifts (этап 1 серверной системы смен).
// Строки создаются только RPC open_shift / close_shift.

function mapShift(row) {
  return {
    id: row.id,
    cashRegisterId: row.cash_register_id,
    cashRegisterName: row.cash_registers?.name ?? '—',
    openedBy: row.opened_by,
    openedAt: row.opened_at,
    openingBalance: Number(row.opening_balance) || 0,
    status: row.status,
  }
}

// Открытая смена пользователя (status = 'open') — для виджета смены
// на дашборде и расчёта shiftRevenue. null — открытой смены нет.
export async function getOpenShift(userId) {
  if (!userId) {
    return null
  }

  const { data, error } = await supabase
    .from('shifts')
    .select(
      'id, cash_register_id, cash_registers(name), opened_by, opened_at, opening_balance, status',
    )
    .eq('opened_by', userId)
    .eq('status', 'open')
    .maybeSingle()

  if (error) {
    throw error
  }

  return data ? mapShift(data) : null
}

// ЕДИНЫЙ расчёт кассы текущей смены — одна бизнес-логика для всех мест:
//   expectedBalance = opening_balance
//     + order-linked income payments (только текущая касса, только cash,
//       только после opened_at).
// Используется Dashboard (getDashboardSummary) и ShiftModal (закрытие
// смены) — независимые копии расчёта не создаются.
export function buildShiftCash(openShift, incomePayments, now = new Date()) {
  if (!openShift) {
    return null
  }

  const openedAt = new Date(openShift.openedAt)

  const cashPayments = incomePayments.filter(
    (payment) =>
      payment.orderId &&
      payment.cashRegisterId === openShift.cashRegisterId &&
      payment.paymentMethod === 'cash' &&
      new Date(payment.createdAt) >= openedAt &&
      new Date(payment.createdAt) <= now,
  )

  const cashCollected = cashPayments.reduce(
    (sum, payment) => sum + payment.amount,
    0,
  )

  return {
    cashRegisterName: openShift.cashRegisterName,
    openingBalance: openShift.openingBalance,
    cashCollected,
    expectedBalance: openShift.openingBalance + cashCollected,
  }
}

// Полные данные кассовой сверки открытой смены пользователя: открытая смена
// (public.shifts) + платежи, рассчитанные единым buildShiftCash.
// Используется ShiftModal при закрытии смены из ЛЮБОГО места CRM — сверка
// всегда обязательна и одинакова независимо от точки входа в модалку.
export async function getOpenShiftCashSummary(userId) {
  const openShift = await getOpenShift(userId)

  if (!openShift) {
    return null
  }

  const payments = await getPayments()
  const incomePayments = payments.filter(
    (payment) => payment.type === 'income',
  )

  return buildShiftCash(openShift, incomePayments)
}