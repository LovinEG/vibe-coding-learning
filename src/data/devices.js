import { supabase } from '../lib/supabase'

// Джойн владельца: в таблице clients поля называются name/phone
// (full_name — это profiles, к устройствам отношения не имеет).
// orders(status) — для агрегатов: всего ремонтов и активных в работе.
const DEVICE_SELECT = '*, clients(id, name, phone), orders(status)'

// Детальная выборка: устройство + владелец + вся история ремонтов
// с мастером (orders.master_id добавлен миграцией ШАГ 3.4).
const DEVICE_DETAILS_SELECT =
  '*, clients(id, name, phone), ' +
  'orders(id, status, defect, price, created_at, master:profiles!master_id(full_name))'

// Незавершённые статусы — для подсчёта активных ремонтов устройства.
const ACTIVE_ORDER_STATUSES = ['Новый', 'В работе', 'Ожидает деталь', 'Готово к выдаче']

function mapDevice(device) {
  const orders = device.orders ?? []

  return {
    id: device.id,
    createdAt: device.created_at,
    brand: device.brand,
    model: device.model,
    serialNumber: device.serial_number,
    imei: device.imei ?? null,
    deviceType: device.device_type,
    clientId: device.client_id,
    clientName: device.clients?.name ?? null,
    clientPhone: device.clients?.phone ?? null,
    // Агрегаты ремонтов.
    ordersCount: orders.length,
    activeOrdersCount: orders.filter((order) =>
      ACTIVE_ORDER_STATUSES.includes(order.status),
    ).length,
  }
}

// Каталог устройств с серверным поиском и агрегатами ремонтов.
// filters: { search } — поиск по бренду, модели, IMEI и серийному номеру.
// Сортировка по умолчанию: created_at desc (свежие устройства сверху).
export async function getDevices(filters = {}) {
  let query = supabase
    .from('devices')
    .select(DEVICE_SELECT)
    .order('created_at', { ascending: false })

  const search = filters.search?.trim()

  if (search) {
    const pattern = `%${search.replace(/[%_,()]/g, ' ')}%`

    query = query.or(
      [
        `brand.ilike.${pattern}`,
        `model.ilike.${pattern}`,
        `imei.ilike.${pattern}`,
        `serial_number.ilike.${pattern}`,
      ].join(','),
    )
  }

  const { data, error } = await query

  if (error) {
    throw error
  }

  return (data ?? []).map(mapDevice)
}

// Детальная карточка устройства: данные + владелец + вся история ремонтов
// (статус, неисправность, стоимость, дата, мастер). Заказы — свежие сверху.
export async function getDeviceById(deviceId) {
  const { data, error } = await supabase
    .from('devices')
    .select(DEVICE_DETAILS_SELECT)
    .eq('id', deviceId)
    .single()

  if (error) {
    throw error
  }

  const orders = (data.orders ?? [])
    .map((order) => ({
      id: order.id,
      status: order.status,
      defect: order.defect ?? null,
      price: Number(order.price) || 0,
      createdAt: order.created_at,
      masterName: order.master?.full_name ?? null,
    }))
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))

  return {
    ...mapDevice(data),
    orders,
  }
}

// Экспорт выборки устройств в CSV (Excel-совместимый: BOM + разделитель «;»).
export function exportDevicesToCsv(devicesList) {
  const headers = [
    'Марка',
    'Модель',
    'IMEI',
    'Серийный номер',
    'Владелец',
    'Телефон владельца',
    'Кол-во ремонтов',
    'Дата добавления',
  ]

  const escapeCell = (value) => {
    const text = value === null || value === undefined ? '' : String(value)
    return `"${text.replace(/"/g, '""')}"`
  }

  const rows = devicesList.map((device) =>
    [
      device.brand,
      device.model,
      device.imei,
      device.serialNumber,
      device.clientName,
      device.clientPhone,
      device.ordersCount,
      device.createdAt
        ? new Date(device.createdAt).toLocaleDateString('ru-RU')
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
  link.download = `devices-${new Date().toISOString().slice(0, 10)}.csv`
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}

// Новое устройство с привязкой к клиенту.
export async function addDevice({
  clientId,
  brand,
  model,
  serialNumber,
  deviceType,
  imei,
}) {
  const { data, error } = await supabase
    .from('devices')
    .insert({
      client_id: clientId,
      brand,
      model,
      serial_number: serialNumber || null,
      device_type: deviceType || null,
      imei: imei || null,
    })
    .select(DEVICE_SELECT)
    .single()

  if (error) {
    throw error
  }

  return mapDevice(data)
}

// Редактирование: обновляем только переданные поля.
export async function updateDevice(id, data) {
  const updates = {}

  if (data.clientId !== undefined) {
    updates.client_id = data.clientId
  }
  if (data.brand !== undefined) {
    updates.brand = data.brand
  }
  if (data.model !== undefined) {
    updates.model = data.model
  }
  if (data.serialNumber !== undefined) {
    updates.serial_number = data.serialNumber || null
  }
  if (data.imei !== undefined) {
    updates.imei = data.imei || null
  }
  if (data.deviceType !== undefined) {
    updates.device_type = data.deviceType || null
  }

  const { data: updated, error } = await supabase
    .from('devices')
    .update(updates)
    .eq('id', id)
    .select(DEVICE_SELECT)
    .single()

  if (error) {
    throw error
  }

  return mapDevice(updated)
}

// Удаление устройства. Благодаря FK orders.device_id ON DELETE SET NULL
// заказы, где устройство участвовало, не пропадают.
export async function deleteDevice(id) {
  const { error } = await supabase.from('devices').delete().eq('id', id)

  if (error) {
    throw error
  }
}