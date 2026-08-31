import Card from '../ui/Card'
import TaskItem from '../ui/TaskItem'
import { tasks } from '../../data/dashboard'

function ImportantTasks() {
  return (
    <Card>
      <h2>Важные задачи</h2>
      <ul className="home-page__tasks">
        {tasks.map((task) => (
          <TaskItem key={task.title} title={task.title} dueLabel={task.due} />
        ))}
      </ul>
    </Card>
  )
}

export default ImportantTasks
