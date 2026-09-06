import { useEffect, useMemo, useState } from 'react'
import { getParts } from '../data/inventory'
import {
  addOrderPart,
  getOrderParts,
  removePartFromOrder,
} from '../data/orderParts'
import { usePermission } from '../lib/usePermission'
import { formatPrice } from '../lib/format'
import './OrderPartsManager.css'

// Управление запчастями заказа: список списанных деталей + форма списания
// со склада. Добавление/удаление доступно только при праве inventory.manage.
function OrderPartsManager({ orderId, onPriceChange }) {
  const canManage = usePermission('inventory.manage')
  const [boundParts, setBoundParts] = useState([])
  const [warehouseParts, setWarehouseParts] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [selectedPartId, setSelectedPartId] = useState('')
  const [quantity, setQuantity] = useState(1)
  const [busyAction, setBusyAction] = useState(null)

  useEffect(() => {
    let cancelled = false

    async function loadData() {
      setLoading(true)
      setError('')

      try {
        const [parts, linked] = await Promise.all([
          getParts(),
          getOrderParts(orderId),
        ])

        if (!cancelled) {
          setWarehouseParts(parts)
          setBoundParts(linked)
        }
      } catch (err) {
        console.error('Не удалось загрузить детали заказа:', err)
        if (!cancelled) {
          setError(
            'Не удалось загрузить данные о запчастях. Попробуйте ещё раз.',
          )
        }
      } finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
    }

    loadData()

    return () => {
      cancelled = true
    }
  }, [orderId])

  // Остаток, доступный для списания на ЭТОТ заказ:
  // складской остаток минус уже привязанное количество.
  function getAvailable(part) {
    const used = boundParts
      .filter((item) => item.partId === part.id)
      .reduce((sum, item) => sum + item.quantity, 0)

    return Math.max(0, part.totalStock - used)
  }

  const selectedPart = useMemo(
    () => warehouseParts.find((part) => part.id === selectedPartId) ?? null,
    [warehouseParts, selectedPartId],
  )

  const selectedAvailable = selectedPart ? getAvailable(selectedPart) : 0
  const isBusy = busyAction !== null

  async function refreshBoundParts() {
    const linked = await getOrderParts(orderId)
    setBoundParts(linked)
  }

  function notifyPriceChange(order) {
    if (order && typeof onPriceChange === 'function') {
      onPriceChange(order.id, Number(order.price))
    }
  }

  async function handleAddPart(event) {
    event.preventDefault()

    if (!selectedPart || isBusy) {
      return
    }

    const qty = Number(quantity)

    if (!Number.isInteger(qty) || qty < 1) {
      setError('Количество должно быть целым числом не меньше 1.')
      return
    }

    if (qty > selectedAvailable) {
      setError(
        `Нельзя списать ${qty} шт. — доступно только ${selectedAvailable} шт. детали «${selectedPart.name}».`,
      )
      return
    }

    setError('')
    setBusyAction('add')

    try {
      // Цена для клиента: закупка + наценка. Пока в каталоге запчастей
      // не ведутся закупочные цены — работаем в легаси-режиме, фиксируя
      // розничную цену как клиентскую (priceAtTime).
      const { order } = await addOrderPart(orderId, {
        partId: selectedPart.id,
        quantity: qty,
        purchasePrice: null,
        markup: null,
        priceAtTime: selectedPart.retailPrice,
      })

      await refreshBoundParts()
      setSelectedPartId('')
      setQuantity(1)
      notifyPriceChange(order)
    } catch (err) {
      console.error('Не удалось добавить деталь:', err)
      setError(
        `Не удалось добавить деталь: ${err.message ?? 'попробуйте ещё раз.'}`,
      )
    } finally {
      setBusyAction(null)
    }
  }

  async function handleRemovePart(item) {
    if (!canManage || isBusy) {
      return
    }

    setError('')
    setBusyAction(item.id)

    try {
      const { order } = await removePartFromOrder(item.id, orderId)

      await refreshBoundParts()
      notifyPriceChange(order)
    } catch (err) {
      console.error('Не удалось убрать деталь:', err)
      setError(
        `Не удалось убрать деталь: ${err.message ?? 'попробуйте ещё раз.'}`,
      )
    } finally {
      setBusyAction(null)
    }
  }

  return (
    <div className="order-parts">
      <h3 className="order-parts__title">Запчасти по заказу</h3>

      {loading ? (
        <p className="order-parts__empty">Загрузка деталей...</p>
      ) : (
        <>
          {error ? (
            <p className="order-parts__error" role="alert">
              {error}
            </p>
          ) : null}

          {boundParts.length === 0 ? (
            <p className="order-parts__empty">
              На этот заказ пока не списано ни одной детали.
            </p>
          ) : (
            <div className="order-parts__table">
              <div className="order-parts__row order-parts__row--head">
                <span>Название</span>
                <span>Кол-во</span>
                <span>Цена за шт.</span>
                <span>Сумма</span>
                <span aria-hidden="true" />
              </div>

              {boundParts.map((item) => (
                <div key={item.id} className="order-parts__row">
                  <span className="order-parts__name">
                    {item.partName} ({item.partSku})
                  </span>
                  <span>{item.quantity}</span>
                  <span>{formatPrice(item.priceAtTime)}</span>
                  <span className="order-parts__sum">
                    {formatPrice(item.sum)}
                  </span>
                  <button
                    type="button"
                    className="order-parts__remove"
                    onClick={() => handleRemovePart(item)}
                    disabled={!canManage || isBusy}
                  >
                    Убрать
                  </button>
                </div>
              ))}
            </div>
          )}

          {canManage ? (
            <form className="order-parts__form" onSubmit={handleAddPart}>
              <select
                className="order-parts__select"
                value={selectedPartId}
                onChange={(event) => {
                  setSelectedPartId(event.target.value)
                  setError('')
                  setQuantity(1)
                }}
                disabled={isBusy}
              >
                <option value="">Выберите деталь со склада...</option>
                {warehouseParts.map((part) => {
                  const available = getAvailable(part)

                  return (
                    <option
                      key={part.id}
                      value={part.id}
                      disabled={available <= 0}
                    >
                      {part.name} ({part.sku}) — остаток {available} шт.
                    </option>
                  )
                })}
              </select>

              <input
                className="order-parts__qty"
                type="number"
                min="1"
                max={selectedAvailable || 1}
                value={quantity}
                onChange={(event) => setQuantity(event.target.value)}
                disabled={isBusy || !selectedPart}
                aria-label="Количество"
              />

              <button
                type="submit"
                className="order-parts__add"
                disabled={isBusy || !selectedPart || selectedAvailable < 1}
              >
                {busyAction === 'add' ? 'Списание...' : 'Добавить'}
              </button>
            </form>
          ) : (
            <p className="order-parts__hint">
              Добавление и удаление деталей доступно только пользователям с
              правом «inventory.manage» (или администраторам).
            </p>
          )}

          {selectedPart && canManage ? (
            <p className="order-parts__hint">
              Доступно к списанию: {selectedAvailable} шт. (склад:{' '}
              {selectedPart.totalStock}, уже на заказе:{' '}
              {selectedPart.totalStock - selectedAvailable}).
            </p>
          ) : null}
        </>
      )}
    </div>
  )
}

export default OrderPartsManager

