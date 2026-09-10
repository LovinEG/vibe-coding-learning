import Button from '../ui/Button'
import './CloseOrderModal.css'

// Модалка-заглушка действия «Оплатить и закрыть» на странице заказа.
// Пока ничего не проводит в кассу и не меняет статус заказа —
// заготовка под будущую логику оплаты и закрытия.
function CloseOrderModal({ onClose }) {
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

        <p className="close-order-modal__text">
          Следующим шагом здесь будет проведение оплаты и закрытие заказа
        </p>

        <div className="close-order-modal__actions">
          <Button onClick={onClose}>Понятно</Button>
        </div>
      </div>
    </div>
  )
}

export default CloseOrderModal