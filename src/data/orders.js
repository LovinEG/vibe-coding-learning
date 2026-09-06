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

// Инкрементальный пересчёт итоговой стоимости заказа (orders.price):
// + стоимость при добавлении деталей/работ, - при удалении, чтобы
// ручная цена работ не терялась. Общий для orderParts и orderServices.
export async function recalcOrderPrice(orderId, delta) {
  const { data: order, error: orderError } = await supabase
    .from('orders')
    .select('price')
    .eq('id', orderId)
    .single()

  if (orderError) {
    throw orderError
  }

  const newPrice = Math.max(0, Number(order?.price ?? 0) + delta)

  const { data: updated, error: updateError } = await supabase
    .from('orders')
    .update({ price: newPrice })
    .eq('id', orderId)
    .select()
    .single()

  if (updateError) {
    throw updateError
  }

  return updated
}

const ORDER_SELECT =
  '*, clients(*), devices(*), master_profile:profiles!master_id(full_name)'

// Детальная выборка заказа: приёмка/диагностика (колонки ШАГ 3.1),
// список деталей с ценообразованием (закупка + наценка) и автором,
// а также хронология событий с профилем автора.
// Внимание: у order_parts два FK на profiles (master_id и added_by) —
// PostgREST требует дизамбигуацию через !added_by.
const ORDER_DETAILS_SELECT =
  '*, clients(*), devices(*), master_profile:profiles!master_id(full_name), ' +
  'order_parts(*, parts(id, sku, name, category), added_by_profile:profiles!added_by(full_name)), ' +
  'order_status_history(*, profiles(full_name, avatar_url))'

// Незавершённые статусы — участвуют в расчёте просрочки.
export const ACTIVE_ORDER_STATUSES = [
  'Новый',
  'В работе',
  'Ожидает деталь',
  'Готово к выдаче',
]

// SLA ремонта по умолчанию: если deadline_at не задан, просрочка
// считается от даты приёма + 7 календарных дней.
export const OVERDUE_SLA_DAYS = 7

// Каталог типов ремонта для фильтра и формы заказа.
export const REPAIR_TYPE_OPTIONS = [
  'Диагностика',
  'Аппаратный ремонт',
  'Программный ремонт',
  'Замена деталей',
  'Профилактика',
  'Другое',
]

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
    // Назначенный мастер и рабочий процесс (ШАГ 3.4).
    masterId: row.master_id ?? null,
    masterName: row.master_profile?.full_name ?? null,
    deadlineAt: row.deadline_at ?? null,
    repairType: row.repair_type ?? null,
    deviceSerial: row.devices?.serial_number ?? null,
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

// Просрочен ли заказ: незавершённый статус и (deadline_at < now
// либо, при незаданном сроке, приём старше SLA).
export function isOverdueOrder(order, now = new Date()) {
  if (!ACTIVE_ORDER_STATUSES.includes(order.status)) {
    return false
  }

  if (order.deadlineAt) {
    return new Date(order.deadlineAt) < now
  }

  if (!order.acceptedAt) {
    return false
  }

  const slaDeadline = new Date(order.acceptedAt)
  slaDeadline.setDate(slaDeadline.getDate() + OVERDUE_SLA_DAYS)
  return slaDeadline < now
}

// Список заказов с серверными фильтрами и мульти-поиском.
// filters: { search, status, masterId, repairType, isOverdue }.
// Поиск идёт по № заказа, имени/телефону клиента, бренду/модели
// устройства и IMEI / серийному номеру (devices.serial_number).
export async function getOrders(filters = {}) {
  let query = supabase.from('orders').select(ORDER_SELECT)

  const search = filters.search?.trim()

  if (search) {
    const pattern = `%${search.replace(/[%_,()]/g, ' ')}%`

    query = query.or(
      [
        `order_number.ilike.${pattern}`,
        `client.ilike.${pattern}`,
        `clients.name.ilike.${pattern}`,
        `clients.phone.ilike.${pattern}`,
        `devices.brand.ilike.${pattern}`,
        `devices.model.ilike.${pattern}`,
        `devices.serial_number.ilike.${pattern}`,
      ].join(','),
    )
  }

  if (filters.status && filters.status !== 'Все') {
    query = query.eq('status', filters.status)
  }

  if (filters.masterId) {
    query = query.eq('master_id', filters.masterId)
  }

  if (filters.repairType) {
    query = query.eq('repair_type', filters.repairType)
  }

  // Статус согласования: pending / approved / rejected / not_required
  // (дашборд: /orders?approval=pending).
  if (filters.approval) {
    query = query.eq('approval_status', filters.approval)
  }

  if (filters.isOverdue) {
    const nowIso = new Date().toISOString()
    const slaCutoff = new Date()
    slaCutoff.setDate(slaCutoff.getDate() - OVERDUE_SLA_DAYS)
    const slaIso = slaCutoff.toISOString()

    query = query
      .in('status', ACTIVE_ORDER_STATUSES)
      // Просрочен: срок наступил либо (без срока) приём старше SLA.
      .or(`deadline_at.lt.${nowIso},and(accepted_at.lt.${slaIso},deadline_at.is.null)`)
  }

  const { data, error } = await query

  if (error) {
    throw error
  }

  return (data ?? []).map(mapOrder)
}

// Экспорт выборки заказов в CSV (Excel-совместимый: BOM + разделитель «;»).
export function exportOrdersToCsv(ordersList) {
  const headers = [
    'Номер заказа',
    'Клиент',
    'Телефон',
    'Устройство',
    'IMEI / SN',
    'Статус',
    'Тип ремонта',
    'Мастер',
    'Принят',
    'Срок',
    'Просрочен',
    'Стоимость',
  ]

  const escapeCell = (value) => {
    const text = value === null || value === undefined ? '' : String(value)
    return `"${text.replace(/"/g, '""')}"`
  }

  const rows = ordersList.map((order) =>
    [
      order.orderNumber,
      order.client,
      order.clientPhone,
      order.device,
      order.deviceSerial,
      order.status,
      order.repairType,
      order.masterName,
      order.acceptedAt ? new Date(order.acceptedAt).toLocaleDateString('ru-RU') : '',
      order.deadlineAt ? new Date(order.deadlineAt).toLocaleDateString('ru-RU') : '',
      isOverdueOrder(order) ? 'Да' : 'Нет',
      order.price ?? '',
    ]
      .map(escapeCell)
      .join(';'),
  )

  const csv = ['\uFEFF', headers.map(escapeCell).join(';'), ...rows].join('\r\n')

  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')

  link.href = url
  link.download = `orders-${new Date().toISOString().slice(0, 10)}.csv`
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
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

// Создание заказа. Поддерживает два режима клиента/устройства:
// 1) быстрый ввод нового (client/clientPhone/brand/device/serialNumber);
// 2) существующие записи (clientId и/или deviceId — их создание пропускается).
// Фиксирует данные приёмки и параметры рабочего процесса (ШАГ 3.6):
// masterId, repairType, deadlineAt.
export async function createOrder(orderData) {
  // 1. Клиент: передан clientId — используем существующего, иначе создаём.
  let clientId = orderData.clientId ?? null

  if (!clientId) {
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

    clientId = clientData.id
  }

  // 2. Устройство: передан deviceId — используем существующее, иначе создаём.
  let deviceId = orderData.deviceId ?? null

  if (!deviceId) {
    const { data: deviceData, error: deviceError } = await supabase
      .from('devices')
      .insert({
        client_id: clientId,
        brand: orderData.brand || 'Не указано',
        model: orderData.device,
        serial_number: orderData.serialNumber || null,
      })
      .select()
      .single()

    if (deviceError) {
      throw deviceError
    }

    deviceId = deviceData.id
  }

  // 3. Создаём заказ
  const { data: createdOrder, error: orderError } = await supabase
    .from('orders')
    .insert({
      order_number: orderData.orderNumber,
      client_id: clientId,
      device_id: deviceId,
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
      // Рабочий процесс (ШАГ 3.6): мастер, тип ремонта, срок.
      master_id: orderData.masterId || null,
      repair_type: orderData.repairType || null,
      deadline_at: orderData.deadlineAt || null,
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
    createdBy: orderData.masterId ?? null,
  })

  return createdOrder
}


// Обновление заказа. Поддерживает два сценария:
// 1) инлайн-смена статуса: updateOrder(id, { status: '...' }) — без события;
// 2) редактирование карточки (ШАГ 3.5): masterId, problemDescription,
//    appearance, equipment, deviceCondition, estimatedCost, deadlineAt,
//    repairType — с логированием события 'updated' в историю.
export async function updateOrder(orderId, updateData = {}) {
  const updates = {}

  // Прямые поля (инлайн-смена статуса и совместимость).
  if (updateData.status !== undefined) {
    updates.status = updateData.status
  }

  // Поля редактирования карточки.
  if (updateData.masterId !== undefined) {
    updates.master_id = updateData.masterId || null
  }
  if (updateData.problemDescription !== undefined) {
    updates.defect = updateData.problemDescription || null
  }
  if (updateData.appearance !== undefined) {
    updates.appearance = updateData.appearance || null
  }
  if (updateData.equipment !== undefined) {
    updates.equipment = updateData.equipment || null
  }
  if (updateData.deviceCondition !== undefined) {
    updates.device_condition = updateData.deviceCondition || null
  }
  if (updateData.estimatedCost !== undefined) {
    updates.price = Number(updateData.estimatedCost) || 0
  }
  if (updateData.deadlineAt !== undefined) {
    updates.deadline_at = updateData.deadlineAt || null
  }
  if (updateData.repairType !== undefined) {
    updates.repair_type = updateData.repairType || null
  }

  if (Object.keys(updates).length === 0) {
    throw new Error('updateOrder: не переданы поля для обновления')
  }

  const { data, error } = await supabase
    .from('orders')
    .update(updates)
    .eq('id', orderId)
    .select()

  if (error) {
    throw error
  }

  if (!data || data.length === 0) {
    throw new Error(`Заказ с id ${orderId} не найден или не был обновлён`)
  }

  // Событие журналируется только при редактировании карточки
  // (инлайн-смена статуса логируется отдельными событиями).
  const editFields = [
    'masterId',
    'problemDescription',
    'appearance',
    'equipment',
    'deviceCondition',
    'estimatedCost',
    'deadlineAt',
    'repairType',
  ]

  if (editFields.some((field) => updateData[field] !== undefined)) {
    await logOrderEvent({
      orderId,
      status: 'updated',
      title: 'Данные заказа обновлены',
    })
  }

  return mapOrder(data[0])
}

// ---------------------------------------------------------------------
// Работы / услуги по заказу (ШАГ 3.5)
// ---------------------------------------------------------------------

// Добавление работы: запись в order_services + пересчёт итоговой
// стоимости заказа + событие 'service_added' в хронологии.
// serviceData: { serviceId, title, price, masterId, durationMinutes }.
export async function addOrderService(orderId, serviceData = {}) {
  const {
    serviceId = null,
    title,
    price,
    masterId = null,
    durationMinutes = null,
  } = serviceData

  if (!orderId) {
    throw new Error('addOrderService: требуется orderId')
  }

  const serviceTitle = title?.trim()

  if (!serviceTitle) {
    throw new Error('addOrderService: требуется название работы')
  }

  const servicePrice = Number(price)

  if (!Number.isFinite(servicePrice) || servicePrice < 0) {
    throw new Error('addOrderService: стоимость работы — неотрицательное число')
  }

  const { data: created, error: insertError } = await supabase
    .from('order_services')
    .insert({
      order_id: orderId,
      service_id: serviceId || null,
      title: serviceTitle,
      price: servicePrice,
      master_id: masterId || null,
      duration_minutes:
        durationMinutes === null || durationMinutes === '' || durationMinutes === undefined
          ? null
          : Number(durationMinutes),
    })
    .select()
    .single()

  if (insertError) {
    throw insertError
  }

  // Пересчёт итоговой стоимости заказа (+ стоимость работы).
  const order = await recalcOrderPrice(orderId, servicePrice)

  await logOrderEvent({
    orderId,
    status: 'service_added',
    title: `Добавлена работа: ${serviceTitle}`,
    comment: `${formatMoney(servicePrice)}${
      masterId ? ' · мастер назначен' : ''
    }`,
    createdBy: masterId ?? null,
  })

  return { orderService: created, order }
}

// Работы по заказу с исполнителем (мастером) и связью со справочником.
export async function getOrderServices(orderId) {
  const { data, error } = await supabase
    .from('order_services')
    .select(
      '*, service:services(name), master_profile:profiles!master_id(full_name)',
    )
    .eq('order_id', orderId)
    .order('created_at', { ascending: true })

  if (error) {
    throw error
  }

  return (data ?? []).map((row) => ({
    id: row.id,
    orderId: row.order_id,
    serviceId: row.service_id ?? null,
    title: row.title,
    price: Number(row.price) || 0,
    masterId: row.master_id ?? null,
    masterName: row.master_profile?.full_name ?? null,
    durationMinutes: row.duration_minutes ?? null,
    createdAt: row.created_at,
  }))
}

function formatMoney(value) {
  return `${new Intl.NumberFormat('ru-RU').format(Number(value) || 0)} ₽`
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
