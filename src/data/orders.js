export const orders = [
  {
    orderNumber: '#1042',
    client: 'Иван Петров',
    device: 'iPhone 13',
    status: 'В работе',
    price: '3 500 ₽',
  },
  {
    orderNumber: '#1038',
    client: 'Анна Смирнова',
    device: 'Samsung S22',
    status: 'Ожидает деталь',
    price: '5 200 ₽',
  },
  {
    orderNumber: '#1035',
    client: 'Олег Кузнецов',
    device: 'MacBook Air',
    status: 'Готово к выдаче',
    price: '8 900 ₽',
  },
]

export async function getOrders() {
  return orders
}
