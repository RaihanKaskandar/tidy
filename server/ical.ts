import express from 'express'
import { listAssignments } from './assignments.ts'
import { all } from './db.ts'
import { addDays, todayISO } from '../shared/dates.ts'
import type { User } from '../shared/types.ts'

// Calendar feeds: one subscribable .ics per person, so tasks show up in the
// phone's own calendar app. Calendar apps re-fetch the URL now and then, so
// reassigned and completed tasks follow along. Events are all-day, and marked
// "free" so they never make anyone look busy.

const DAYS_BACK = 14
const DAYS_AHEAD = 84

export const icalRouter = express.Router()

const escapeText = (text: string) =>
  text.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n')

/** Lines may be at most 75 bytes; longer ones continue on a line starting with a space. */
function fold(line: string): string {
  const parts: string[] = []
  let current = ''
  let bytes = 0
  for (const char of line) {
    const size = Buffer.byteLength(char)
    if (bytes + size > (parts.length === 0 ? 75 : 74)) {
      parts.push(current)
      current = ''
      bytes = 0
    }
    current += char
    bytes += size
  }
  parts.push(current)
  return parts.join('\r\n ')
}

const compact = (iso: string) => iso.replaceAll('-', '')

function buildCalendar(user: User): string {
  const today = todayISO()
  const items = listAssignments(addDays(today, -DAYS_BACK), addDays(today, DAYS_AHEAD)).filter(
    (a) => a.userId === user.id,
  )
  const stamp = new Date().toISOString().replace(/[-:]|\.\d+/g, '')

  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Tidy//Household cleaning//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${escapeText(`Tidy – ${user.name}`)}`,
    'REFRESH-INTERVAL;VALUE=DURATION:PT1H',
    'X-PUBLISHED-TTL:PT1H',
  ]
  for (const a of items) {
    lines.push(
      'BEGIN:VEVENT',
      `UID:task${a.taskId}-${a.date}@tidy`,
      `DTSTAMP:${stamp}`,
      `DTSTART;VALUE=DATE:${compact(a.date)}`,
      `DTEND;VALUE=DATE:${compact(addDays(a.date, 1))}`,
      `SUMMARY:${escapeText(`${a.doneAt ? '✓ ' : ''}${a.icon} ${a.name}`)}`,
      `DESCRIPTION:${escapeText(`Effort ${a.effort} of 5${a.doneAt ? ' · done' : ''}`)}`,
      'TRANSP:TRANSPARENT',
      'END:VEVENT',
    )
  }
  lines.push('END:VCALENDAR')
  return lines.map(fold).join('\r\n') + '\r\n'
}

/** /ical/alex.ics — a person is looked up by name (any case) or by id. */
icalRouter.get('/:file', (req, res) => {
  const key = decodeURIComponent(req.params.file)
    .replace(/\.ics$/i, '')
    .toLowerCase()
  const user = all<User>('SELECT id, name, color FROM users').find(
    (u) => u.name.toLowerCase() === key || String(u.id) === key,
  )
  if (!user) {
    res.status(404).type('text/plain').send('No such person')
    return
  }
  res
    .type('text/calendar; charset=utf-8')
    .set('Cache-Control', 'no-cache')
    .set('Content-Disposition', `inline; filename="tidy-${encodeURIComponent(user.name.toLowerCase())}.ics"`)
    .send(buildCalendar(user))
})
