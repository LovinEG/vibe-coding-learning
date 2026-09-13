import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { getCashRegisters } from '../../data/cashRegisters'
import { formatCurrency } from '../../lib/format'
import Button from '../ui/Button'
import './ShiftModal.css'

// Кассовая сверка отображается в BYN (касса LovinTech ведётся в BYN).
// Общий formatCurrency рендерит ₽ и для блока сверки не используется.
const bynFormatter = new Intl.NumberFormat('ru-RU', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

function formatByn(value) {
  return `${bynFormatter.format(value)} BYN`
}

// Округление расхождения до копеек — убирает float-шум вида
// 123.45 - 100.1 = 23.349999999999998 и нормализует -0 к 0.
function roundMoney(value) {
  const rounded = Number(value.toFixed(2))
  return rounded === 0 ? 0 : rounded
}

// Модальное окно управления сменой прямо с Дашборда:
// mode 'open' — стартовый остаток,
// mode 'close' — кассовая сверка: ожидаемый остаток смены и фактический
// остаток (пересчёт менеджером). Расхождение информационное: закрытию
// не мешает, баланс кассы не меняет, cash_operations не создаёт.
// Инкассации в LovinTech нет: деньги остаются в кассе после закрытия.
// Открытие/закрытие — через серверные RPC open_shift / close_shift
// (public.shifts): роль, время (Europe/Minsk) и автор определяются
// сервером, frontend их не передаёт. Маркеры cash_operations больше
// не создаются.
function ShiftModal({ open, mode, shift, onClose, onSaved }) {
  const isClosing = mode === 'close'

  // Кассовая сверка: openingBalance / cashCollected / expectedBalance уже
  // рассчитаны в dashboard.js (getDashboardSummary → shift.cash) и переданы
  // из DashboardPage — второй независимый расчёт не создаём. Если данных
  // нет (модалка открыта из напоминания в AppLayout, где доступен только
  // shiftId) — блок сверки не показываем, закрытие не блокируем.
  const shiftCash = shift?.cash ?? null
  const expectedBalance = shiftCash ? Number(shiftCash.expectedBalance) : null

  const [form, setForm] = useState({
    cashRegisterId: '',
    startCash: '',
    actualClosingBalance: '',
  })
  const [cashRegisters, setCashRegisters] = useState([])
  const [optionsLoading, setOptionsLoading] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!open) {
      return undefined
    }

    let cancelled = false

    async function loadOptions() {
      setOptionsLoading(true)

      try {
        const registers = await getCashRegisters()

        if (!cancelled) {
          setCashRegisters(registers)
          // По умолчанию — первая активная касса (нужно только для открытия
          // смены). Фактический остаток при закрытии менеджер вводит
          // вручную, без префилла из учётного баланса кассы.
          const defaultRegister = registers.find((item) => item.isActive)

          if (defaultRegister) {
            setForm((prev) => ({
              ...prev,
              cashRegisterId: defaultRegister.id,
            }))
          }
        }
      } catch (err) {
        if (!cancelled) {
          console.error('Не удалось загрузить кассы для смены:', err)
        }
      } finally {
        if (!cancelled) {
          setOptionsLoading(false)
        }
      }
    }

    loadOptions()

    return () => {
      cancelled = true
    }
  }, [open])

  if (!open) {
    return null
  }

  function handleChange(event) {
    const { name, value } = event.target
    setForm((prev) => ({ ...prev, [name]: value }))
  }

  // Текущий учётный баланс выбранной кассы (для отображения в форме).
  const selectedRegister = cashRegisters.find(
    (item) => item.id === form.cashRegisterId,
  )
  const selectedBalance = selectedRegister?.balance ?? null

  // Расхождение кассовой сверки: фактический остаток − ожидаемый.
  // Отрицательное — недостача (красным), положительное — излишек,
  // ноль — расхождений нет. Показываем, как только введено корректное
  // значение и доступен ожидаемый остаток смены.
  const actualEntered = Number(form.actualClosingBalance)
  const hasActualBalance =
    form.actualClosingBalance !== '' && Number.isFinite(actualEntered)
  const discrepancy =
    hasActualBalance && expectedBalance !== null
      ? roundMoney(actualEntered - expectedBalance)
      : null

  function validate() {
    if (!isClosing) {
      if (!form.cashRegisterId) {
        return 'Выберите кассу'
      }

      const startCash = Number(form.startCash)

      if (
        form.startCash === '' ||
        !Number.isFinite(startCash) ||
        startCash < 0
      ) {
        return 'Укажите корректный стартовый остаток'
      }

      return ''
    }

    // Закрытие: кассу берёт открытая смена (RPC close_shift по shiftId),
    // из формы нужен только обязательный фактический остаток — сумма,
    // которую менеджер реально пересчитал в кассе.
    const actual = Number(form.actualClosingBalance)

    if (
      form.actualClosingBalance === '' ||
      !Number.isFinite(actual) ||
      actual < 0
    ) {
      return 'Укажите корректный фактический остаток'
    }

    return ''
  }

  async function handleSubmit(event) {
    event.preventDefault()

    const validationError = validate()

    if (validationError) {
      setError(validationError)
      return
    }

    setError('')
    setSubmitting(true)

    try {
      let rpcError = null

      if (isClosing) {
        // Закрытие: нужен id текущей открытой смены (public.shifts).
        // closing_balance — snapshot фактического остатка (пересчёт
        // менеджером); баланс кассы RPC не меняет.
        if (!shift?.shiftId) {
          setError('Открытая смена не найдена. Обновите страницу.')
          setSubmitting(false)
          return
        }

        const result = await supabase.rpc('close_shift', {
          p_shift_id: shift.shiftId,
          p_closing_balance: Number(form.actualClosingBalance),
        })
        rpcError = result.error
      } else {
        // Открытие: роль, окно 11:00–17:30 (Europe/Minsk) и уникальность
        // смены проверяет сервер; текст ошибки RPC показываем пользователю.
        const result = await supabase.rpc('open_shift', {
          p_cash_register_id: form.cashRegisterId,
          p_opening_balance: Number(form.startCash || 0),
        })
        rpcError = result.error
      }

      if (rpcError) {
        throw rpcError
      }

      if (onSaved) {
        await onSaved()
      }

      onClose()
    } catch (err) {
      console.error('Не удалось сохранить смену:', err)
      setError(
        err.message ??
          (isClosing
            ? 'Не удалось закрыть смену. Попробуйте ещё раз.'
            : 'Не удалось открыть смену. Попробуйте ещё раз.'),
      )
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div
      className="shift-modal-overlay"
      onClick={submitting ? undefined : onClose}
    >
      <div
        className="shift-modal"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={isClosing ? 'Закрытие смены' : 'Открытие смены'}
      >
        <h2 className="shift-modal__title">
          {isClosing ? '🔒 Закрыть смену' : '🔓 Открыть смену'}
        </h2>

        <form onSubmit={handleSubmit}>
          {isClosing ? (
            // Кассовая сверка при закрытии: данные смены переданы из
            // Dashboard (shift.cash), кассу определяет открытая смена,
            // а не форма.
            shiftCash ? (
              <div className="shift-modal__cash">
                <div className="shift-modal__cash-row">
                  <span>Касса</span>
                  <span>{shiftCash.cashRegisterName}</span>
                </div>
                <div className="shift-modal__cash-row">
                  <span>Остаток при открытии</span>
                  <span>{formatByn(shiftCash.openingBalance)}</span>
                </div>
                <div className="shift-modal__cash-row">
                  <span>Принято наличными за смену</span>
                  <span>+{formatByn(shiftCash.cashCollected)}</span>
                </div>
                <div className="shift-modal__cash-row shift-modal__cash-row--expected">
                  <span>Ожидаемый остаток</span>
                  <span>{formatByn(shiftCash.expectedBalance)}</span>
                </div>
              </div>
            ) : (
              <p className="shift-modal__hint">
                Данные кассы смены недоступны. Введите фактический остаток
                вручную.
              </p>
            )
          ) : (
            <label className="shift-modal__field">
              <span className="shift-modal__label">Касса *</span>
              <select
                className="shift-modal__input"
                name="cashRegisterId"
                value={form.cashRegisterId}
                onChange={handleChange}
                disabled={optionsLoading}
              >
                <option value="">
                  {optionsLoading ? 'Загрузка касс...' : 'Выберите кассу'}
                </option>
                {cashRegisters.map((register) => (
                  <option key={register.id} value={register.id}>
                    {register.name} · {formatCurrency(register.balance)}
                  </option>
                ))}
              </select>
            </label>
          )}

          <label className="shift-modal__field">
            <span className="shift-modal__label">
              {isClosing
                ? 'Фактический остаток *'
                : 'Фактический остаток наличных при открытии *'}
            </span>
            <input
              className="shift-modal__input"
              name={isClosing ? 'actualClosingBalance' : 'startCash'}
              type="number"
              min="0"
              step="0.01"
              placeholder="0.00"
              value={isClosing ? form.actualClosingBalance : form.startCash}
              onChange={handleChange}
            />
          </label>

          {discrepancy !== null ? (
            <p
              className={`shift-modal__discrepancy${
                discrepancy < 0 ? ' shift-modal__discrepancy--shortage' : ''
              }`}
              role="status"
            >
              {discrepancy === 0
                ? `Расхождение: ${formatByn(discrepancy)}`
                : discrepancy > 0
                  ? `Излишек: +${formatByn(discrepancy)}`
                  : `Недостача: ${formatByn(discrepancy)}`}
            </p>
          ) : null}

          {isClosing ? (
            <p className="shift-modal__hint">
              Деньги остаются в кассе: закрытие смены не уменьшает баланс.
              Расхождение информационное и не блокирует закрытие.
            </p>
          ) : selectedBalance !== null ? (
            <p className="shift-modal__hint">
              Текущий остаток в системе:{' '}
              {formatCurrency(selectedBalance)}. При расхождении будет
              создана корректирующая запись (излишек / недостача).
            </p>
          ) : null}

          {!isClosing && !optionsLoading && cashRegisters.length === 0 ? (
            <p className="shift-modal__hint shift-modal__hint--error">
              Кассы не найдены. Сначала добавьте кассу в разделе «Кассы».
            </p>
          ) : null}

          {error ? (
            <p className="shift-modal__error" role="alert">
              {error}
            </p>
          ) : null}

          <div className="shift-modal__actions">
            <Button
              type="button"
              className="shift-modal__button--secondary"
              onClick={onClose}
              disabled={submitting}
            >
              Отмена
            </Button>
            <Button
              type="submit"
              disabled={submitting || (!isClosing && optionsLoading)}
            >
              {submitting
                ? isClosing
                  ? 'Закрытие...'
                  : 'Открытие...'
                : isClosing
                  ? 'Закрыть смену'
                  : 'Открыть смену'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default ShiftModal
