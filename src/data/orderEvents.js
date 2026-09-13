import { supabase } from '../lib/supabase'

// Таймлайн заказа (order_events, Stage 3): системные события + внутренние
// комментарии сотрудников. Не заменяет order_status_history — обе истории
// живут параллельно; UI карточки заказа читает именно order_events.

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

// События заказа, новые сверху.
export async function getOrderEvents(orderId) {
  if (!orderId) {
    throw new Error('getOrderEvents: требуется orderId')
  }

  const { data, error } = await supabase
    .from('order_events')
    .select(ORDER_EVENTS_SELECT)
    .eq('order_id', orderId)
    .order('created_at', { ascending: false })

  if (error) {
    throw error
  }

  return (data ?? []).map(mapOrderEvent)
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

  const { data: userData, error: userError } = await supabase.auth.getUser()

  if (userError) {
    throw userError
  }

  const { data, error } = await supabase
    .from('order_events')
    .insert({
      order_id: orderId,
      type: 'comment',
      message: text,
      author_id: userData?.user?.id ?? null,
      metadata: {},
    })
    .select(ORDER_EVENTS_SELECT)
    .single()

  if (error) {
    throw error
  }

  return mapOrderEvent(data)
}
