import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { getCashRegisters } from '../../data/cashRegisters'
import { formatCurrency } from '../../lib/format'
import Button from '../ui/Button'
import './ShiftModal.css'

// Модальное окно управления сменой прямо с Дашборда:
// mode 'open' — стартовый остаток и заметка,
// mode 'close' — итоговый остаток и заметка.
// Инкассации в LovinTech нет: деньги остаются в кассе после закрытия.
// Открытие/закрытие — через серверные RPC open_shift / close_shift
// (public.shifts): роль, время (Europe/Minsk) и автор определяются
// сервером, frontend их не передаёт. Маркеры cash_operations больше
// не создаются.
function ShiftModal({ open, mode, shift, onClose, onSaved }) {
  const isClosing = mode === 'close'

  const [form, setForm] = useState({
    cashRegisterId: '',
    startCash: '',
    closingBalance: '',
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
          // По умолчанию — первая активная касса.
          const defaultRegister = registers.find((item) => item.isActive)

          if (defaultRegister) {
            setForm((prev) => ({
              ...prev,
              cashRegisterId: defaultRegister.id,
              closingBalance: String(defaultRegister.balance),
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

  function validate() {
    if (!form.cashRegisterId) {
      return 'Выберите кассу'
    }

    if (!isClosing) {
      const startCash = Number(form.startCash)

      if (
        form.startCash === '' ||
        !Number.isFinite(startCash) ||
        startCash < 0
      ) {
        return 'Укажите корректный стартовый остаток'
      }
    } else {
      const closingBalance = Number(form.closingBalance || 0)

      if (!Number.isFinite(closingBalance) || closingBalance < 0) {
        return 'Укажите корректный итоговый остаток'
      }
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
        // closing_balance — snapshot; баланс кассы RPC не меняет.
        if (!shift?.shiftId) {
          setError('Открытая смена не найдена. Обновите страницу.')
          setSubmitting(false)
          return
        }

        const result = await supabase.rpc('close_shift', {
          p_shift_id: shift.shiftId,
          p_closing_balance: Number(form.closingBalance || 0),
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

          <label className="shift-modal__field">
            <span className="shift-modal__label">
              {isClosing ? 'Фактический остаток наличных при закрытии *' : 'Фактический остаток наличных при открытии *'}
            </span>
            <input
              className="shift-modal__input"
              name={isClosing ? 'closingBalance' : 'startCash'}
              type="number"
              min="0"
              step="0.01"
              placeholder="0.00"
              value={isClosing ? form.closingBalance : form.startCash}
              onChange={handleChange}
            />
          </label>

          {isClosing ? (
            <p className="shift-modal__hint">
              Деньги остаются в кассе: закрытие смены не уменьшает баланс.
            </p>
          ) : selectedBalance !== null ? (
            <p className="shift-modal__hint">
              Текущий остаток в системе:{' '}
              {formatCurrency(selectedBalance)}. При расхождении будет
              создана корректирующая запись (излишек / недостача).
            </p>
          ) : null}

          {!optionsLoading && cashRegisters.length === 0 ? (
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
            <Button type="submit" disabled={submitting || optionsLoading}>
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
