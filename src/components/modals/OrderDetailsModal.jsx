import { useNavigate } from 'react-router-dom'
import OrderPartsManager from '../OrderPartsManager'
import Button from '../ui/Button'
import { formatDate, formatPrice } from '../../lib/format'
import './OrderDetailsModal.css'

// Модальное окно детализации заказа: сводка + управление запчастями.
function OrderDetailsModal({ open, order, onClose, onPriceChange }) {
  const navigate = useNavigate()

  if (!open || !order) {
    return null
  }

  function handlePriceChange(newPrice) {
    if (typeof onPriceChange === 'function') {
      onPriceChange(order.id, newPrice)
    }
  }

  return (
    <div className="order-details-overlay" onClick={onClose}>
      <div
        className="order-details-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="order-details-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="order-details-modal__head">
          <h2 id="order-details-title" className="order-details-modal__title">
            Заказ {order.orderNumber}
          </h2>
          <div className="order-details-modal__head-actions">
            <Button
              className="order-details-modal__open-card"
              onClick={() => navigate(`/orders/${order.id}`)}
            >
              Открыть полную карточку
            </Button>
            <button
              type="button"
              className="order-details-modal__close"
              onClick={onClose}
              aria-label="Закрыть"
            >
              ×
            </button>
          </div>
        </div>

        <dl className="order-details-modal__summary">
          <div>
            <dt>Клиент</dt>
            <dd>{order.client ?? '—'}</dd>
          </div>
          <div>
            <dt>Телефон</dt>
            <dd>{order.clientPhone ?? '—'}</dd>
          </div>
          <div>
            <dt>Устройство</dt>
            <dd>{order.device ?? '—'}</dd>
          </div>
          <div>
            <dt>Принят</dt>
            <dd>{formatDate(order.acceptedAt)}</dd>
          </div>
          <div>
            <dt>Статус</dt>
            <dd>{order.status}</dd>
          </div>
          <div>
            <dt>Итоговая стоимость</dt>
            <dd className="order-details-modal__price">
              {formatPrice(order.price)}
            </dd>
          </div>
          <div>
            <dt>Неисправность</dt>
            <dd>{order.defect ?? '—'}</dd>
          </div>
        </dl>

        <OrderPartsManager
          orderId={order.id}
          onPriceChange={handlePriceChange}
        />
      </div>
    </div>
  )
}

export default OrderDetailsModal