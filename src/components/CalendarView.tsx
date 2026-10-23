import { formatDate } from '../../shared/dates.ts'
import { householdAway, timeOffOn } from '../../shared/timeoff.ts'
import type { Assignment, TimeOff, User } from '../../shared/types.ts'
import { ChevronLeft, ChevronRight, userColor } from './bits.tsx'
import { dropClass, useDrag } from './drag.tsx'

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const MAX_CHIPS = 3
const MAX_DOTS = 5

interface Props {
  month: string
  days: string[]
  byDate: Map<string, Assignment[]>
  users: User[]
  timeOff: TimeOff[]
  today: string
  selected: string
  mineOnly: boolean
  onSelect: (date: string) => void
  onMonthChange: (by: number) => void
  onToday: () => void
  onMineOnlyChange: (mineOnly: boolean) => void
}

export function CalendarView(props: Props) {
  const { month, days, byDate, users, timeOff, today, selected, mineOnly } = props
  const userById = new Map(users.map((u) => [u.id, u]))
  const { drag } = useDrag()
  const first = `${month}-01`

  return (
    <section className="card calendar">
      <div className="cal-head">
        <h1 className="cal-title">
          {formatDate(first, { month: 'long' })} <span>{formatDate(first, { year: 'numeric' })}</span>
        </h1>
        <div className="cal-nav">
          <button className="btn" onClick={props.onToday}>
            Today
          </button>
          <button className="icon-btn" aria-label="Previous month" onClick={() => props.onMonthChange(-1)}>
            <ChevronLeft />
          </button>
          <button className="icon-btn" aria-label="Next month" onClick={() => props.onMonthChange(1)}>
            <ChevronRight />
          </button>
        </div>
        <div className="segmented" role="group" aria-label="Whose tasks to show">
          <button aria-pressed={!mineOnly} onClick={() => props.onMineOnlyChange(false)}>
            Everyone
          </button>
          <button aria-pressed={mineOnly} onClick={() => props.onMineOnlyChange(true)}>
            Mine
          </button>
        </div>
      </div>

      <div className="grid">
        {WEEKDAYS.map((day) => (
          <div key={day} className="weekday">
            {day}
          </div>
        ))}
        {days.map((date) => {
          const items = byDate.get(date) ?? []
          const off = timeOffOn(timeOff, date)
          const closed = !!householdAway(timeOff, date)
          const className = [
            'cell',
            date.startsWith(month) ? '' : 'out',
            date === today ? 'today' : '',
            date === selected ? 'selected' : '',
            closed ? 'closed' : '',
            closed && drag ? 'drop-no' : dropClass(drag, date, today),
          ].join(' ')
          return (
            <button
              key={date}
              className={className}
              data-drop-date={date}
              data-drop-ok={date >= today && !closed}
              aria-pressed={date === selected}
              aria-label={`${formatDate(date, { weekday: 'long', day: 'numeric', month: 'long' })}, ${items.length} tasks`}
              onClick={() => props.onSelect(date)}
            >
              <span className="cell-num">{Number(date.slice(8))}</span>
              {off.length > 0 && (
                <span className="cell-off" aria-label={off.map((p) => p.label).join(', ')}>
                  {off[0].icon}
                </span>
              )}
              <span className="cell-dots">
                {items.slice(0, MAX_DOTS).map((a) => (
                  <i
                    key={a.id}
                    className={a.doneAt ? 'dot done' : 'dot'}
                    style={userColor(userById.get(a.userId))}
                  />
                ))}
              </span>
              <span className="cell-chips">
                {items.slice(0, MAX_CHIPS).map((a) => (
                  <span
                    key={a.id}
                    className={a.doneAt ? 'chip done' : 'chip'}
                    style={userColor(userById.get(a.userId))}
                  >
                    <span>{a.icon}</span>
                    <span className="chip-name">{a.name}</span>
                  </span>
                ))}
                {items.length > MAX_CHIPS && (
                  <span className="chip-more">+{items.length - MAX_CHIPS} more</span>
                )}
              </span>
            </button>
          )
        })}
      </div>

      <div className="legend">
        {users.map((user) => (
          <span key={user.id} style={userColor(user)}>
            <i className="dot" />
            {user.name}
          </span>
        ))}
        <a className="legend-link" href="/eink">
          E-ink view
        </a>
      </div>
    </section>
  )
}
