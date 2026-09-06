import { supabase } from '../lib/supabase'

// Статусы завершённых заказов для расчёта LTV. «Выдан» — фактический
// завершающий статус в CRM; «completed» оставлен как алиас на будущее.
const COMPLETED_STATUSES = ['Выдан', 'completed', 'issued']

const CLIENT_SELECT =
  '*, devices(*), orders(status, price, accepted_at, defect, devices(brand, model))'

function mapClient(row) {
  const orders = row.orders ?? []

  // LTV: сумма цен завершённых заказов (Выдан / completed / issued).
  const ltv = orders
    .filter((order) => COMPLETED_STATUSES.includes(order.status))
    .reduce((sum, order) => sum + (Number(order.price) || 0), 0)

  return {
    id: row.id,
    name: row.name,
    phone: row.phone,
    email: row.email ?? null,
    notes: row.notes ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at ?? row.created_at,
    devicesCount: row.devices?.length ?? 0,
    ordersCount: orders.length,
    ltv,
  }
}

// Каталог клиентов с серверным поиском и агрегатами.
// filters: { search } — поиск по имени, телефону и email (PostgREST .or()).
// Сортировка по умолчанию: created_at desc (недавно добавленные сверху).
export async function getClients(filters = {}) {
  let query = supabase
    .from('clients')
    .select(CLIENT_SELECT)
    .order('created_at', { ascending: false })

  const search = filters.search?.trim()

  if (search) {
    const pattern = `%${search.replace(/[%_,()]/g, ' ')}%`

    query = query.or(
      [
        `name.ilike.${pattern}`,
        `phone.ilike.${pattern}`,
        `email.ilike.${pattern}`,
      ].join(','),
    )
  }

  const { data, error } = await query

  if (error) {
    throw error
  }

  return (data ?? []).map(mapClient)
}

// Детальная карточка клиента: профиль + устройства + история заказов
// (статус, модель устройства, дата, стоимость). Заказы — свежие сверху.
export async function getClientById(clientId) {
  const { data, error } = await supabase
    .from('clients')
    .select(CLIENT_SELECT)
    .eq('id', clientId)
    .single()

  if (error) {
    throw error
  }

  const devices = (data.devices ?? []).map((device) => ({
    id: device.id,
    brand: device.brand,
    model: device.model,
    serialNumber: device.serial_number ?? null,
    createdAt: device.created_at,
  }))

  const orders = (data.orders ?? [])
    .map((order) => ({
      id: order.id,
      status: order.status,
      device: order.devices
        ? `${order.devices.brand || ''} ${order.devices.model || ''}`.trim()
        : null,
      defect: order.defect ?? null,
      acceptedAt: order.accepted_at,
      price: Number(order.price) || 0,
    }))
    .sort(
      (a, b) => new Date(b.acceptedAt ?? 0) - new Date(a.acceptedAt ?? 0),
    )

  return {
    ...mapClient(data),
    devices,
    orders,
  }
}

// Новый клиент: имя и телефон обязательны, email/notes — опционально.
export async function createClient(clientData) {
  const { data, error } = await supabase
    .from('clients')
    .insert({
      name: clientData.name,
      phone: clientData.phone || '',
      email: clientData.email || null,
      notes: clientData.notes || null,
    })
    .select()
    .single()

  if (error) {
    throw error
  }

  return data
}

// Обновление профиля: меняем только переданные поля + updated_at.
export async function updateClient(clientId, clientData) {
  const updates = {}

  if (clientData.name !== undefined) {
    updates.name = clientData.name
  }
  if (clientData.phone !== undefined) {
    updates.phone = clientData.phone
  }
  if (clientData.email !== undefined) {
    updates.email = clientData.email || null
  }
  if (clientData.notes !== undefined) {
    updates.notes = clientData.notes || null
  }

  updates.updated_at = new Date().toISOString()

  const { data, error } = await supabase
    .from('clients')
    .update(updates)
    .eq('id', clientId)
    .select()
    .single()

  if (error) {
    throw error
  }

  return data
}

// Экспорт выборки клиентов в CSV (Excel-совместимый: BOM + разделитель «;»).
export function exportClientsToCsv(clientsList) {
  const headers = [
    'Имя',
    'Телефон',
    'Email',
    'Устройств',
    'Заказов',
    'LTV',
    'Клиент с',
  ]

  const escapeCell = (value) => {
    const text = value === null || value === undefined ? '' : String(value)
    return `"${text.replace(/"/g, '""')}"`
  }

  const rows = clientsList.map((client) =>
    [
      client.name,
      client.phone,
      client.email,
      client.devicesCount,
      client.ordersCount,
      client.ltv,
      client.createdAt
        ? new Date(client.createdAt).toLocaleDateString('ru-RU')
        : '',
    ]
      .map(escapeCell)
      .join(';'),
  )

  const csv = ['\uFEFF', headers.map(escapeCell).join(';'), ...rows].join('\r\n')

  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')

  link.href = url
  link.download = `clients-${new Date().toISOString().slice(0, 10)}.csv`
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}
