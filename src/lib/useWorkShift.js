import { useCallback, useEffect, useState } from 'react'
import { useAuth } from './useAuth'
import { getOpenShift } from '../data/shifts'

// Бизнес-таймзона и рабочее окно LovinTech.
export const BUSINESS_TZ = 'Europe/Minsk'
export const BUSINESS_START_MINUTES = 11 * 60 // 11:00 включительно
export const BUSINESS_END_MINUTES = 17 * 60 + 30 // 17:30 исключительно
export const CLOSING_WARNING_MINUTES = 17 * 60 // 17:00 — предупреждение

// Минуты с полуночи в бизнес-таймзоне (не локальное время компьютера).
export function getMinskMinutesNow() {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: BUSINESS_TZ,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(new Date())

  const hour = Number(parts.find((part) => part.type === 'hour')?.value ?? '0')
  const minute = Number(parts.find((part) => part.type === 'minute')?.value ?? '0')

  return hour * 60 + minute
}

// Глобальный хук обязательной смены. Shift restriction применяется
// ТОЛЬКО к роли manager; admin/user/technician работают без ограничений
// (RBAC первым, shift — вторым).
export function useWorkShift() {
  const { user, profile } = useAuth()
  const userId = user?.id ?? null
  const roleCode = profile?.roles?.code ?? null
  const isManager = roleCode === 'manager'

  const [openShift, setOpenShift] = useState(null)
  const [loaded, setLoaded] = useState(false)
  const [, setTick] = useState(0)

  const refresh = useCallback(async () => {
    if (!userId) {
      setOpenShift(null)
      setLoaded(true)
      return
    }

    try {
      setOpenShift(await getOpenShift(userId))
    } catch (err) {
      console.warn('Не удалось загрузить открытую смену:', err.message)
      setOpenShift(null)
    } finally {
      setLoaded(true)
    }
  }, [userId])

  useEffect(() => {
    setLoaded(false)
    refresh()
  }, [refresh])

  // Пересчёт бизнес-времени каждые 30 секунд (окно 11:00/17:00/17:30).
  useEffect(() => {
    const timer = setInterval(() => setTick((value) => value + 1), 30000)
    return () => clearInterval(timer)
  }, [])

  const businessMinutes = getMinskMinutesNow()
  const isBusinessWindow =
    businessMinutes >= BUSINESS_START_MINUTES &&
    businessMinutes < BUSINESS_END_MINUTES
  const isClosingWarningWindow =
    businessMinutes >= CLOSING_WARNING_MINUTES &&
    businessMinutes < BUSINESS_END_MINUTES

  const canPerformWorkOperation =
    !isManager || (Boolean(openShift) && isBusinessWindow)

  const blockReason = canPerformWorkOperation
    ? null
    : !openShift
      ? 'Смена не открыта'
      : 'Рабочие операции доступны с 11:00 до 17:30'

  return {
    roleCode,
    isManager,
    openShift,
    businessMinutes,
    isBusinessWindow,
    isClosingWarningWindow,
    canPerformWorkOperation,
    blockReason,
    loaded,
    refresh,
  }
}

// UX-блокировка write-actions: blocked только после загрузки профиля
// и смены, чтобы manager не видел ложной блокировки на время загрузки.
export function useManagerShiftGuard() {
  const { canPerformWorkOperation, blockReason, loaded } = useWorkShift()

  return {
    blocked: loaded && !canPerformWorkOperation,
    reason: blockReason,
  }
}