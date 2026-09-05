import { useEffect, useState } from 'react'
import { addTask, getEmployees, updateTask } from '../../data/tasks'
import Button from '../ui/Button'
import './TaskModal.css'

const STATUS_OPTIONS = [
  { value: 'todo', label: 'К выполнению' },
  { value: 'in_progress', label: 'В работе' },
  { value: 'done', label: 'Выполнено' },
]

const PRIORITY_OPTIONS = [
  { value: 'low', label: 'Низкий' },
  { value: 'normal', label: 'Нормальный' },
  { value: 'high', label: 'Высокий' },
]

const emptyForm = {
  title: '',
  description: '',
  status: 'todo',
  priority: 'normal',
  assignedTo: '',
  dueDate: '',
}

// ISO timestamptz из БД → значение для <input type="datetime-local">
// (локальное время без зоны).
function toDatetimeLocal(value) {
  if (!value) {
    return ''
  }

  const date = new Date(value)

  if (Number.isNaN(date.getTime())) {
    return ''
  }

  const pad = (num) => String(num).padStart(2, '0')

  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(
    date.getDate(),
  )}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

function createInitialForm(task) {
  return task
    ? {
        title: task.title ?? '',
        description: task.description ?? '',
        status: task.status || 'todo',
        priority: task.priority || 'normal',
        assignedTo: task.assignedTo ?? '',
        dueDate: toDatetimeLocal(task.dueDate),
      }
    : emptyForm
}

function TaskModal({ open, task, onClose, onSaved }) {
  // Форма инициализируется один раз при монтировании: сброс при повторном
  // открытии обеспечивает key={...} на компоненте в TasksPage
  // (идиома React для «state resets when prop changes»).
  const [form, setForm] = useState(() => createInitialForm(task))
  const [employees, setEmployees] = useState([])
  const [employeesLoading, setEmployeesLoading] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const isEditing = Boolean(task?.id)

  // Справочник сотрудников запрашивается при каждом открытии модалки.
  useEffect(() => {
    if (!open) {
      return undefined
    }

    let cancelled = false

    async function loadEmployees() {
      setEmployeesLoading(true)

      try {
        const result = await getEmployees()

        if (!cancelled) {
          setEmployees(result)
        }
      } catch (err) {
        if (!cancelled) {
          console.error('Не удалось загрузить сотрудников:', err)
        }
      } finally {
        if (!cancelled) {
          setEmployeesLoading(false)
        }
      }
    }

    loadEmployees()

    return () => {
      cancelled = true
    }
  }, [open])

  if (!open) {
    return null
  }

  function handleChange(event) {
    const { name, value } = event.target
    setForm((prev) => ({ ...prev, [name]: value }))
  }

  function validate() {
    if (!form.title.trim()) {
      return 'Укажите название задачи'
    }

    return ''
  }

  async function handleSubmit(event) {
    event.preventDefault()

    const validationError = validate()

    if (validationError) {
      setError(validationError)
      return
    }

    setError('')
    setSubmitting(true)

    try {
      const taskData = {
        title: form.title.trim(),
        description: form.description.trim() || null,
        status: form.status,
        priority: form.priority,
        assignedTo: form.assignedTo || null,
        // datetime-local отдаёт локальное время → конвертируем в UTC ISO.
        dueDate: form.dueDate ? new Date(form.dueDate).toISOString() : null,
      }

      if (isEditing) {
        await updateTask(task.id, taskData)
      } else {
        await addTask(taskData)
      }

      onClose()

      if (typeof onSaved === 'function') {
        onSaved()
      }
    } catch (err) {
      console.error('Ошибка сохранения задачи:', err)
      setError(
        err?.message
          ? `Не удалось сохранить задачу: ${err.message}`
          : 'Не удалось сохранить задачу',
      )
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div
      className="task-modal-overlay"
      onClick={submitting ? undefined : onClose}
      role="presentation"
    >
      <div
        className="task-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="task-modal-title"
        onClick={(event) => event.stopPropagation()}
      >
        <h2 id="task-modal-title" className="task-modal__title">
          {isEditing ? 'Редактировать задачу' : 'Новая задача'}
        </h2>

        <form onSubmit={handleSubmit}>
          <label className="task-modal__field">
            <span className="task-modal__label">Название *</span>
            <input
              className="task-modal__input"
              name="title"
              placeholder="Например: заменить дисплей iPhone 12"
              value={form.title}
              onChange={handleChange}
            />
          </label>

          <label className="task-modal__field">
            <span className="task-modal__label">Описание</span>
            <textarea
              className="task-modal__input task-modal__textarea"
              name="description"
              rows={4}
              placeholder="Детали задачи, что именно нужно сделать..."
              value={form.description}
              onChange={handleChange}
            />
          </label>

          <div className="task-modal__row">
            <label className="task-modal__field">
              <span className="task-modal__label">Статус</span>
              <select
                className="task-modal__input"
                name="status"
                value={form.status}
                onChange={handleChange}
              >
                {STATUS_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="task-modal__field">
              <span className="task-modal__label">Приоритет</span>
              <select
                className="task-modal__input"
                name="priority"
                value={form.priority}
                onChange={handleChange}
              >
                {PRIORITY_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <label className="task-modal__field">
            <span className="task-modal__label">Исполнитель</span>
            <select
              className="task-modal__input"
              name="assignedTo"
              value={form.assignedTo}
              onChange={handleChange}
              disabled={employeesLoading}
            >
              <option value="">
                {employeesLoading ? 'Загрузка сотрудников...' : 'Не назначен'}
              </option>
              {employees.map((employee) => (
                <option key={employee.id} value={employee.id}>
                  {employee.fullName || employee.email}
                </option>
              ))}
            </select>
          </label>

          <label className="task-modal__field">
            <span className="task-modal__label">Срок выполнения</span>
            <input
              className="task-modal__input"
              name="dueDate"
              type="datetime-local"
              value={form.dueDate}
              onChange={handleChange}
            />
          </label>

          {!employeesLoading && employees.length === 0 ? (
            <p className="task-modal__hint task-modal__hint--error">
              Сотрудники не найдены. Добавьте профили в разделе «Сотрудники».
            </p>
          ) : null}

          {error ? (
            <p className="task-modal__error" role="alert">
              {error}
            </p>
          ) : null}

          <div className="task-modal__actions">
            <Button
              type="button"
              className="task-modal__button--secondary"
              onClick={onClose}
              disabled={submitting}
            >
              Отмена
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? 'Сохранение...' : 'Сохранить'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default TaskModal