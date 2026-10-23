import { useCallback, useState } from 'react'
import { diffDays } from '../../shared/dates.ts'
import type { TimeOff, TimeOffInput, User } from '../../shared/types.ts'
import { PlusIcon } from './bits.tsx'
import { TimeOffForm, describeRange } from './TimeOffForm.tsx'

interface Props {
  periods: TimeOff[]
  users: User[]
  today: string
  onSave: (input: TimeOffInput, id?: number) => Promise<boolean>
  onDelete: (id: number) => Promise<boolean>
}

function when(period: TimeOff, today: string) {
  if (period.startDate <= today) return 'Now'
  const days = diffDays(period.startDate, today)
  return days === 1 ? 'Tomorrow' : `In ${days} days`
}

export function TimeOffCard({ periods, users, today, onSave, onDelete }: Props) {
  const [editing, setEditing] = useState<TimeOff | 'new' | null>(null)
  const close = useCallback(() => setEditing(null), [])
  const period = editing === 'new' ? null : editing

  return (
    <section className="card timeoff">
      <div className="timeoff-head">
        <div>
          <h2>Time off</h2>
          <p className="muted">Holidays or exam weeks. Tasks skip these days, or move to the other person.</p>
        </div>
        <button className="btn" onClick={() => setEditing('new')}>
          <PlusIcon />
          Add
        </button>
      </div>

      {periods.length > 0 && (
        <ul className="timeoff-list">
          {periods.map((p) => {
            const { range, days } = describeRange(p.startDate, p.endDate)
            const who = p.userId === null ? 'Everyone' : (users.find((u) => u.id === p.userId)?.name ?? '')
            return (
              <li key={p.id}>
                <button className="timeoff-item" onClick={() => setEditing(p)}>
                  <span className="timeoff-icon">{p.icon}</span>
                  <span className="row-main">
                    <span className="row-name">{p.label}</span>
                    <span className="row-meta">
                      {range} · {days} · {who}
                    </span>
                  </span>
                  <span className={p.startDate <= today ? 'pill now' : 'pill'}>{when(p, today)}</span>
                </button>
              </li>
            )
          })}
        </ul>
      )}

      {editing && (
        <TimeOffForm
          period={period}
          users={users}
          today={today}
          onClose={close}
          onSave={async (input) => {
            if (await onSave(input, period?.id)) close()
          }}
          onDelete={async () => {
            if (period && (await onDelete(period.id))) close()
          }}
        />
      )}
    </section>
  )
}
