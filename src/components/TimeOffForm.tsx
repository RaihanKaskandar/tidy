import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { addDays, diffDays, formatDate, weekdayIndex } from '../../shared/dates.ts'
import type { TimeOff, TimeOffInput, User } from '../../shared/types.ts'

const LABELS = [
  { label: 'Holiday', icon: '🏖️' },
  { label: 'Exam week', icon: '📚' },
  { label: 'Sick', icon: '🤒' },
  { label: 'Work trip', icon: '✈️' },
  { label: 'Busy', icon: '💼' },
]
const CUSTOM_ICONS = ['🗓️', '🏠', '🎉', '🏥', '⛰️', '🎓', '👪', '🚗']

interface Props {
  period: TimeOff | null
  users: User[]
  today: string
  onSave: (input: TimeOffInput) => Promise<void>
  onDelete: () => Promise<void>
  onClose: () => void
}

/** Describes a stretch of days like "Mon 12 Oct – Sun 18 Oct · 7 days". */
export function describeRange(start: string, end: string) {
  const days = diffDays(end, start) + 1
  const short = (d: string) => formatDate(d, { month: 'short', day: 'numeric' })
  const range =
    start === end
      ? short(start)
      : start.slice(0, 7) === end.slice(0, 7)
        ? `${short(start)}–${Number(end.slice(8))}`
        : `${short(start)} – ${short(end)}`
  return { range, days: `${days} ${days === 1 ? 'day' : 'days'}` }
}

export function TimeOffForm({ period, users, today, onSave, onDelete, onClose }: Props) {
  const preset = LABELS.find((l) => l.label === period?.label)
  const [choice, setChoice] = useState<string>(period ? (preset ? preset.label : 'Custom') : 'Holiday')
  const [customLabel, setCustomLabel] = useState(period && !preset ? period.label : '')
  const [customIcon, setCustomIcon] = useState(period && !preset ? period.icon : CUSTOM_ICONS[0])
  const [userId, setUserId] = useState<number | null>(period?.userId ?? null)
  const [startDate, setStartDate] = useState(period?.startDate ?? today)
  const [endDate, setEndDate] = useState(period?.endDate ?? addDays(today, 6))
  const [busy, setBusy] = useState(false)

  const isCustom = choice === 'Custom'
  const label = isCustom ? customLabel.trim() : choice
  const icon = isCustom ? customIcon : (preset ?? LABELS.find((l) => l.label === choice))!.icon
  const valid = label !== '' && startDate !== '' && endDate >= startDate && endDate >= today

  const thisSunday = addDays(today, 6 - weekdayIndex(today))
  const nextMonday = addDays(thisSunday, 1)
  const quick = [
    { name: 'This week', start: today, end: thisSunday },
    { name: 'Next week', start: nextMonday, end: addDays(nextMonday, 6) },
    { name: 'Next 2 weeks', start: nextMonday, end: addDays(nextMonday, 13) },
  ]

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => event.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  function changeStart(value: string) {
    setStartDate(value)
    if (value && endDate < value) setEndDate(value)
  }

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (!valid || busy) return
    setBusy(true)
    await onSave({ label, icon, startDate, endDate, userId })
    setBusy(false)
  }

  async function remove() {
    if (!period || !window.confirm(`Remove "${period.label}"? Tasks in those days come back.`)) return
    setBusy(true)
    await onDelete()
    setBusy(false)
  }

  const away = users.find((u) => u.id === userId)
  const others = users.filter((u) => u.id !== userId)
  const summary = valid ? describeRange(startDate, endDate) : null

  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <form
        className="sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby="timeoff-title"
        onSubmit={submit}
      >
        <h2 id="timeoff-title">{period ? 'Edit time off' : 'Plan time off'}</h2>

        <div className="field">
          <span className="field-label">What is it?</span>
          <div className="presets">
            {LABELS.map((l) => (
              <button
                key={l.label}
                type="button"
                className="preset"
                aria-pressed={choice === l.label}
                onClick={() => setChoice(l.label)}
              >
                {l.icon} {l.label}
              </button>
            ))}
            <button
              type="button"
              className="preset"
              aria-pressed={isCustom}
              onClick={() => setChoice('Custom')}
            >
              ✏️ Other
            </button>
          </div>
          {isCustom && (
            <>
              <input
                className="input"
                value={customLabel}
                maxLength={40}
                placeholder="e.g. Moving house"
                autoFocus
                onChange={(e) => setCustomLabel(e.target.value)}
              />
              <div className="icon-grid">
                {CUSTOM_ICONS.map((choice) => (
                  <button
                    key={choice}
                    type="button"
                    className="icon-choice"
                    aria-pressed={choice === customIcon}
                    onClick={() => setCustomIcon(choice)}
                  >
                    {choice}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>

        <div className="field">
          <span className="field-label">Who is away?</span>
          <div className="segmented" role="group" aria-label="Who is away">
            <button type="button" aria-pressed={userId === null} onClick={() => setUserId(null)}>
              Everyone
            </button>
            {users.map((u) => (
              <button key={u.id} type="button" aria-pressed={userId === u.id} onClick={() => setUserId(u.id)}>
                {u.name}
              </button>
            ))}
          </div>
          <span className="hint">
            {away
              ? `${away.name} gets no tasks, so ${others.map((u) => u.name).join(' and ')} take${others.length === 1 ? 's' : ''} them over.`
              : 'No tasks are planned on these days.'}
          </span>
        </div>

        <div className="field">
          <span className="field-label">
            When
            {summary && (
              <small>
                {summary.range} · {summary.days}
              </small>
            )}
          </span>
          <div className="presets">
            {quick.map((q) => (
              <button
                key={q.name}
                type="button"
                className="preset"
                aria-pressed={startDate === q.start && endDate === q.end}
                onClick={() => {
                  setStartDate(q.start)
                  setEndDate(q.end)
                }}
              >
                {q.name}
              </button>
            ))}
          </div>
          <div className="date-pair">
            <label>
              <span className="hint">From</span>
              <input
                className="input"
                type="date"
                value={startDate}
                min={period ? undefined : today}
                onChange={(e) => changeStart(e.target.value)}
              />
            </label>
            <label>
              <span className="hint">Until (including)</span>
              <input
                className="input"
                type="date"
                value={endDate}
                min={startDate || today}
                onChange={(e) => setEndDate(e.target.value)}
              />
            </label>
          </div>
        </div>

        <div className="sheet-actions">
          {period && (
            <button type="button" className="btn danger" disabled={busy} onClick={remove}>
              Remove
            </button>
          )}
          <span className="spacer" />
          <button type="button" className="btn" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn primary" disabled={!valid || busy}>
            {period ? 'Save' : 'Add'}
          </button>
        </div>
      </form>
    </div>
  )
}
