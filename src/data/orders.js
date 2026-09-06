import { supabase } from '../lib/supabase'

// id текущего пользователя — он же profiles.id (1:1 с auth.users).
// Используется как автор событий в order_status_history по умолчанию.
async function getCurrentProfileId() {
  const { data, error } = await supabase.auth.getUser()

  if (error) {
    throw error
  }

  return data?.user?.id ?? null
}

const ORDER_SELECT = '*, clients(*), devices(*)'

// Детальная выборка заказа: приёмка/диагностика (колонки ШАГ 3.1),
// список деталей с ценообразованием (закупка + наценка) и автором,
// а также хронология событий с профилем автора.
// Внимание: у order_parts два FK на profiles (master_id и added_by) —
// PostgREST требует дизамбигуацию через !added_by.
const ORDER_DETAILS_SELECT =
  '*, clients(*), devices(*), ' +
  'order_parts(*, parts(id, sku, name, category), added_by_profile:profiles!added_by(full_name)), ' +
  'order_status_history(*, profiles(full_name, avatar_url))'

function mapOrder(row) {
  return {
    id: row.id,
    orderNumber: row.order_number,
    client: row.clients?.name || row.client,
    device: row.devices
      ? `${row.devices.brand || ''} ${row.devices.model || ''}`.trim()
      : row.device,
    status: row.status,
    price: row.price,
    defect: row.defect,
    acceptedAt: row.accepted_at,
    clientPhone: row.clients?.phone || null,
    clientId: row.client_id,
    deviceId: row.device_id,
    // Приёмка устройства и диагностика (ШАГ 3.1).
    appearance: row.appearance ?? null,
    equipment: row.equipment ?? null,
    deviceCondition: row.device_condition ?? null,
    intakePhotos: Array.isArray(row.intake_photos) ? row.intake_photos : [],
    diagnosticPhotos: Array.isArray(row.diagnostic_photos)
      ? row.diagnostic_photos
      : [],
    diagnosticResult: row.diagnostic_result ?? null,
    approvalStatus: row.approval_status ?? 'not_required',
    approvalComment: row.approval_comment ?? null,
  }
}

// Строка order_parts: точное ценообразование (закупка + наценка = цена
// клиента), автор добавления и совместимые поля price_at_time / sum.
export function mapOrderPart(row) {
  const toNumber = (value) =>
    value === null || value === undefined ? null : Number(value)

  const clientPrice = toNumber(row.client_price)

  return {
    id: row.id,
    orderId: row.order_id,
    partId: row.part_id,
    partName: row.parts?.name ?? '—',
    partSku: row.parts?.sku ?? '—',
    category: row.parts?.category ?? null,
    quantity: row.quantity,
    priceAtTime: toNumber(row.price_at_time),
    purchasePrice: toNumber(row.purchase_price),
    markup: toNumber(row.markup),
    clientPrice,
    addedBy: row.added_by ?? row.master_id ?? null,
    addedByName: row.added_by_profile?.full_name ?? null,
    sum: (clientPrice ?? toNumber(row.price_at_time) ?? 0) * Number(row.quantity ?? 0),
    createdAt: row.created_at,
  }
}

function mapHistoryRow(row) {
  return {
    id: row.id,
    orderId: row.order_id,
    status: row.status,
    title: row.title ?? null,
    comment: row.comment ?? null,
    createdBy: row.created_by ?? null,
    authorName: row.profiles?.full_name ?? null,
    authorAvatar: row.profiles?.avatar_url ?? null,
    createdAt: row.created_at,
  }
}

// Список заказов для таблицы раздела «Заказы» и дашборда.
export async function getOrders() {
  const { data, error } = await supabase.from('orders').select(ORDER_SELECT)

  if (error) {
    throw error
  }

  return (data ?? []).map(mapOrder)
}


// ---------------------------------------------------------------------
// Хронология событий заказа (order_status_history)
// ---------------------------------------------------------------------

// Журналирование события в истории заказа. createdBy не передан —
// автором становится текущий пользователь сессии.
export async function logOrderEvent({ orderId, status, title, comment, createdBy } = {}) {
  if (!orderId || !status) {
    throw new Error('logOrderEvent: требуются orderId и status')
  }

  const profileId = createdBy ?? (await getCurrentProfileId())

  const { data, error } = await supabase
    .from('order_status_history')
    .insert({
      order_id: orderId,
      status,
      title: title ?? null,
      comment: comment ?? null,
      created_by: profileId,
    })
    .select()
    .single()

  if (error) {
    throw error
  }

  return data
}

// История заказа, свежие события сверху, с ФИО и аватаром автора.
export async function getOrderHistory(orderId) {
  const { data, error } = await supabase
    .from('order_status_history')
    .select('*, profiles(full_name, avatar_url)')
    .eq('order_id', orderId)
    .order('created_at', { ascending: false })

  if (error) {
    throw error
  }

  return (data ?? []).map(mapHistoryRow)
}

// ---------------------------------------------------------------------
// Детальная карточка заказа
// ---------------------------------------------------------------------

// Заказ с деталями приёмки, ценообразованием запчастей и историей событий.
export async function getOrderById(id) {
  const { data, error } = await supabase
    .from('orders')
    .select(ORDER_DETAILS_SELECT)
    .eq('id', id)
    .single()

  if (error) {
    throw error
  }

  const parts = (data.order_parts ?? []).map(mapOrderPart)

  // Вложенная выборка не поддерживает order() — сортируем на клиенте.
  const history = (data.order_status_history ?? [])
    .map(mapHistoryRow)
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))

  return {
    ...mapOrder(data),
    parts,
    history,
  }
}

// ---------------------------------------------------------------------
// Диагностика и согласование
// ---------------------------------------------------------------------

// Сохранение результата диагностики + событие 'diagnosed' в истории.
export async function updateOrderDiagnostic(
  orderId,
  { diagnosticResult, diagnosticPhotos, masterId } = {},
) {
  const { data, error } = await supabase
    .from('orders')
    .update({
      diagnostic_result: diagnosticResult ?? null,
      diagnostic_photos: Array.isArray(diagnosticPhotos) ? diagnosticPhotos : [],
    })
    .eq('id', orderId)
    .select()
    .single()

  if (error) {
    throw error
  }

  await logOrderEvent({
    orderId,
    status: 'diagnosed',
    title: 'Проведена диагностика',
    comment: diagnosticResult ?? null,
    createdBy: masterId ?? null,
  })

  return mapOrder(data)
}

// Маппинг статуса согласования → событие в хронологии.
const APPROVAL_EVENT_MAP = {
  pending: { status: 'approval_sent', title: 'Смета отправлена на согласование' },
  approved: { status: 'approved', title: 'Клиент согласовал ремонт' },
  rejected: { status: 'rejected', title: 'Клиент отказался от ремонта' },
}

// Согласование ремонта с клиентом: pending / approved / rejected.
export async function updateOrderApproval(orderId, { status, comment, updatedBy } = {}) {
  const event = APPROVAL_EVENT_MAP[status]

  if (!event) {
    throw new Error(`Недопустимый статус согласования: ${status}`)
  }

  const { data, error } = await supabase
    .from('orders')
    .update({
      approval_status: status,
      approval_comment: comment ?? null,
    })
    .eq('id', orderId)
    .select()
    .single()

  if (error) {
    throw error
  }

  await logOrderEvent({
    orderId,
    status: event.status,
    title: event.title,
    comment: comment ?? null,
    createdBy: updatedBy ?? null,
  })

  return mapOrder(data)
}

// Создание заказа (единая последовательность из трёх INSERT:
// клиент → устройство → заказ) с фиксацией данных приёмки.
export async function createOrder(orderData) {
  // 1. Создаём клиента
  const { data: clientData, error: clientError } = await supabase
    .from('clients')
    .insert({
      name: orderData.client,
      phone: orderData.clientPhone || '',
    })
    .select()
    .single()

  if (clientError) {
    throw clientError
  }

  // 2. Создаём устройство клиента
  const { data: deviceData, error: deviceError } = await supabase
    .from('devices')
    .insert({
      client_id: clientData.id,
      brand: orderData.brand || 'Не указано',
      model: orderData.device,
      serial_number: orderData.serialNumber || null,
    })
    .select()
    .single()

  if (deviceError) {
    throw deviceError
  }

  // 3. Создаём заказ
  const { data: createdOrder, error: orderError } = await supabase
    .from('orders')
    .insert({
      order_number: orderData.orderNumber,
      client_id: clientData.id,
      device_id: deviceData.id,
      // для совместимости дублируем текстовые поля
      client: orderData.client,
      device: orderData.device,
      status: orderData.status,
      price: orderData.price,
      defect: orderData.defect,
      accepted_at: orderData.acceptedAt,
      // Приёмка устройства (ШАГ 3.1). intake_photos — jsonb not null,
      // поэтому null запрещён: передаём пустой массив.
      appearance: orderData.appearance ?? null,
      equipment: orderData.equipment ?? null,
      device_condition: orderData.deviceCondition ?? null,
      intake_photos: Array.isArray(orderData.intakePhotos)
        ? orderData.intakePhotos
        : [],
    })
    .select()
    .single()

  if (orderError) {
    throw orderError
  }

  // 4. Первое событие в хронологии заказа.
  await logOrderEvent({
    orderId: createdOrder.id,
    status: 'created',
    title: 'Заказ создан',
    comment: orderData.defect ? `Заявленная неисправность: ${orderData.defect}` : null,
  })

  return createdOrder
}


export async function updateOrder(id, fieldsToUpdate) {
  const { data, error } = await supabase
    .from('orders')
    .update(fieldsToUpdate)
    .eq('id', id)
    .select()

  if (error) {
    throw error
  }

  if (!data || data.length === 0) {
    throw new Error(`Заказ с id ${id} не найден или не был обновлён`)
  }

  return data[0]
}

export async function deleteOrder(orderNumber) {
  const { data, error } = await supabase
    .from('orders')
    .delete()
    .eq('order_number', orderNumber)
    .select()

  if (error) {
    throw error
  }

  if (!data || data.length === 0) {
    throw new Error(`Заказ ${orderNumber} не найден или не был удалён`)
  }
}
