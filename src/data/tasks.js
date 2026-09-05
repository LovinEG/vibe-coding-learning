import { supabase } from '../lib/supabase'

// Джойн исполнителя: full_name + email (та же связка, что в журнале движений).
const TASK_SELECT = '*, profiles(full_name, email, roles(code))'

function mapTask(row) {
  return {
    id: row.id,
    title: row.title,
    description: row.description ?? null,
    status: row.status,
    priority: row.priority,
    assignedTo: row.assigned_to ?? null,
    assigneeName: row.profiles?.full_name || row.profiles?.email || null,
    assigneeEmail: row.profiles?.email ?? null,
    dueDate: row.due_date ?? null,
    createdAt: row.created_at,
  }
}

// Все задачи, свежие сверху (сортировка по created_at desc).
export async function getTasks() {
  const { data, error } = await supabase
    .from('tasks')
    .select(TASK_SELECT)
    .order('created_at', { ascending: false })

  if (error) {
    throw error
  }

  return (data ?? []).map(mapTask)
}

// Справочник сотрудников для выпадающего списка «Исполнитель».
export async function getEmployees() {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, full_name, email')
    .order('full_name', { ascending: true })

  if (error) {
    throw error
  }

  return (data ?? []).map((profile) => ({
    id: profile.id,
    fullName: profile.full_name,
    email: profile.email,
  }))
}

// Новая задача.
export async function addTask({
  title,
  description,
  status,
  priority,
  assignedTo,
  dueDate,
}) {
  const { data, error } = await supabase
    .from('tasks')
    .insert({
      title,
      description: description ?? null,
      status,
      priority,
      assigned_to: assignedTo || null,
      due_date: dueDate || null,
    })
    .select(TASK_SELECT)
    .single()

  if (error) {
    throw error
  }

  return mapTask(data)
}

// Редактирование: меняем только переданные поля.
export async function updateTask(id, data) {
  const updates = {}

  if (data.title !== undefined) {
    updates.title = data.title
  }
  if (data.description !== undefined) {
    updates.description = data.description || null
  }
  if (data.status !== undefined) {
    updates.status = data.status
  }
  if (data.priority !== undefined) {
    updates.priority = data.priority
  }
  if (data.assignedTo !== undefined) {
    updates.assigned_to = data.assignedTo || null
  }
  if (data.dueDate !== undefined) {
    updates.due_date = data.dueDate || null
  }

  const { data: updated, error } = await supabase
    .from('tasks')
    .update(updates)
    .eq('id', id)
    .select(TASK_SELECT)
    .single()

  if (error) {
    throw error
  }

  return mapTask(updated)
}

// Удаление задачи. Исполнитель не затрагивается (FK ON DELETE SET NULL
// здесь не участвует — удаляется сама задача).
export async function deleteTask(id) {
  const { error } = await supabase.from('tasks').delete().eq('id', id)

  if (error) {
    throw error
  }
}