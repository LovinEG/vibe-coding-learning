import { useEffect, useMemo, useState } from 'react'
import TaskModal from '../components/modals/TaskModal'
import TaskStatusDropdown from '../components/ui/TaskStatusDropdown'
import Button from '../components/ui/Button'
import { deleteTask, getTasks, updateTask } from '../data/tasks'
import { formatDateTime } from '../lib/format'
import { usePermission } from '../lib/usePermission'
import './Page.css'

const TASKS_FILTERS = [
  { value: 'all', label: 'Все' },
  { value: 'todo', label: 'К выполнению' },
  { value: 'in_progress', label: 'В работе' },
  { value: 'done', label: 'Готово' },
]

const PRIORITY_LABELS = {
  low: 'Низкий',
  normal: 'Нормальный',
  high: 'Высокий',
}

const PRIORITY_BADGES = {
  low: 'tasks-page__priority-badge--low',
  normal: 'tasks-page__priority-badge--normal',
  high: 'tasks-page__priority-badge--high',
}

function TasksPage() {
  const [tasks, setTasks] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  // Модалка открыта + какая задача редактируется (null — создание новой).
  // Отдельные состояния (а не единый объект {open, task}) гарантируют,
  // что key компонента TaskModal зависит ТОЛЬКО от факта открытия и id
  // задачи — во время ввода/выбора в форме key остаётся стабильным,
  // и компонент не пересоздаётся/не закрывается.
  const [modalOpen, setModalOpen] = useState(false)
  const [editingTask, setEditingTask] = useState(null)
  const [deletingId, setDeletingId] = useState(null)
  const [updatingId, setUpdatingId] = useState(null)

  // Запись задач: администратор или роль с правом tasks.manage.
  const canManage = usePermission('tasks.manage')

  useEffect(() => {
    let cancelled = false

    async function loadTasks() {
      try {
        const result = await getTasks()

        if (!cancelled) {
          setTasks(result)
        }
      } catch (err) {
        console.error('Не удалось загрузить задачи:', err)

        if (!cancelled) {
          setError(
            'Не удалось загрузить задачи. Попробуйте обновить страницу.',
          )
        }
      } finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
    }

    loadTasks()

    return () => {
      cancelled = true
    }
  }, [])

  function openCreate() {
    setEditingTask(null)
    setModalOpen(true)
  }

  function openEdit(task) {
    setEditingTask(task)
    setModalOpen(true)
  }

  function closeModal() {
    setModalOpen(false)
    setEditingTask(null)
  }

  async function refreshTasks() {
    try {
      setError(null)
      setTasks(await getTasks())
    } catch (err) {
      console.error('Не удалось обновить список задач:', err)
      setError('Не удалось обновить список задач.')
    }
  }

  // Быстрая смена статуса прямо в таблице.
  async function handleStatusChange(taskId, newStatus) {
    const currentTask = tasks.find((item) => item.id === taskId)

    if (!currentTask || currentTask.status === newStatus || updatingId) {
      return
    }

    setUpdatingId(taskId)

    try {
      await updateTask(taskId, { status: newStatus })
      setTasks((prev) =>
        prev.map((item) =>
          item.id === taskId ? { ...item, status: newStatus } : item,
        ),
      )
    } catch (err) {
      console.error('Не удалось обновить статус задачи:', err)
      setError(`Не удалось обновить статус задачи «${currentTask.title}».`)
    } finally {
      setUpdatingId(null)
    }
  }

  async function handleDelete(task) {
    const confirmed = window.confirm(`Удалить задачу «${task.title}»?`)

    if (!confirmed) {
      return
    }

    setDeletingId(task.id)

    try {
      await deleteTask(task.id)
      setTasks((prev) => prev.filter((item) => item.id !== task.id))
    } catch (err) {
      console.error('Не удалось удалить задачу:', err)
      setError(`Не удалось удалить задачу «${task.title}».`)
    } finally {
      setDeletingId(null)
    }
  }

  const normalizedSearch = search.trim().toLowerCase()

  const filteredTasks = useMemo(
    () =>
      tasks.filter((task) => {
        if (statusFilter !== 'all' && task.status !== statusFilter) {
          return false
        }

        if (!normalizedSearch) {
          return true
        }

        return (
          task.title.toLowerCase().includes(normalizedSearch) ||
          (task.assigneeName ?? '').toLowerCase().includes(normalizedSearch)
        )
      }),
    [tasks, statusFilter, normalizedSearch],
  )

  return (
    <div className="page tasks-page">
      <header className="tasks-page__head">
        <h1 className="tasks-page__title">Задачи</h1>
        {canManage ? (
          <Button type="button" onClick={openCreate}>
            + Новая задача
          </Button>
        ) : null}
      </header>

      <input
        className="tasks-page__search"
        type="search"
        placeholder="Поиск по названию задачи или сотруднику..."
        value={search}
        onChange={(event) => setSearch(event.target.value)}
        aria-label="Поиск задач"
      />

      <div
        className="tasks-page__filters"
        role="group"
        aria-label="Фильтр по статусу задачи"
      >
        {TASKS_FILTERS.map((filter) => (
          <button
            key={filter.value}
            type="button"
            className={
              statusFilter === filter.value
                ? 'tasks-page__filter is-active'
                : 'tasks-page__filter'
            }
            onClick={() => setStatusFilter(filter.value)}
          >
            {filter.label}
          </button>
        ))}
      </div>

      {error ? (
        <p className="tasks-page__error" role="alert">
          {error}
        </p>
      ) : null}

      {loading ? (
        <p className="tasks-page__empty">Загрузка...</p>
      ) : filteredTasks.length === 0 ? (
        <p className="tasks-page__empty">Задачи не найдены</p>
      ) : (
        <div className="tasks-page__table">
          <div className="tasks-page__table-header">
            <span>Название</span>
            <span>Статус</span>
            <span>Приоритет</span>
            <span>Исполнитель</span>
            <span>Срок</span>
            {canManage ? <span>Действия</span> : null}
          </div>

          <ul className="tasks-page__list">
            {filteredTasks.map((task) => (
              <li key={task.id} className="tasks-page__row">
                <span className="tasks-page__name">
                  <span className="tasks-page__task-title">{task.title}</span>
                  {task.description ? (
                    <small className="tasks-page__description">
                      {task.description}
                    </small>
                  ) : null}
                </span>

                <span>
                  <TaskStatusDropdown
                    value={task.status}
                    onChange={(newStatus) =>
                      handleStatusChange(task.id, newStatus)
                    }
                    disabled={!canManage || updatingId === task.id}
                  />
                </span>

                <span>
                  <span
                    className={`tasks-page__priority-badge ${
                      PRIORITY_BADGES[task.priority] ?? ''
                    }`}
                  >
                    {PRIORITY_LABELS[task.priority] ?? task.priority}
                  </span>
                </span>

                <span className="tasks-page__assignee">
                  {task.assigneeName ?? '—'}
                </span>

                <span className="tasks-page__due">
                  {task.dueDate ? formatDateTime(task.dueDate) : '—'}
                </span>

                {canManage ? (
                  <span className="tasks-page__actions">
                    <Button
                      type="button"
                      className="tasks-page__action-button"
                      onClick={() => openEdit(task)}
                      disabled={deletingId === task.id}
                    >
                      Изменить
                    </Button>
                    <Button
                      type="button"
                      className="tasks-page__action-button tasks-page__action-button--danger"
                      onClick={() => handleDelete(task)}
                      disabled={deletingId === task.id}
                    >
                      {deletingId === task.id ? 'Удаление...' : 'Удалить'}
                    </Button>
                  </span>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      )}

      <TaskModal
        // key меняется только при открытии/закрытии или смене
        // редактируемой задачи — во время редактирования стабилен.
        key={modalOpen ? editingTask?.id || 'new' : 'closed'}
        open={modalOpen}
        task={editingTask}
        onClose={closeModal}
        onSaved={refreshTasks}
      />
    </div>
  )
}

export default TasksPage