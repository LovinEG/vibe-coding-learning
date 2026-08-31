import './OrderItem.css'

function OrderItem({ orderNumber, client, device, status, price }) {
  return (
    <li className="order-item">
      <span className="order-item__number">{orderNumber}</span>
      <span className="order-item__client">{client}</span>
      <span className="order-item__device">{device}</span>
      <span className="order-item__status">{status}</span>
      <span className="order-item__price">{price}</span>
    </li>
  )
}

export default OrderItem
