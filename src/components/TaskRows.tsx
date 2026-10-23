import type { Assignment, User } from '../../shared/types.ts'
import { Avatar, CheckIcon, Effort, GripIcon, userColor } from './bits.tsx'
import { useDrag } from './drag.tsx'

interface Props {
  date: string
  today: string
  items: Assignment[]
  users: User[]
  onToggle: (assignment: Assignment) => void
  onReassign: (assignment: Assignment, userId: number) => void
}

export function TaskRows({ date, today, items, users, onToggle, onReassign }: Props) {
  const userById = new Map(users.map((u) => [u.id, u]))
  const { drag, begin, pick } = useDrag()

  return (
    <ul className="rows">
      {items.map((a) => {
        const done = !!a.doneAt
        const assignee = userById.get(a.userId)
        const doneBy = a.doneBy == null ? undefined : userById.get(a.doneBy)
        const shown = (done && doneBy) || assignee
        const next = users[(users.findIndex((u) => u.id === a.userId) + 1) % users.length]
        const canReassign = !done && next && next.id !== a.userId

        return (
          <li
            key={a.id}
            className={['row', done ? 'done' : '', drag?.assignment.id === a.id ? 'dragging' : ''].join(' ')}
            style={userColor(shown)}
          >
            {!done && (
              <button
                className="grip"
                aria-label={`Move ${a.name} to another day`}
                title="Drag to another day, or tap to choose one"
                onPointerDown={(e) => begin(e, a)}
                onClick={(e) => e.detail === 0 && pick(a)}
                onContextMenu={(e) => e.preventDefault()}
              >
                <GripIcon />
              </button>
            )}
            <button
              className="check"
              role="checkbox"
              aria-checked={done}
              aria-label={`${a.name} done`}
              onClick={() => onToggle(a)}
            >
              {done && <CheckIcon />}
            </button>
            <span className="row-icon">{a.icon}</span>
            <div className="row-main">
              <span className="row-name">{a.name}</span>
              <span className="row-meta">
                <Effort value={a.effort} />
                {done ? (
                  <span>Done by {shown?.name}</span>
                ) : date < today ? (
                  <span className="missed">Missed</span>
                ) : (
                  <span>{assignee?.name}</span>
                )}
              </span>
            </div>
            {shown && (
              <button
                className="avatar-btn"
                disabled={!canReassign}
                title={canReassign ? `Hand over to ${next.name}` : undefined}
                aria-label={canReassign ? `Hand ${a.name} over to ${next.name}` : shown.name}
                onClick={() => onReassign(a, next.id)}
              >
                <Avatar user={shown} />
              </button>
            )}
          </li>
        )
      })}
    </ul>
  )
}
