const dateFormatter = new Intl.DateTimeFormat('ru-RU', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
})

// Единая точка форматирования денежных сумм CRM — валюта BYN.
// Формат: 1 250,00 BYN (ru-RU числа, два знака после запятой).
const priceFormatter = new Intl.NumberFormat('ru-RU', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

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

  return `${priceFormatter.format(value)} BYN`
}

// Денежные суммы (кассы, счета, платежи): тот же формат BYN, что и formatPrice.
export function formatCurrency(value) {
  return formatPrice(value)
}

const dateTimeFormatter = new Intl.DateTimeFormat('ru-RU', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
})

export function formatDateTime(dateString) {
  if (!dateString) {
    return '—'
  }

  const date = dateString instanceof Date ? dateString : new Date(dateString)

  if (Number.isNaN(date.getTime())) {
    return '—'
  }

  return dateTimeFormatter.format(date)
}