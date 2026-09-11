import {
  getOrders,
  OVERDUE_ORDER_STATUSES,
  getOrderDeadline,
} from './orders'
import { getParts } from './inventory'
import { getCashRegisters } from './cashRegisters'
import { getPayments } from './payments'
import { getTasks } from './tasks'
import { getOpenShift } from './shifts'
import { getStockBatches } from './stockBatches'
import { supabase } from '../lib/supabase'

// Срок ремонта по умолчанию (fallback) живёт в orders.js
// (OVERDUE_SLA_DAYS = 4 внутри getOrderDeadline).

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

const ACTIVE_STATUSES = ['Новый', 'Диагностика', 'В работе', 'Ожидает деталь', 'Готово к выдаче']

// Просрочка SLA — по тому же списку, что и в разделе «Заказы»
// (OVERDUE_ORDER_STATUSES: без «Готово к выдаче» и завершённых статусов).
const OVERDUE_STATUSES = OVERDUE_ORDER_STATUSES

function isActiveOrder(order) {
  return ACTIVE_STATUSES.includes(order.status)
}

// Единая логика дедлайна/просрочки из orders.js: deadline_at либо
// fallback SLA 4 дня. Дедлайн заданный учитывается.
function isOverdueOrder(order, now) {
  if (!OVERDUE_STATUSES.includes(order.status)) {
    return false
  }

  const deadline = getOrderDeadline(order)

  return deadline !== null && deadline < now
}

// Единый агрегатор данных для командного дашборда. Все источники читаются
// параллельно; на их основе считаются метрики, алерты, склад и финансы.
export async function getDashboardSummary() {
  const now = new Date()

  // Текущий пользователь — для чтения своей открытой смены из shifts.
  const { data: userData } = await supabase.auth.getUser()
  const currentUserId = userData?.user?.id ?? null

  const [orders, parts, cashRegisters, payments, tasks, batches, openShift] =
    await Promise.all([
      getOrders(),
      getParts(),
      getCashRegisters(),
      getPayments(),
      getTasks(),
      getStockBatches(),
      // Смена читается из public.shifts. Пока миграция не применена
      // (таблицы нет) — деградируем до «смены нет», CRM не падает.
      getOpenShift(currentUserId).catch((err) => {
        console.warn('Не удалось загрузить открытую смену:', err.message)
        return null
      }),
    ])

  // ---------------- Оперативные показатели ----------------
  const activeOrders = orders.filter(isActiveOrder)
  const overdueOrders = orders.filter((order) => isOverdueOrder(order, now))
  const acceptedToday = orders.filter(
    (order) => order.acceptedAt && isSameDay(new Date(order.acceptedAt), now),
  )
  // «Требуют согласования» — по факту отправки сметы клиенту (approval_status),
  // а не по статусу «Новый».
  const awaitingApproval = orders.filter(
    (order) => order.approvalStatus === 'pending',
  )
  const awaitingParts = orders.filter((order) => order.status === 'Ожидает деталь')

  // Карточки менеджера приёмки: «Новые» и «Готовы к выдаче».
  const newOrders = orders.filter((order) => order.status === 'Новый')
  const readyForPickup = orders.filter((order) => order.status === 'Готово к выдаче')

  const incomePayments = payments.filter((payment) => payment.type === 'income')

  // «Закрыто сегодня» — по orders.closed_at (пишет RPC close_order).
  // Легаси-«Выдан» (closed_at = null) сюда не попадает.
  const closedToday = orders.filter(
    (order) =>
      order.closedAt && isSameDay(new Date(order.closedAt), now),
  ).length

  // Статус смены и интервал выручки — из public.shifts (создаётся RPC
  // open_shift / close_shift). Легаси-маркеры cash_operations больше
  // не читаются.
  const shift = {
    isOpen: Boolean(openShift),
    shiftId: openShift?.id ?? null,
    cashRegisterId: openShift?.cashRegisterId ?? null,
    openedAt: openShift?.openedAt ?? null,
    operator: null,
  }

  // Выручка текущей смены — реальные оплаты заказов (income-платежи
  // с orderId) с момента opened_at смены. Прочие income без orderId,
  // кассовые операции и корректировки смен в выручку не входят.
  const shiftOpenedAt = openShift ? new Date(openShift.openedAt) : null

  const shiftOrderPayments =
    shiftOpenedAt === null
      ? []
      : incomePayments.filter(
          (payment) =>
            payment.orderId &&
            new Date(payment.createdAt) >= shiftOpenedAt &&
            new Date(payment.createdAt) <= now,
        )

  const shiftRevenue = shiftOrderPayments.reduce(
    (sum, payment) => sum + payment.amount,
    0,
  )
  // «Деньги в кассах» — только активные кассы (согласовано с /cash-registers).
  const cashTotal = cashRegisters
    .filter((register) => register.isActive)
    .reduce((sum, register) => sum + register.balance, 0)

  return {
    generatedAt: now.toISOString(),
    metrics: {
      activeOrders: activeOrders.length,
      overdueOrders: overdueOrders.length,
      acceptedToday: acceptedToday.length,
      closedToday,
      awaitingApproval: awaitingApproval.length,
      awaitingParts: awaitingParts.length,
      newOrders: newOrders.length,
      readyForPickup: readyForPickup.length,
      shiftRevenue,
      cashTotal,
    },
    shift: {
      isOpen: shift.isOpen,
      shiftId: shift.shiftId,
      cashRegisterId: shift.cashRegisterId,
      openedAt: shift.openedAt,
      operator: shift.operator,
    },
    orders: {
      // Полный список — для финансового агрегатора (дебиторка считает
      // по «Готово к выдаче» и «Закрыт», которые не входят в active).
      all: orders,
      active: activeOrders,
      overdue: overdueOrders,
      awaitingParts,
      awaitingApproval,
    },
    payments: {
      income: incomePayments,
      shift: shiftOrderPayments,
    },
    parts,
    batches,
    tasks,
    cashRegisters,
  }
}

// Финансовые итоги: выручка день/неделя/месяц, нал/безнал за сегодня,
// дебиторка. Выручкой считаются только income-платежи, привязанные к
// заказу (order_id); ручные приходы без заказа выручку не завышают.
// Дебиторка — заказы «Готово к выдаче» и «Закрыт» с непокрытой платежами
// стоимостью (легаси-«Выдан» не используется).
export function buildFinanceSummary(incomePayments, orders, now) {
  const todayStart = startOfDay(now)
  const weekStart = startOfWeek(now)
  const monthStart = startOfMonth(now)

  // Выручка — только income-платежи по заказам.
  const orderIncomePayments = incomePayments.filter((payment) => payment.orderId)

  const sumWhere = (predicate) =>
    orderIncomePayments
      .filter((payment) => predicate(new Date(payment.createdAt)))
      .reduce((sum, payment) => sum + payment.amount, 0)

  const revenueToday = sumWhere((date) => date >= todayStart)
  const revenueWeek = sumWhere((date) => date >= weekStart)
  const revenueMonth = sumWhere((date) => date >= monthStart)

  const todayOrderPayments = orderIncomePayments.filter(
    (payment) => new Date(payment.createdAt) >= todayStart,
  )
  const cashToday = todayOrderPayments
    .filter((payment) => payment.paymentMethod === 'cash')
    .reduce((sum, payment) => sum + payment.amount, 0)
  const cashlessToday = todayOrderPayments
    .filter((payment) => payment.paymentMethod !== 'cash')
    .reduce((sum, payment) => sum + payment.amount, 0)

  // Дебиторка: по каждому заказу «Готово к выдаче» / «Закрыт» цена минус
  // приходные платежи, привязанные к этому заказу (order_id в payments);
  // учитывается только положительный остаток.
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

  const receivableStatuses = ['Готово к выдаче', 'Закрыт']

  const receivableOrders = orders
    .filter((order) => receivableStatuses.includes(order.status))
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

// Блок «Требуют внимания» менеджера приёмки: активные заказы в
// приоритетном порядке, каждый заказ показывается ОДИН раз по самому
// высокому приоритету:
//   1) просрочен (SLA 4 дня, OVERDUE_ORDER_STATUSES),
//   2) ожидает согласования клиента,
//   3) срок сегодня (accepted_at + SLA, deadline в схеме отсутствует),
//   4) готов к выдаче,
//   5) новый.
// Максимум 8 строк. Reuses isOverdueOrder/REPAIR_SLA_DAYS — логика
// просрочки не дублируется.
export function buildManagerAttentionOrders(activeOrders, now = new Date()) {
  const taken = new Set()
  const rows = []

  const addGroup = (orders, reason) => {
    for (const order of orders) {
      if (taken.has(order.id)) {
        continue
      }

      taken.add(order.id)
      rows.push({ order, reason })
    }
  }

  addGroup(
    activeOrders.filter((order) => isOverdueOrder(order, now)),
    '⏰ Просрочен ремонт (SLA 4 дня)',
  )

  addGroup(
    activeOrders.filter((order) => order.approvalStatus === 'pending'),
    '📤 Ожидает согласования клиента',
  )

  addGroup(
    activeOrders.filter((order) => {
      // Дедлайн: deadline_at либо fallback SLA — getOrderDeadline из
      // orders.js (бизнес-логика дедлайна не дублируется).
      const deadline = getOrderDeadline(order)

      if (deadline === null) {
        return false
      }

      return deadline >= startOfDay(now) && deadline < addDays(startOfDay(now), 1)
    }),
    '📅 Срок сегодня',
  )

  addGroup(
    activeOrders.filter((order) => order.status === 'Готово к выдаче'),
    '✅ Готов к выдаче',
  )

  addGroup(
    activeOrders.filter((order) => order.status === 'Новый'),
    '🆕 Новый — начать диагностику',
  )

  return rows.slice(0, 8)
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

