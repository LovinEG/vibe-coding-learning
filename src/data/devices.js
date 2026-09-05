import { supabase } from '../lib/supabase'

// Джойн владельца: в таблице clients поля называются name/phone
// (full_name — это profiles, к устройствам отношения не имеет).
const DEVICE_SELECT = '*, clients(id, name, phone)'

function mapDevice(device) {
  return {
    id: device.id,
    createdAt: device.created_at,
    brand: device.brand,
    model: device.model,
    serialNumber: device.serial_number,
    deviceType: device.device_type,
    clientId: device.client_id,
    clientName: device.clients?.name ?? null,
    clientPhone: device.clients?.phone ?? null,
  }
}

// Все устройства клиентов, свежие сверху.
export async function getDevices() {
  const { data, error } = await supabase
    .from('devices')
    .select(DEVICE_SELECT)
    .order('created_at', { ascending: false })

  if (error) {
    throw error
  }

  return (data ?? []).map(mapDevice)
}

// Новое устройство с привязкой к клиенту.
export async function addDevice({
  clientId,
  brand,
  model,
  serialNumber,
  deviceType,
}) {
  const { data, error } = await supabase
    .from('devices')
    .insert({
      client_id: clientId,
      brand,
      model,
      serial_number: serialNumber || null,
      device_type: deviceType || null,
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