import { formatDate } from '../../shared/dates.ts'
import { householdAway, timeOffOn } from '../../shared/timeoff.ts'
import type { Assignment, TimeOff, User } from '../../shared/types.ts'
import { TaskRows } from './TaskRows.tsx'

interface Props {
  date: string
  today: string
  items: Assignment[]
  users: User[]
  timeOff: TimeOff[]
  onToggle: (assignment: Assignment) => void
  onReassign: (assignment: Assignment, userId: number) => void
}

export function DayPanel({ date, today, items, users, timeOff, onToggle, onReassign }: Props) {
  const off = timeOffOn(timeOff, date)
  const everyoneOff = householdAway(timeOff, date)
  const effort = items.reduce((sum, a) => sum + a.effort, 0)

  return (
    <section className="card day">
      <header className="day-head">
        <div>
          <p className="eyebrow">{date === today ? 'Today' : formatDate(date, { weekday: 'long' })}</p>
          <h2>{formatDate(date, { day: 'numeric', month: 'long' })}</h2>
        </div>
        {items.length > 0 && (
          <span className="pill">
            {effort} effort {effort === 1 ? 'point' : 'points'}
          </span>
        )}
      </header>

      {off.map((p) => (
        <p key={p.id} className="off-note">
          {p.icon} {p.label} · {p.userId === null ? 'Everyone' : users.find((u) => u.id === p.userId)?.name}
        </p>
      ))}

      {items.length === 0 ? (
        <p className="empty">
          {everyoneOff ? 'No tasks while everyone is away.' : 'Nothing planned. Enjoy the day off ✨'}
        </p>
      ) : (
        <TaskRows
          date={date}
          today={today}
          items={items}
          users={users}
          onToggle={onToggle}
          onReassign={onReassign}
        />
      )}
    </section>
  )
}
