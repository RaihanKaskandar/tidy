import { useCallback, useState } from 'react'
import { formatInterval } from '../../shared/dates.ts'
import { isWeekendOnly } from '../../shared/rules.ts'
import type { Task, TaskInput, TimeOff, TimeOffInput, User } from '../../shared/types.ts'
import { EFFORT_LABELS, Effort, PlusIcon } from './bits.tsx'
import { TaskForm } from './TaskForm.tsx'
import { TimeOffCard } from './TimeOffCard.tsx'

interface Props {
  tasks: Task[]
  users: User[]
  today: string
  timeOff: TimeOff[]
  onSaveTimeOff: (input: TimeOffInput, id?: number) => Promise<boolean>
  onDeleteTimeOff: (id: number) => Promise<boolean>
  /** Each handler resolves to whether the change went through. */
  onSave: (input: TaskInput, id?: number) => Promise<boolean>
  onDelete: (id: number) => Promise<boolean>
  onRebalance: () => Promise<boolean>
}

export function TasksView({
  tasks,
  users,
  today,
  timeOff,
  onSaveTimeOff,
  onDeleteTimeOff,
  onSave,
  onDelete,
  onRebalance,
}: Props) {
  const [editing, setEditing] = useState<Task | 'new' | null>(null)
  const [rebalanced, setRebalanced] = useState(false)
  const close = useCallback(() => setEditing(null), [])

  const task = editing === 'new' ? null : editing

  /** When a task is planned, e.g. "Every 2 weeks · with Vacuum". */
  function rhythm(t: Task) {
    const leader = tasks.find((other) => other.id === t.afterTaskId)
    const rule = leader ? `with ${leader.name}` : isWeekendOnly(t, tasks) ? 'weekends' : ''
    return [formatInterval(t.intervalDays), rule].filter(Boolean).join(' · ')
  }

  const weeklyEffort = Math.round(tasks.reduce((sum, t) => sum + (t.effort * 7) / t.intervalDays, 0))

  async function rebalance() {
    const message =
      'Re-plan all upcoming tasks? Completed tasks stay as they are, manual hand-overs are reset.'
    if (window.confirm(message)) setRebalanced(await onRebalance())
  }

  return (
    <main className="tasks">
      <div className="page-head">
        <div>
          <h1>Tasks</h1>
          <p className="muted">
            {tasks.length} {tasks.length === 1 ? 'task' : 'tasks'} · about {weeklyEffort} effort points a week
          </p>
        </div>
        <button className="btn primary" onClick={() => setEditing('new')}>
          <PlusIcon />
          Add task
        </button>
      </div>

      <TimeOffCard
        periods={timeOff}
        users={users}
        today={today}
        onSave={onSaveTimeOff}
        onDelete={onDeleteTimeOff}
      />

      {tasks.length === 0 ? (
        <p className="card empty">No tasks yet. Add the first one to start filling the calendar.</p>
      ) : (
        <ul className="task-grid">
          {tasks.map((t) => (
            <li key={t.id}>
              <button className="card task-card" onClick={() => setEditing(t)}>
                <span className="task-icon">{t.icon}</span>
                <span className="row-main">
                  <span className="row-name">{t.name}</span>
                  <span className="row-meta">{rhythm(t)}</span>
                </span>
                <span className="task-effort">
                  <Effort value={t.effort} />
                  <span>{EFFORT_LABELS[t.effort]}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      <section className="card rebalance">
        <div>
          <h2>Rebalance the schedule</h2>
          <p className="muted">
            Spreads all upcoming tasks evenly over the days again and re-divides them fairly between you.
          </p>
        </div>
        <button className="btn" onClick={rebalance}>
          {rebalanced ? 'Rebalanced ✓' : 'Rebalance'}
        </button>
      </section>

      {editing && (
        <TaskForm
          task={task}
          tasks={tasks}
          onClose={close}
          onSave={async (input) => {
            if (await onSave(input, task?.id)) close()
          }}
          onDelete={async () => {
            if (task && (await onDelete(task.id))) close()
          }}
        />
      )}
    </main>
  )
}
