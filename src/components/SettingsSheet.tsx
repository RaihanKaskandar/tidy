import { useState } from 'react'
import { MAX_USERS, PERSON_COLORS } from '../../shared/rules.ts'
import type { User, UserInput } from '../../shared/types.ts'
import type { Look, Theme } from '../theme.ts'
import { Avatar, PlusIcon } from './bits.tsx'

const THEMES: { value: Theme; label: string }[] = [
  { value: 'auto', label: 'Auto' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
]

interface Props {
  users: User[]
  theme: Theme
  look: Look
  onTheme: (theme: Theme) => void
  onLook: (look: Look) => void
  onAddPerson: (input: UserInput) => Promise<boolean>
  onUpdatePerson: (id: number, input: UserInput) => Promise<boolean>
  onClose: () => void
}

const feedPath = (user: User) => `/ical/${encodeURIComponent(user.name.toLowerCase())}.ics`

export function SettingsSheet({
  users,
  theme,
  look,
  onTheme,
  onLook,
  onAddPerson,
  onUpdatePerson,
  onClose,
}: Props) {
  const [copied, setCopied] = useState<number | null>(null)
  const [newName, setNewName] = useState('')

  async function addPerson() {
    const name = newName.trim()
    if (!name) return
    const color = PERSON_COLORS.find((c) => !users.some((u) => u.color === c)) ?? PERSON_COLORS[0]
    if (await onAddPerson({ name, color })) setNewName('')
  }

  async function copy(user: User) {
    const url = `${location.origin}${feedPath(user)}`
    try {
      await navigator.clipboard.writeText(url)
    } catch {
      // Clipboard needs https; fall back to a prompt the link can be copied from.
      window.prompt('Copy this calendar link', url)
    }
    setCopied(user.id)
    setTimeout(() => setCopied((id) => (id === user.id ? null : id)), 1800)
  }

  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="sheet" role="dialog" aria-modal="true" aria-labelledby="settings-title">
        <h2 id="settings-title">Settings</h2>

        <div className="field">
          <span className="field-label">Appearance</span>
          <div className="segmented" role="group" aria-label="Appearance">
            {THEMES.map(({ value, label }) => (
              <button key={value} aria-pressed={theme === value} onClick={() => onTheme(value)}>
                {label}
              </button>
            ))}
          </div>
          <span className="hint">Auto follows your device's light or dark setting.</span>
        </div>

        <div className="field">
          <div className="switch-row">
            <div>
              <span className="field-label">
                Glass style <span className="badge">Experimental</span>
              </span>
              <span className="hint">Frosted, translucent panels. May look rough in places.</span>
            </div>
            <button
              className="switch"
              role="switch"
              aria-checked={look === 'glass'}
              aria-label="Glass style"
              onClick={() => onLook(look === 'glass' ? 'classic' : 'glass')}
            />
          </div>
        </div>

        <div className="field">
          <span className="field-label">People</span>
          <ul className="people">
            {users.map((user) => (
              <li key={user.id}>
                <Avatar user={user} small />
                <input
                  className="input"
                  defaultValue={user.name}
                  maxLength={30}
                  aria-label={`Name of ${user.name}`}
                  onBlur={(e) => {
                    const name = e.target.value.trim()
                    if (name && name !== user.name) void onUpdatePerson(user.id, { name, color: user.color })
                    else e.target.value = user.name
                  }}
                />
                <input
                  className="color-input"
                  type="color"
                  value={user.color}
                  aria-label={`Colour of ${user.name}`}
                  onChange={(e) => void onUpdatePerson(user.id, { name: user.name, color: e.target.value })}
                />
              </li>
            ))}
          </ul>
          {users.length < MAX_USERS && (
            <div className="add-person">
              <input
                className="input"
                value={newName}
                maxLength={30}
                placeholder="Add a person"
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && void addPerson()}
              />
              <button className="btn" disabled={!newName.trim()} onClick={() => void addPerson()}>
                <PlusIcon />
                Add
              </button>
            </div>
          )}
        </div>

        <div className="field">
          <span className="field-label">Calendar feeds</span>
          <ul className="feeds">
            {users.map((user) => (
              <li key={user.id}>
                <Avatar user={user} small />
                <span className="feed-name">{user.name}</span>
                <a className="btn" href={`webcal://${location.host}${feedPath(user)}`}>
                  Subscribe
                </a>
                <button className="btn" onClick={() => copy(user)}>
                  {copied === user.id ? 'Copied' : 'Copy link'}
                </button>
              </li>
            ))}
          </ul>
          <span className="hint">
            Adds the tasks to your phone's calendar and keeps them up to date. Anyone with the link can see
            them.
          </span>
        </div>

        <a className="btn" href="/eink">
          Open e-ink view
        </a>

        <div className="sheet-actions">
          <span className="spacer" />
          <button className="btn primary" onClick={onClose}>
            Done
          </button>
        </div>
      </div>
    </div>
  )
}
