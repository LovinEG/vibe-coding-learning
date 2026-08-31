import './TaskItem.css'

function TaskItem({ title, dueLabel }) {
  return (
    <li className="task-item">
      <span className="task-item__title">{title}</span>
      <span className="task-item__due">{dueLabel}</span>
    </li>
  )
}

export default TaskItem
