import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { formatInterval } from '../../shared/dates.ts'
import { HEAVY_EFFORT } from '../../shared/rules.ts'
import type { Task, TaskInput } from '../../shared/types.ts'
import { EFFORT_HINTS, EFFORT_LABELS } from './bits.tsx'

const ICONS = [
  '🧹',
  '🪣',
  '🧽',
  '🚿',
  '🚽',
  '🛁',
  '🍽️',
  '🍳',
  '🧊',
  '🗑️',
  '♻️',
  '🪟',
  '🧺',
  '👕',
  '🛏️',
  '🪴',
  '🛒',
  '🪶',
  '🐾',
  '✨',
]
const PRESETS = [1, 3, 7, 14, 28]

interface Props {
  task: Task | null
  /** Every task, to offer the ones this task can share a day with. */
  tasks: Task[]
  onSave: (input: TaskInput) => Promise<void>
  onDelete: () => Promise<void>
  onClose: () => void
}

export function TaskForm({ task, tasks, onSave, onDelete, onClose }: Props) {
  const [name, setName] = useState(task?.name ?? '')
  const [icon, setIcon] = useState(task?.icon ?? ICONS[0])
  const [effort, setEffort] = useState(task?.effort ?? 2)
  const [intervalDays, setIntervalDays] = useState(task?.intervalDays ?? 7)
  const [unit, setUnit] = useState<'days' | 'weeks'>(intervalDays % 7 === 0 ? 'weeks' : 'days')
  const [afterTaskId, setAfterTaskId] = useState(task?.afterTaskId ?? null)
  const [busy, setBusy] = useState(false)

  const perUnit = unit === 'weeks' ? 7 : 1
  const count = intervalDays / perUnit
  const valid =
    name.trim() !== '' && Number.isInteger(intervalDays) && intervalDays >= 1 && intervalDays <= 365
  const icons = ICONS.includes(icon) ? ICONS : [icon, ...ICONS]
  // Links are one level deep: a task follows a task that follows nothing itself.
  const followers = tasks.filter((t) => task && t.afterTaskId === task.id)
  const leaders = tasks.filter((t) => t.id !== task?.id && t.afterTaskId === null)

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => event.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  function pickPreset(days: number) {
    setIntervalDays(days)
    setUnit(days % 7 === 0 ? 'weeks' : 'days')
  }

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (!valid || busy) return
    setBusy(true)
    await onSave({ name: name.trim(), icon, effort, intervalDays, afterTaskId })
    setBusy(false)
  }

  async function remove() {
    if (!task || !window.confirm(`Delete "${task.name}"? Past entries stay in the calendar.`)) return
    setBusy(true)
    await onDelete()
    setBusy(false)
  }

  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <form
        className="sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby="task-form-title"
        onSubmit={submit}
      >
        <h2 id="task-form-title">{task ? 'Edit task' : 'New task'}</h2>

        <label className="field">
          <span className="field-label">Name</span>
          <input
            className="input"
            value={name}
            maxLength={60}
            placeholder="e.g. Vacuum the living room"
            autoFocus={!task}
            onChange={(e) => setName(e.target.value)}
          />
        </label>

        <div className="field">
          <span className="field-label">Icon</span>
          <div className="icon-grid">
            {icons.map((choice) => (
              <button
                key={choice}
                type="button"
                className="icon-choice"
                aria-pressed={choice === icon}
                onClick={() => setIcon(choice)}
              >
                {choice}
              </button>
            ))}
          </div>
        </div>

        <div className="field">
          <span className="field-label">
            Effort
            <small>
              {EFFORT_LABELS[effort]} · {EFFORT_HINTS[effort]}
            </small>
          </span>
          <div className="effort-picker">
            {[1, 2, 3, 4, 5].map((n) => (
              <button
                key={n}
                type="button"
                className={n <= effort ? 'on' : undefined}
                aria-pressed={n === effort}
                aria-label={`${n} of 5, ${EFFORT_LABELS[n]}`}
                onClick={() => setEffort(n)}
              >
                {n}
              </button>
            ))}
          </div>
          {effort >= HEAVY_EFFORT && <span className="hint">Heavy tasks are only planned on weekends.</span>}
        </div>

        <div className="field">
          <span className="field-label">How often</span>
          <div className="freq">
            <span>Every</span>
            <input
              className="input"
              type="number"
              inputMode="numeric"
              min={1}
              max={unit === 'weeks' ? 52 : 365}
              aria-label="Repeat count"
              value={count || ''}
              onChange={(e) => setIntervalDays(Math.floor(Number(e.target.value)) * perUnit)}
            />
            <select
              className="input"
              aria-label="Repeat unit"
              value={unit}
              onChange={(e) => {
                const next = e.target.value as 'days' | 'weeks'
                setUnit(next)
                setIntervalDays(count * (next === 'weeks' ? 7 : 1))
              }}
            >
              <option value="days">{count === 1 ? 'day' : 'days'}</option>
              <option value="weeks">{count === 1 ? 'week' : 'weeks'}</option>
            </select>
          </div>
          <div className="presets">
            {PRESETS.map((days) => (
              <button
                key={days}
                type="button"
                className="preset"
                aria-pressed={days === intervalDays}
                onClick={() => pickPreset(days)}
              >
                {formatInterval(days)}
              </button>
            ))}
          </div>
        </div>

        <label className="field">
          <span className="field-label">Same day as</span>
          <select
            className="input"
            value={afterTaskId ?? ''}
            disabled={followers.length > 0}
            onChange={(e) => setAfterTaskId(e.target.value ? Number(e.target.value) : null)}
          >
            <option value="">No other task</option>
            {leaders.map((t) => (
              <option key={t.id} value={t.id}>
                {t.icon} {t.name}
              </option>
            ))}
          </select>
          <span className="hint">
            {followers.length > 0
              ? `${followers.map((t) => t.name).join(', ')} already shares this task's days.`
              : 'Always plan this task on a day the other one is due, right after it. For example mopping after vacuuming.'}
          </span>
        </label>

        <div className="sheet-actions">
          {task && (
            <button type="button" className="btn danger" disabled={busy} onClick={remove}>
              Delete
            </button>
          )}
          <span className="spacer" />
          <button type="button" className="btn" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn primary" disabled={!valid || busy}>
            {task ? 'Save' : 'Add task'}
          </button>
        </div>
      </form>
    </div>
  )
}
