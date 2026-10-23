import { addDays, formatDate } from '../../shared/dates.ts'
import { householdAway, timeOffOn } from '../../shared/timeoff.ts'
import type { Assignment, TimeOff, User } from '../../shared/types.ts'
import { ChevronLeft, ChevronRight } from './bits.tsx'
import { dropClass, useDrag } from './drag.tsx'
import { TaskRows } from './TaskRows.tsx'

interface Props {
  /** The Monday the week starts on. */
  start: string
  today: string
  byDate: Map<string, Assignment[]>
  users: User[]
  timeOff: TimeOff[]
  mineOnly: boolean
  onWeekChange: (by: number) => void
  onToday: () => void
  onMineOnlyChange: (mineOnly: boolean) => void
  onToggle: (assignment: Assignment) => void
  onReassign: (assignment: Assignment, userId: number) => void
}

export function WeekView(props: Props) {
  const { start, today, byDate, users, timeOff, mineOnly } = props
  const { drag } = useDrag()
  const days = Array.from({ length: 7 }, (_, i) => addDays(start, i))
  const all = days.flatMap((date) => byDate.get(date) ?? [])
  const done = all.filter((a) => a.doneAt).length
  const end = days[6]
  const sameMonth = start.slice(0, 7) === end.slice(0, 7)
  const range = sameMonth
    ? `${formatDate(start, { day: 'numeric' })} – ${formatDate(end, { day: 'numeric', month: 'long' })}`
    : `${formatDate(start, { day: 'numeric', month: 'short' })} – ${formatDate(end, { day: 'numeric', month: 'short' })}`

  return (
    <main className="week">
      <header className="week-head">
        <div>
          <h1 className="week-title">{range}</h1>
          <p className="muted">{all.length === 0 ? 'No tasks this week' : `${done} of ${all.length} done`}</p>
        </div>
        <div className="cal-nav">
          <button className="icon-btn" aria-label="Previous week" onClick={() => props.onWeekChange(-1)}>
            <ChevronLeft />
          </button>
          <button className="btn" onClick={props.onToday}>
            Today
          </button>
          <button className="icon-btn" aria-label="Next week" onClick={() => props.onWeekChange(1)}>
            <ChevronRight />
          </button>
        </div>
      </header>

      <div className="segmented" role="group" aria-label="Whose tasks to show">
        <button aria-pressed={!mineOnly} onClick={() => props.onMineOnlyChange(false)}>
          Everyone
        </button>
        <button aria-pressed={mineOnly} onClick={() => props.onMineOnlyChange(true)}>
          Mine
        </button>
      </div>

      <div className="card week-list">
        {days.map((date) => {
          const items = byDate.get(date) ?? []
          const off = timeOffOn(timeOff, date)
          const closed = !!householdAway(timeOff, date)
          return (
            <section
              key={date}
              className={[
                'wday',
                date === today ? 'today' : '',
                closed ? 'closed' : '',
                closed && drag ? 'drop-no' : dropClass(drag, date, today),
              ].join(' ')}
              data-drop-date={date}
              data-drop-ok={date >= today && !closed}
            >
              <div className="wday-date">
                <span>{formatDate(date, { weekday: 'short' })}</span>
                <b>{Number(date.slice(8))}</b>
              </div>
              <div className="wday-body">
                {off.map((p) => (
                  <p key={p.id} className="off-note">
                    {p.icon} {p.label} ·{' '}
                    {p.userId === null ? 'Everyone' : users.find((u) => u.id === p.userId)?.name}
                  </p>
                ))}
                {items.length === 0 ? (
                  <p className="wday-empty">{closed ? 'No tasks' : 'Nothing planned'}</p>
                ) : (
                  <TaskRows
                    date={date}
                    today={today}
                    items={items}
                    users={users}
                    onToggle={props.onToggle}
                    onReassign={props.onReassign}
                  />
                )}
              </div>
            </section>
          )
        })}
      </div>
    </main>
  )
}
