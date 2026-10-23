import type { CSSProperties, ReactNode } from 'react'
import type { User } from '../../shared/types.ts'

export const EFFORT_LABELS = ['', 'Quick', 'Light', 'Moderate', 'Heavy', 'Very heavy']
export const EFFORT_HINTS = [
  '',
  'about 5 min',
  'about 15 min',
  'about 30 min',
  'about 45 min',
  'an hour or more',
]

/** Exposes a user's colour to CSS as `--c`. */
export const userColor = (user: User | undefined) => ({ '--c': user?.color ?? '#888' }) as CSSProperties

export function Avatar({ user, small }: { user: User; small?: boolean }) {
  return (
    <span className={`avatar${small ? ' small' : ''}`} style={userColor(user)} aria-hidden="true">
      {user.name.charAt(0).toUpperCase()}
    </span>
  )
}

export function Effort({ value }: { value: number }) {
  return (
    <span className="effort" role="img" aria-label={`Effort ${value} of 5`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <i key={n} className={n <= value ? 'on' : undefined} />
      ))}
    </span>
  )
}

function Icon({ children }: { children: ReactNode }) {
  return (
    <svg
      className="icon"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {children}
    </svg>
  )
}

export const CalendarIcon = () => (
  <Icon>
    <rect x="3" y="5" width="18" height="16" rx="3" />
    <path d="M3 10h18M8 3v4M16 3v4" />
  </Icon>
)

export const ListIcon = () => (
  <Icon>
    <path d="M9 6h11M9 12h11M9 18h11M4 6h.01M4 12h.01M4 18h.01" />
  </Icon>
)

export const ChevronLeft = () => (
  <Icon>
    <path d="M15 6l-6 6 6 6" />
  </Icon>
)

export const ChevronRight = () => (
  <Icon>
    <path d="M9 6l6 6-6 6" />
  </Icon>
)

export const PlusIcon = () => (
  <Icon>
    <path d="M12 5v14M5 12h14" />
  </Icon>
)

export const CheckIcon = () => (
  <Icon>
    <path d="M5 12.5l4.5 4.5L19 7.5" />
  </Icon>
)

export const WeekIcon = () => (
  <Icon>
    <rect x="3" y="4" width="18" height="16" rx="3" />
    <path d="M3 9h18M8 13h8M8 16.5h5" />
  </Icon>
)

export const GearIcon = () => (
  <Icon>
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />
  </Icon>
)

export const GripIcon = () => (
  <svg className="icon grip-icon" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    {[8, 12, 16].map((y) => (
      <g key={y}>
        <circle cx="9" cy={y} r="1.4" />
        <circle cx="15" cy={y} r="1.4" />
      </g>
    ))}
  </svg>
)
