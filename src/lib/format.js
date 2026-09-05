const dateFormatter = new Intl.DateTimeFormat('ru-RU', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
})

const priceFormatter = new Intl.NumberFormat('ru-RU')

export function formatDate(dateString) {
  if (!dateString) {
    return '—'
  }

  const date = dateString instanceof Date ? dateString : new Date(dateString)

  if (Number.isNaN(date.getTime())) {
    return '—'
  }

  return dateFormatter.format(date)
}

export function formatPrice(price) {
  if (price === null || price === undefined || price === '') {
    return '—'
  }

  const value = Number(price)

  if (!Number.isFinite(value)) {
    return '—'
  }

  return `${priceFormatter.format(value)} ₽`
}