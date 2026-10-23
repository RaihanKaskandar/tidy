import { useEffect, useState } from 'react'
import { addDays, formatDate } from '../../shared/dates.ts'
import type { Assignment } from '../../shared/types.ts'
import { api } from '../api.ts'

const DAYS = 14

interface Props {
  assignment: Assignment
  today: string
  onMove: (date: string) => void
  onClose: () => void
}

/** A list of the next two weeks to move a task to, with how busy each day already is. */
export function MoveSheet({ assignment, today, onMove, onClose }: Props) {
  const [load, setLoad] = useState<Map<string, { count: number; effort: number }> | null>(null)

  useEffect(() => {
    let stale = false
    api
      .assignments(today, addDays(today, DAYS - 1))
      .then((list) => {
        if (stale) return
        const map = new Map<string, { count: number; effort: number }>()
        for (const a of list) {
          const day = map.get(a.date) ?? { count: 0, effort: 0 }
          day.count += 1
          day.effort += a.effort
          map.set(a.date, day)
        }
        setLoad(map)
      })
      .catch(() => !stale && setLoad(new Map()))
    return () => {
      stale = true
    }
  }, [today])

  const label = (date: string) =>
    date === today ? 'Today' : date === addDays(today, 1) ? 'Tomorrow' : formatDate(date, { weekday: 'long' })

  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="sheet" role="dialog" aria-modal="true" aria-labelledby="move-title">
        <div>
          <h2 id="move-title">Move to another day</h2>
          <p className="muted">
            {assignment.icon} {assignment.name}
          </p>
        </div>

        <ul className="move-days">
          {Array.from({ length: DAYS }, (_, i) => addDays(today, i)).map((date) => {
            const current = date === assignment.date
            const day = load?.get(date)
            return (
              <li key={date}>
                <button className="move-day" disabled={current} onClick={() => onMove(date)}>
                  <span className="move-day-name">
                    {label(date)}
                    <small>{formatDate(date, { day: 'numeric', month: 'short' })}</small>
                  </span>
                  <span className="move-day-load">
                    {current
                      ? 'Planned here'
                      : !load
                        ? ''
                        : day
                          ? `${day.count} ${day.count === 1 ? 'task' : 'tasks'} · effort ${day.effort}`
                          : 'Free'}
                  </span>
                </button>
              </li>
            )
          })}
        </ul>

        <div className="sheet-actions">
          <span className="spacer" />
          <button className="btn" onClick={onClose}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}
