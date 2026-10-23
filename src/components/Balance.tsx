import type { Assignment, User } from '../../shared/types.ts'
import { Avatar, userColor } from './bits.tsx'

interface Props {
  label: string
  assignments: Assignment[]
  users: User[]
}

/** How the month's effort is split between the roommates. */
export function Balance({ label, assignments, users }: Props) {
  const stats = users.map((user) => {
    // A task counts for whoever did it, or else whoever it is planned for.
    const mine = assignments.filter((a) => (a.doneBy ?? a.userId) === user.id)
    return {
      user,
      effort: mine.reduce((sum, a) => sum + a.effort, 0),
      total: mine.length,
      done: mine.filter((a) => a.doneAt).length,
    }
  })
  const totalEffort = stats.reduce((sum, s) => sum + s.effort, 0)

  return (
    <section className="card balance">
      <header className="day-head">
        <div>
          <p className="eyebrow">Balance</p>
          <h2>{label}</h2>
        </div>
      </header>

      {totalEffort === 0 ? (
        <p className="empty">No tasks this month.</p>
      ) : (
        <>
          <div className="split" aria-hidden="true">
            {stats.map((s) => (
              <i key={s.user.id} style={{ ...userColor(s.user), flexGrow: s.effort }} />
            ))}
          </div>
          <ul className="balance-rows">
            {stats.map((s) => (
              <li key={s.user.id}>
                <Avatar user={s.user} />
                <div className="row-main">
                  <span className="row-name">{s.user.name}</span>
                  <span className="row-meta">
                    {s.done} of {s.total} tasks done
                  </span>
                </div>
                <div className="balance-score">
                  <strong>{s.effort}</strong>
                  <span>{Math.round((s.effort / totalEffort) * 100)}% of effort</span>
                </div>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  )
}
