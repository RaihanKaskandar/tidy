import { useState } from 'react'
import type { FormEvent } from 'react'
import { MAX_USERS, PERSON_COLORS } from '../../shared/rules.ts'
import type { UserInput } from '../../shared/types.ts'
import { Avatar, PlusIcon } from './bits.tsx'

interface Props {
  onCreate: (people: UserInput[]) => Promise<void>
}

/** Shown on first use, when nobody lives in the household yet. */
export function SetupScreen({ onCreate }: Props) {
  const [names, setNames] = useState(['', ''])
  const [busy, setBusy] = useState(false)

  const people = names
    .map((name, i) => ({ name: name.trim(), color: PERSON_COLORS[i] }))
    .filter((p) => p.name)
  const valid = people.length > 0 && new Set(people.map((p) => p.name.toLowerCase())).size === people.length

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (!valid || busy) return
    setBusy(true)
    await onCreate(people)
    setBusy(false)
  }

  return (
    <div className="splash">
      <form className="card welcome" onSubmit={submit}>
        <span className="brand-mark">🧹</span>
        <h1>Welcome to Tidy</h1>
        <p className="muted">Who shares the chores? Tasks are divided fairly between everyone you add.</p>

        <div className="setup-people">
          {names.map((name, i) => (
            <label key={i} className="setup-person">
              <Avatar user={{ id: i, name: name.trim() || '?', color: PERSON_COLORS[i] }} />
              <input
                className="input"
                value={name}
                maxLength={30}
                placeholder={`Person ${i + 1}`}
                autoFocus={i === 0}
                onChange={(e) => setNames(names.map((n, j) => (j === i ? e.target.value : n)))}
              />
            </label>
          ))}
        </div>

        {names.length < MAX_USERS && (
          <button type="button" className="btn" onClick={() => setNames([...names, ''])}>
            <PlusIcon />
            Add another person
          </button>
        )}

        <button type="submit" className="btn primary" disabled={!valid || busy}>
          Get started
        </button>
        <p className="hint">You can add people and rename them later in Settings.</p>
      </form>
    </div>
  )
}
