import { supabase } from '../lib/supabase'

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