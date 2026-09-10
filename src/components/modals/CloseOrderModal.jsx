import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { getCashRegisters } from '../../data/cashRegisters'
import { formatPrice } from '../../lib/format'
import Button from '../ui/Button'
import './CloseOrderModal.css'

const PAYMENT_METHOD_OPTIONS = [
  { value: 'cash', label: 'Наличные' },
  { value: 'card', label: 'Карта' },
  { value: 'transfer', label: 'Перевод' },
]

// Форма действия «Оплатить и закрыть» на странице заказа.
// Подтверждение вызывает Supabase RPC close_order(p_order_id,
// p_cash_register_id, p_amount, p_payment_method) — он сам создаёт
// income-платёж (триггер обновляет баланс кассы), меняет статус заказа
// на «Закрыт», пишет closed_at и событие 'closed' в историю. Отдельные
// payment/cash operation на фронтенде не создаются.
function CloseOrderModal({ order, onClose, onClosed }) {
  const [form, setForm] = useState({
    amount: order?.price != null && order.price !== '' ? String(order.price) : '',
    method: 'cash',
    cashRegisterId: '',
  })
  const [cashRegisters, setCashRegisters] = useState([])
  const [optionsLoading, setOptionsLoading] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false

    async function loadOptions() {
      setOptionsLoading(true)

      try {
        const registers = await getCashRegisters()

        if (!cancelled) {
          setCashRegisters(registers)
        }
      } catch (err) {
        if (!cancelled) {
          console.error('Не удалось загрузить кассы:', err)
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
  }, [])

  function handleChange(event) {
    const { name, value } = event.target
    setForm((prev) => ({ ...prev, [name]: value }))
  }

  function validate() {
    if (!form.cashRegisterId) {
      return 'Выберите кассу'
    }

    const amount = Number(form.amount)

    if (form.amount === '' || !Number.isFinite(amount)) {
      return 'Укажите корректную сумму'
    }

    if (amount <= 0) {
      return 'Сумма должна быть больше нуля'
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

    setSubmitting(true)

    try {
      const { error: rpcError } = await supabase.rpc('close_order', {
        p_order_id: order.id,
        p_cash_register_id: form.cashRegisterId,
        p_amount: Number(form.amount),
        p_payment_method: form.method,
      })

      if (rpcError) {
        throw rpcError
      }

      // Успех: сообщаем странице (перезагрузит заказ + покажет баннер)
      // и закрываем модалку. Статус локально вручную не меняем.
      onClosed?.()
      onClose()
    } catch (err) {
      // Ошибка RPC: модалку не закрываем, статус не меняем —
      // показываем понятный текст ошибки пользователю.
      console.error('Не удалось закрыть заказ:', err)
      setError(err.message ?? 'Не удалось закрыть заказ. Попробуйте ещё раз.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div
      className="close-order-modal-overlay"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="close-order-modal"
        role="dialog"
        aria-modal="true"
        aria-label="Оплатить и закрыть"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="close-order-modal__head">
          <h2 className="close-order-modal__title">Оплатить и закрыть</h2>
          <button
            type="button"
            className="close-order-modal__close"
            onClick={onClose}
            aria-label="Закрыть"
          >
            ×
          </button>
        </div>

        <form onSubmit={handleSubmit} noValidate>
          <div className="close-order-modal__summary">
            <span className="close-order-modal__summary-label">
              Итоговая сумма заказа
            </span>
            <span className="close-order-modal__summary-value">
              {formatPrice(order?.price)}
            </span>
          </div>

          <label className="close-order-modal__field">
            <span className="close-order-modal__label">Сумма к оплате</span>
            <input
              type="number"
              name="amount"
              className="close-order-modal__input"
              value={form.amount}
              onChange={handleChange}
              min="0"
              step="0.01"
              placeholder="0"
            />
          </label>

          <label className="close-order-modal__field">
            <span className="close-order-modal__label">Способ оплаты</span>
            <select
              name="method"
              className="close-order-modal__input"
              value={form.method}
              onChange={handleChange}
            >
              {PAYMENT_METHOD_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <label className="close-order-modal__field">
            <span className="close-order-modal__label">Касса</span>
            <select
              name="cashRegisterId"
              className="close-order-modal__input"
              value={form.cashRegisterId}
              onChange={handleChange}
              disabled={optionsLoading}
            >
              <option value="">
                {optionsLoading ? 'Загрузка касс...' : 'Выберите кассу'}
              </option>
              {cashRegisters.map((register) => (
                <option key={register.id} value={register.id}>
                  {register.name}
                </option>
              ))}
            </select>
          </label>

          {error ? (
            <p className="close-order-modal__error" role="alert">
              {error}
            </p>
          ) : null}

          <div className="close-order-modal__actions">
            <Button type="submit" disabled={submitting || optionsLoading}>
              {submitting ? 'Оплата...' : 'Оплатить и закрыть'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default CloseOrderModal