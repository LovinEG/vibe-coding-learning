import {
  getOrders,
} from './orders'
import { getParts } from './inventory'
import { getCashRegisters } from './cashRegisters'
import { getPayments } from './payments'
import { getTasks } from './tasks'
import { getCashOperations } from './cashOperations'
import { getStockBatches } from './stockBatches'

// Срок ремонта по умолчанию: в схеме orders нет поля deadline, поэтому
// просрочка и расчётный срок считаются от даты приёма (7 календарных дней).
const REPAIR_SLA_DAYS = 7

function startOfDay(date) {
  const copy = new Date(date)
  copy.setHours(0, 0, 0, 0)
  return copy
}

function startOfWeek(date) {
  const copy = startOfDay(date)
  const day = (copy.getDay() + 6) % 7 // Пн = 0 ... Вс = 6
  copy.setDate(copy.getDate() - day)
  return copy
}

function startOfMonth(date) {
  const copy = startOfDay(date)
  copy.setDate(1)
  return copy
}

function addDays(date, days) {
  const copy = new Date(date)
  copy.setDate(copy.getDate() + days)
  return copy
}

function isSameDay(a, b) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  )
}

const ACTIVE_STATUSES = ['Новый', 'В работе', 'Ожидает деталь', 'Готово к выдаче']

function isActiveOrder(order) {
  return ACTIVE_STATUSES.includes(order.status)
}

function isOverdueOrder(order, now) {
  if (!isActiveOrder(order) || !order.acceptedAt) {
    return false
  }

  const slaDeadline = addDays(new Date(order.acceptedAt), REPAIR_SLA_DAYS)
  return slaDeadline < now
}

// Единый агрегатор данных для командного дашборда. Все источники читаются
// параллельно; на их основе считаются метрики, алерты, склад и финансы.
export async function getDashboardSummary() {
  const now = new Date()

  const [orders, parts, cashRegisters, payments, tasks, cashOperations, batches] =
    await Promise.all([
      getOrders(),
      getParts(),
      getCashRegisters(),
      getPayments(),
      getTasks(),
      getCashOperations(),
      getStockBatches(),
    ])

  // ---------------- Оперативные показатели ----------------
  const activeOrders = orders.filter(isActiveOrder)
  const overdueOrders = orders.filter((order) => isOverdueOrder(order, now))
  const acceptedToday = orders.filter(
    (order) => order.acceptedAt && isSameDay(new Date(order.acceptedAt), now),
  )
  const awaitingApproval = orders.filter((order) => order.status === 'Новый')
  const awaitingParts = orders.filter((order) => order.status === 'Ожидает деталь')

  const incomePayments = payments.filter((payment) => payment.type === 'income')

  // «Выданные сегодня» — заказы, за которые сегодня пришёл income-платёж
  // (в orders нет даты выдачи, оплата — надёжный прокси).
  const issuedTodayOrderIds = new Set(
    incomePayments
      .filter((payment) => payment.orderId && isSameDay(new Date(payment.createdAt), now))
      .map((payment) => payment.orderId),
  )

  const shiftPayments = incomePayments.filter((payment) =>
    isSameDay(new Date(payment.createdAt), now),
  )
  const shiftRevenue = shiftPayments.reduce((sum, payment) => sum + payment.amount, 0)
  const cashTotal = cashRegisters.reduce((sum, register) => sum + register.balance, 0)

  // Статус смены: первая кассовая операция за сегодня.
  const todayOperations = cashOperations
    .filter((operation) => isSameDay(new Date(operation.createdAt), now))
    .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt))
  const shiftOpenOperation = todayOperations[0] ?? null

  return {
    generatedAt: now.toISOString(),
    metrics: {
      activeOrders: activeOrders.length,
      overdueOrders: overdueOrders.length,
      acceptedToday: acceptedToday.length,
      issuedToday: issuedTodayOrderIds.size,
      awaitingApproval: awaitingApproval.length,
      awaitingParts: awaitingParts.length,
      shiftRevenue,
      cashTotal,
    },
    shift: {
      isOpen: shiftOpenOperation !== null,
      openedAt: shiftOpenOperation?.createdAt ?? null,
      operator: shiftOpenOperation?.createdByName ?? null,
    },
    orders: {
      active: activeOrders,
      overdue: overdueOrders,
      awaitingParts,
      awaitingApproval,
    },
    payments: {
      income: incomePayments,
      shift: shiftPayments,
    },
    parts,
    batches,
    tasks,
    cashRegisters,
  }
}

// Финансовые итоги: выручка день/неделя/месяц, нал/безнал за сегодня,
// дебиторка (выданные заказы, не покрытые приходными платежами).
export function buildFinanceSummary(incomePayments, orders, now) {
  const todayStart = startOfDay(now)
  const weekStart = startOfWeek(now)
  const monthStart = startOfMonth(now)

  const sumWhere = (predicate) =>
    incomePayments
      .filter((payment) => predicate(new Date(payment.createdAt)))
      .reduce((sum, payment) => sum + payment.amount, 0)

  const revenueToday = sumWhere((date) => date >= todayStart)
  const revenueWeek = sumWhere((date) => date >= weekStart)
  const revenueMonth = sumWhere((date) => date >= monthStart)

  const shiftPayments = incomePayments.filter(
    (payment) => new Date(payment.createdAt) >= todayStart,
  )
  const cashToday = shiftPayments
    .filter((payment) => payment.paymentMethod === 'cash')
    .reduce((sum, payment) => sum + payment.amount, 0)
  const cashlessToday = shiftPayments
    .filter((payment) => payment.paymentMethod !== 'cash')
    .reduce((sum, payment) => sum + payment.amount, 0)

  // Дебиторка: по каждому выданному заказу цена минус приходные платежи,
  // привязанные к этому заказу (order_id в payments).
  const paidByOrder = new Map()
  for (const payment of incomePayments) {
    if (!payment.orderId) {
      continue
    }
    paidByOrder.set(
      payment.orderId,
      (paidByOrder.get(payment.orderId) ?? 0) + payment.amount,
    )
  }

  const receivableOrders = orders
    .filter((order) => order.status === 'Выдан')
    .map((order) => {
      const paid = paidByOrder.get(order.id) ?? 0
      const total = Number(order.price) || 0
      return {
        id: order.id,
        orderNumber: order.orderNumber,
        client: order.client,
        total,
        paid,
        due: Math.max(0, total - paid),
      }
    })
    .filter((order) => order.due > 0)

  return {
    revenueToday,
    revenueWeek,
    revenueMonth,
    cashToday,
    cashlessToday,
    receivables: receivableOrders.reduce((sum, order) => sum + order.due, 0),
    receivableOrders,
  }
}

// Важные задачи (Action Items): алерты, требующие реакции сотрудника,
// с прямыми ссылками в соответствующие разделы CRM.
export function buildActionItems({
  orders,
  parts,
  batches,
  tasks,
  now,
}) {
  const items = []

  // 1. Ожидается решение клиента — смета отправлена (approval_status = pending).
  for (const order of orders
    .filter((o) => o.approvalStatus === 'pending')
    .slice(0, 2)) {
    items.push({
      id: `approval-${order.id}`,
      icon: '📤',
      title: 'Ожидается согласование клиента',
      description: `Заказ ${order.orderNumber} · ${order.client} · смета отправлена`,
      to: '/orders?approval=pending',
      actionLabel: 'Открыть',
    })
  }

  // 2. Клиенту нужно позвонить — заказы, готовые к выдаче.
  for (const order of orders.filter((o) => o.status === 'Готово к выдаче').slice(0, 3)) {
    items.push({
      id: `ready-${order.id}`,
      icon: '📞',
      title: 'Клиенту нужно позвонить',
      description: `Заказ ${order.orderNumber} · ${order.client} · ${order.device}`,
      to: '/orders?status=ready',
      actionLabel: 'Открыть',
    })
  }

  // 2. Просрочен ремонт — активные заказы старше SLA.
  for (const order of orders
    .filter((o) => isOverdueOrder(o, now))
    .slice(0, 3)) {
    items.push({
      id: `overdue-${order.id}`,
      icon: '⏰',
      title: 'Просрочен ремонт',
      description: `Заказ ${order.orderNumber} · ${order.client} · принят ${formatDay(order.acceptedAt)}`,
      to: '/orders?overdue=true',
      actionLabel: 'Открыть',
    })
  }

  // 3. Отсутствуют на складе — нулевые остатки.
  for (const part of parts.filter((p) => p.totalStock === 0).slice(0, 3)) {
    items.push({
      id: `out-${part.id}`,
      icon: '🔴',
      title: 'Нет на складе',
      description: `${part.name} (${part.sku}) — остаток 0`,
      to: '/inventory',
      actionLabel: 'К складу',
    })
  }

  // 4. Низкий остаток — не больше порога, но ещё не ноль.
  for (const part of parts
    .filter((p) => p.minStock > 0 && p.totalStock > 0 && p.totalStock <= p.minStock)
    .slice(0, 3)) {
    items.push({
      id: `low-${part.id}`,
      icon: '⚠️',
      title: 'Низкий остаток на складе',
      description: `${part.name} (${part.sku}) — ${part.totalStock} из ${part.minStock}`,
      to: '/inventory',
      actionLabel: 'К складу',
    })
  }

  // 5. Пришла деталь — партии поставки, принятые сегодня.
  for (const batch of batches
    .filter((b) => isSameDay(new Date(b.createdAt), now))
    .slice(0, 2)) {
    items.push({
      id: `batch-${batch.id}`,
      icon: '📦',
      title: 'Пришла деталь',
      description: `${batch.partName} × ${batch.quantity} · ${batch.supplierName ?? 'поставщик не указан'}`,
      to: '/stock-batches',
      actionLabel: 'Проверить',
    })
  }

  // 6. Просроченные задачи из раздела «Задачи».
  for (const task of tasks
    .filter(
      (t) => t.status !== 'done' && t.dueDate && new Date(t.dueDate) < now,
    )
    .slice(0, 2)) {
    items.push({
      id: `task-${task.id}`,
      icon: '🗓️',
      title: 'Просрочена задача',
      description: `${task.title} · ${task.assigneeName ?? 'исполнитель не назначен'}`,
      to: '/tasks',
      actionLabel: 'Открыть',
    })
  }

  return items.slice(0, 8)
}

function formatDay(value) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return '—'
  }
  return date.toLocaleDateString('ru-RU')
}

// Складские предупреждения: заканчиваются (0 < остаток <= порог),
// отсутствуют (остаток 0), ожидаются поставки (заказы «Ожидает деталь»).
export function buildStockWarnings(parts, awaitingPartOrders, batches, now) {
  const lowStock = parts
    .filter((part) => part.minStock > 0 && part.totalStock > 0 && part.totalStock <= part.minStock)
    .map((part) => ({
      id: part.id,
      name: part.name,
      sku: part.sku,
      totalStock: part.totalStock,
      minStock: part.minStock,
    }))

  const outOfStock = parts
    .filter((part) => part.totalStock === 0)
    .map((part) => ({ id: part.id, name: part.name, sku: part.sku }))

  const expectedDeliveries = awaitingPartOrders.map((order) => ({
    id: order.id,
    orderNumber: order.orderNumber,
    client: order.client,
    device: order.device,
  }))

  const lastDeliveries = batches
    .filter((batch) => isSameDay(new Date(batch.createdAt), now))
    .map((batch) => ({
      id: batch.id,
      partName: batch.partName,
      supplierName: batch.supplierName,
      quantity: batch.quantity,
      createdAt: batch.createdAt,
    }))

  return { lowStock, outOfStock, expectedDeliveries, lastDeliveries }
}

