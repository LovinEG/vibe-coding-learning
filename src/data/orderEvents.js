import { supabase } from '../lib/supabase'

// id текущего пользователя — он же profiles.id (1:1 с auth.users).
async function getCurrentProfileId() {
  const { data, error } = await supabase.auth.getUser()

  if (error) {
    throw error
  }

  return data?.user?.id ?? null
}

// Таймлайн заказа (order_events, Stage 3): системные события + внутренние
// комментарии сотрудников. Лента единая: order_events объединяется на лету
// с легаси-историей order_status_history (read-only, без копирования
// данных и без миграций — обе таблицы живут параллельно).

// Автор события: единственный FK на profiles (author_id) — хинт по колонке.
const ORDER_EVENTS_SELECT = '*, author:profiles!author_id(full_name, avatar_url)'

function mapOrderEvent(row) {
  return {
    id: row.id,
    orderId: row.order_id,
    type: row.type,
    message: row.message ?? null,
    metadata: row.metadata ?? {},
    authorId: row.author_id ?? null,
    authorName: row.author?.full_name ?? null,
    authorAvatar: row.author?.avatar_url ?? null,
    createdAt: row.created_at,
  }
}

// ---------------------------------------------------------------------
// Легаси-история (order_status_history) в общей ленте таймлайна.
// Поля: id, order_id, status, title, comment, created_by, created_at
// (+ profiles по FK created_by). Коды status: created, assigned,
// diagnosed, part_added, service_added, approval_sent, approved,
// rejected, repaired, paid, issued, updated, closed.
// ---------------------------------------------------------------------

const LEGACY_HISTORY_SELECT = '*, profiles(full_name, avatar_url)'

// Маппинг старых кодов на канонические типы order_events, чтобы старые и
// новые события жили в одном формате (и дедупликация была точной).
const LEGACY_STATUS_TO_TYPE = {
  created: 'order_created',
  assigned: 'technician_assigned',
  approval_sent: 'approval_sent',
  approved: 'approved',
  rejected: 'rejected',
  part_added: 'part_added',
  service_added: 'service_added',
  closed: 'order_closed',
}

// Fallback-подписи для кодов без аналога в order_events
// (иначе UI показал бы сырой код вроде 'diagnosed').
const LEGACY_STATUS_LABELS = {
  diagnosed: 'Проведена диагностика',
  repaired: 'Ремонт выполнен',
  paid: 'Заказ оплачен',
  issued: 'Заказ выдан',
  updated: 'Данные заказа обновлены',
}

// Легаси-строка → формат order_events. title + comment склеиваются
// в понятный текст события (title — короткая метка, comment — детали).
function mapLegacyHistoryRow(row) {
  const text = [row.title, row.comment].filter(Boolean).join(' — ')

  return {
    id: row.id,
    orderId: row.order_id,
    type: LEGACY_STATUS_TO_TYPE[row.status] ?? row.status,
    message: text || LEGACY_STATUS_LABELS[row.status] || null,
    metadata: {},
    authorId: row.created_by ?? null,
    authorName: row.profiles?.full_name ?? null,
    authorAvatar: row.profiles?.avatar_url ?? null,
    createdAt: row.created_at,
    legacy: true,
  }
}

// Дубли возникают там, где одно и то же событие пишется в обе таблицы.
// Сегодня это только создание заказа: createOrder пишет 'created' в
// order_status_history и следом 'order_created' в order_events (два
// INSERT — разница миллисекунды). Авторы могут отличаться (в легаси —
// мастер, в order_events — текущий пользователь), поэтому дубль — это
// совпадение канонического типа в пределах окна, без сравнения автора.
const DUPLICATE_WINDOW_MS = 5000

function isLegacyDuplicate(legacyEvent, events) {
  const legacyTime = new Date(legacyEvent.createdAt ?? 0).getTime()

  return events.some((event) => {
    if (event.type !== legacyEvent.type) {
      return false
    }

    const eventTime = new Date(event.createdAt ?? 0).getTime()
    return Math.abs(eventTime - legacyTime) <= DUPLICATE_WINDOW_MS
  })
}

// Единая лента: order_events + легаси без дублей, новые сверху.
function mergeWithLegacyHistory(events, legacyRows) {
  const legacyEvents = legacyRows
    .map(mapLegacyHistoryRow)
    .filter((event) => !isLegacyDuplicate(event, events))

  return [...events, ...legacyEvents].sort(
    (a, b) => new Date(b.createdAt ?? 0) - new Date(a.createdAt ?? 0),
  )
}

// Единая лента событий заказа (order_events + order_status_history),
// новые сверху. Сбой чтения легаси не ломает таймлайн — в этом случае
// лента строится только из order_events.
export async function getOrderEvents(orderId) {
  if (!orderId) {
    throw new Error('getOrderEvents: требуется orderId')
  }

  const [eventsResult, legacyResult] = await Promise.all([
    supabase
      .from('order_events')
      .select(ORDER_EVENTS_SELECT)
      .eq('order_id', orderId)
      .order('created_at', { ascending: false }),
    supabase
      .from('order_status_history')
      .select(LEGACY_HISTORY_SELECT)
      .eq('order_id', orderId)
      .order('created_at', { ascending: false }),
  ])

  const { data, error } = eventsResult
  const { data: legacyData, error: legacyError } = legacyResult

  if (error) {
    throw error
  }

  if (legacyError) {
    console.error('Не удалось загрузить order_status_history:', legacyError.message)
    return (data ?? []).map(mapOrderEvent)
  }

  return mergeWithLegacyHistory((data ?? []).map(mapOrderEvent), legacyData ?? [])
}

// Внутренний комментарий сотрудника к заказу.
// Пустой (после trim) не отправляется — возвращается null.
// Возвращает созданную запись (уже замапленную).
export async function addOrderComment(orderId, message) {
  if (!orderId) {
    throw new Error('addOrderComment: требуется orderId')
  }

  const text = message?.trim()

  if (!text) {
    return null
  }

  const profileId = await getCurrentProfileId()

  const { data, error } = await supabase
    .from('order_events')
    .insert({
      order_id: orderId,
      type: 'comment',
      message: text,
      author_id: profileId,
      metadata: {},
    })
    .select(ORDER_EVENTS_SELECT)
    .single()

  if (error) {
    throw error
  }

  return mapOrderEvent(data)
}

// ---------------------------------------------------------------------
// Системные события таймлайна из бизнес-операций заказа
// (назначение мастера, детали и т.п.). Это «младший брат» logOrderEvent
// из orders.js: тот пишет легаси-историю order_status_history и бросает
// ошибку, этот — order_events и НИКОГДА не бросает: сбой журналирования
// не должен откатывать основную операцию (мастер уже назначен, деталь
// уже списана со склада). Ошибка уходит только в console.error.
//
// Возвращает true при успешной записи и false при любой проблеме, чтобы
// вызывающий код мог решить, перечитывать ли ленту таймлайна.
//
// metadata пишется как есть (jsonb): для technician_assigned —
// { technician_id, technician_name }, для part_added / part_removed —
// { part_id, name, quantity }.
//
// payment_added / order_closed через эту функцию не пишутся: их создаёт
// только серверная RPC public.close_order — в той же транзакции, что
// income-платёж и закрытие заказа. INSERT-политика order_events этим
// типам фронтенд не разрешает (событие нельзя подделать из браузера).
export async function logOrderTimelineEvent({
  orderId,
  type,
  message = null,
  metadata = {},
  authorId = null,
} = {}) {
  if (!orderId || !type) {
    console.error('logOrderTimelineEvent: требуются orderId и type')
    return false
  }

  try {
    // Автор: переданный (например, мастер детали) или текущий пользователь.
    const profileId = authorId ?? (await getCurrentProfileId())

    const { error } = await supabase.from('order_events').insert({
      order_id: orderId,
      type,
      message: message ?? null,
      author_id: profileId,
      metadata: metadata ?? {},
    })

    if (error) {
      console.error(`Не удалось записать ${type}:`, error.message)
      return false
    }

    return true
  } catch (error) {
    console.error(`Не удалось записать ${type}:`, error?.message ?? error)
    return false
  }
}
