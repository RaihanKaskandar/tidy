import express from 'express'
import type { NextFunction, Request, Response } from 'express'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { getAssignment, listAssignments } from './assignments.ts'
import { all, get, run, transaction } from './db.ts'
import { einkRouter } from './eink.ts'
import { icalRouter } from './ical.ts'
import { anchorAll, reanchor, regenerateFuture } from './scheduler.ts'
import { seed } from './seed.ts'
import { applyTimeOff, listTimeOff } from './timeoff.ts'
import { diffDays, formatDate, isISODate, todayISO } from '../shared/dates.ts'
import { HEAVY_EFFORT, MAX_USERS } from '../shared/rules.ts'
import { householdAway } from '../shared/timeoff.ts'
import type { Task, TaskInput, TimeOff, TimeOffInput, User, UserInput } from '../shared/types.ts'

class HttpError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

const TASK_COLUMNS = 'id, name, icon, effort, interval_days AS intervalDays, after_task_id AS afterTaskId'

function parseTask(body: unknown): TaskInput {
  const input = (body ?? {}) as Record<string, unknown>
  const name = typeof input.name === 'string' ? input.name.trim() : ''
  const icon = typeof input.icon === 'string' ? input.icon.trim() : ''
  const effort = Number(input.effort)
  const intervalDays = Number(input.intervalDays)
  const afterTaskId = input.afterTaskId ?? null

  if (!name || name.length > 60) throw new HttpError(400, 'Name must be 1–60 characters')
  if (!icon || icon.length > 16) throw new HttpError(400, 'Pick an icon')
  if (!Number.isInteger(effort) || effort < 1 || effort > 5)
    throw new HttpError(400, 'Effort must be between 1 and 5')
  if (!Number.isInteger(intervalDays) || intervalDays < 1 || intervalDays > 365)
    throw new HttpError(400, 'Frequency must be between 1 and 365 days')
  if (afterTaskId !== null && (typeof afterTaskId !== 'number' || !Number.isInteger(afterTaskId)))
    throw new HttpError(400, 'Invalid task to share a day with')

  return { name, icon, effort, intervalDays, afterTaskId }
}

/** Links are one level deep: a task follows a task that follows nothing itself. */
function checkLink(afterTaskId: number | null, id?: number) {
  if (afterTaskId === null) return
  const leader = get<Task>(`SELECT ${TASK_COLUMNS} FROM tasks WHERE id = ? AND active = 1`, afterTaskId)
  if (!leader || leader.id === id) throw new HttpError(400, 'Pick another task to share a day with')
  if (leader.afterTaskId !== null) throw new HttpError(400, `${leader.name} already follows another task`)
  if (id !== undefined && get('SELECT 1 FROM tasks WHERE after_task_id = ? AND active = 1', id))
    throw new HttpError(400, 'Other tasks follow this one, so it cannot follow a task itself')
}

function parseUser(body: unknown): UserInput {
  const input = (body ?? {}) as Record<string, unknown>
  const name = typeof input.name === 'string' ? input.name.trim() : ''
  const color = typeof input.color === 'string' ? input.color.trim() : ''
  if (!name || name.length > 30) throw new HttpError(400, 'Name must be 1–30 characters')
  if (!/^#[0-9a-fA-F]{6}$/.test(color)) throw new HttpError(400, 'Pick a colour')
  return { name, color }
}

function nameTaken(name: string, exceptId = 0) {
  return !!get('SELECT 1 FROM users WHERE name = ? COLLATE NOCASE AND id != ?', name, exceptId)
}

function parseTimeOff(body: unknown): TimeOffInput {
  const input = (body ?? {}) as Record<string, unknown>
  const label = typeof input.label === 'string' ? input.label.trim() : ''
  const icon = typeof input.icon === 'string' ? input.icon.trim() : ''
  const { startDate, endDate } = input
  const userId = input.userId ?? null

  if (!label || label.length > 40) throw new HttpError(400, 'Label must be 1–40 characters')
  if (!icon || icon.length > 16) throw new HttpError(400, 'Pick an icon')
  if (!isISODate(startDate) || !isISODate(endDate)) throw new HttpError(400, 'Pick a start and end date')
  if (endDate < startDate) throw new HttpError(400, 'The end date comes before the start date')
  if (diffDays(endDate, startDate) > 365) throw new HttpError(400, 'Time off can be at most a year')
  if (endDate < todayISO()) throw new HttpError(400, 'That period is already over')
  if (userId !== null && (typeof userId !== 'number' || !userExists(userId))) {
    throw new HttpError(400, 'Unknown user')
  }
  return { label, icon, startDate, endDate, userId }
}

function parseId(value: unknown): number {
  const id = Number(value)
  if (!Number.isInteger(id) || id < 1) throw new HttpError(400, 'Invalid id')
  return id
}

const userExists = (id: number) => !!get('SELECT 1 FROM users WHERE id = ?', id)

seed()

const app = express()
app.use(express.json())

app.get('/api/users', (_req, res) => {
  res.json(all<User>('SELECT id, name, color FROM users ORDER BY id'))
})

app.post('/api/users', (req, res) => {
  const input = parseUser(req.body)
  const user = transaction(() => {
    if (all('SELECT 1 FROM users').length >= MAX_USERS)
      throw new HttpError(400, `At most ${MAX_USERS} people`)
    if (nameTaken(input.name)) throw new HttpError(409, `${input.name} is already in the household`)
    const id = Number(
      run('INSERT INTO users (name, color) VALUES (?, ?)', input.name, input.color).lastInsertRowid,
    )
    // A new person takes a fair share of the coming days.
    regenerateFuture(true)
    return { id, ...input } satisfies User
  })
  res.status(201).json(user)
})

app.put('/api/users/:id', (req, res) => {
  const id = parseId(req.params.id)
  const input = parseUser(req.body)
  if (!userExists(id)) throw new HttpError(404, 'Person not found')
  if (nameTaken(input.name, id)) throw new HttpError(409, `${input.name} is already in the household`)
  run('UPDATE users SET name = ?, color = ? WHERE id = ?', input.name, input.color, id)
  res.json({ id, ...input } satisfies User)
})

app.get('/api/timeoff', (_req, res) => {
  res.json(listTimeOff())
})

app.post('/api/timeoff', (req, res) => {
  const input = parseTimeOff(req.body)
  const created = transaction(() => {
    const result = run(
      'INSERT INTO time_off (label, icon, start_date, end_date, user_id) VALUES (?, ?, ?, ?, ?)',
      input.label,
      input.icon,
      input.startDate,
      input.endDate,
      input.userId,
    )
    applyTimeOff()
    return Number(result.lastInsertRowid)
  })
  res.status(201).json({ id: created, ...input } satisfies TimeOff)
})

app.put('/api/timeoff/:id', (req, res) => {
  const id = parseId(req.params.id)
  const input = parseTimeOff(req.body)
  transaction(() => {
    if (!get('SELECT 1 FROM time_off WHERE id = ?', id)) throw new HttpError(404, 'Time off not found')
    run(
      'UPDATE time_off SET label = ?, icon = ?, start_date = ?, end_date = ?, user_id = ? WHERE id = ?',
      input.label,
      input.icon,
      input.startDate,
      input.endDate,
      input.userId,
      id,
    )
    applyTimeOff()
  })
  res.json({ id, ...input } satisfies TimeOff)
})

app.delete('/api/timeoff/:id', (req, res) => {
  const id = parseId(req.params.id)
  transaction(() => {
    run('DELETE FROM time_off WHERE id = ?', id)
    applyTimeOff()
  })
  res.status(204).end()
})

app.get('/api/tasks', (_req, res) => {
  res.json(all<Task>(`SELECT ${TASK_COLUMNS} FROM tasks WHERE active = 1 ORDER BY interval_days, name`))
})

app.post('/api/tasks', (req, res) => {
  const task = parseTask(req.body)
  checkLink(task.afterTaskId)
  const id = transaction(() => {
    const result = run(
      `INSERT INTO tasks (name, icon, effort, interval_days, after_task_id, anchor_date)
       VALUES (?, ?, ?, ?, ?, ?)`,
      task.name,
      task.icon,
      task.effort,
      task.intervalDays,
      task.afterTaskId,
      todayISO(),
    )
    const id = Number(result.lastInsertRowid)
    reanchor([id])
    regenerateFuture()
    return id
  })
  res.status(201).json({ id, ...task })
})

app.put('/api/tasks/:id', (req, res) => {
  const id = parseId(req.params.id)
  const task = parseTask(req.body)
  const current = get<Task>(`SELECT ${TASK_COLUMNS} FROM tasks WHERE id = ? AND active = 1`, id)
  if (!current) throw new HttpError(404, 'Task not found')
  checkLink(task.afterTaskId, id)

  // Changes to which days the task may land on need a new start day.
  const daysChanged =
    task.intervalDays !== current.intervalDays ||
    task.afterTaskId !== current.afterTaskId ||
    task.effort >= HEAVY_EFFORT !== current.effort >= HEAVY_EFFORT

  transaction(() => {
    run(
      'UPDATE tasks SET name = ?, icon = ?, effort = ?, interval_days = ?, after_task_id = ? WHERE id = ?',
      task.name,
      task.icon,
      task.effort,
      task.intervalDays,
      task.afterTaskId,
      id,
    )
    if (daysChanged) reanchor([id])
    if (daysChanged || task.effort !== current.effort) regenerateFuture()
  })
  res.json({ id, ...task })
})

app.delete('/api/tasks/:id', (req, res) => {
  const id = parseId(req.params.id)
  transaction(() => {
    const result = run('UPDATE tasks SET active = 0 WHERE id = ? AND active = 1', id)
    if (!result.changes) throw new HttpError(404, 'Task not found')
    // Tasks that followed it keep their own rhythm from here on.
    run('UPDATE tasks SET after_task_id = NULL WHERE after_task_id = ?', id)
    regenerateFuture()
  })
  res.status(204).end()
})

app.get('/api/assignments', (req, res) => {
  const { from, to } = req.query
  if (!isISODate(from) || !isISODate(to) || to < from || diffDays(to, from) > 100) {
    throw new HttpError(400, 'Provide a valid from/to range of at most 100 days')
  }
  res.json(listAssignments(from, to))
})

app.patch('/api/assignments/:id', (req, res) => {
  const id = parseId(req.params.id)
  const { done, doneBy, userId, date } = (req.body ?? {}) as Record<string, unknown>
  const current = get<{ taskId: number; date: string; doneAt: string | null; name: string }>(
    `SELECT a.task_id AS taskId, a.date, a.done_at AS doneAt, t.name
       FROM assignments a JOIN tasks t ON t.id = a.task_id WHERE a.id = ?`,
    id,
  )
  if (!current) throw new HttpError(404, 'Assignment not found')

  transaction(() => {
    if (done === true) {
      if (typeof doneBy !== 'number' || !userExists(doneBy)) {
        throw new HttpError(400, 'Unknown user')
      }
      run("UPDATE assignments SET done_at = datetime('now'), done_by = ? WHERE id = ?", doneBy, id)
    } else if (done === false) {
      run('UPDATE assignments SET done_at = NULL, done_by = NULL WHERE id = ?', id)
    }
    if (userId !== undefined) {
      if (typeof userId !== 'number' || !userExists(userId)) {
        throw new HttpError(400, 'Unknown user')
      }
      run('UPDATE assignments SET user_id = ?, locked = 1 WHERE id = ?', userId, id)
    }
    if (date !== undefined && date !== current.date) {
      const today = todayISO()
      if (!isISODate(date) || date < today || diffDays(date, today) > 365) {
        throw new HttpError(400, 'Pick today or a later day')
      }
      if (current.doneAt) throw new HttpError(400, 'Completed tasks cannot be moved')
      const away = householdAway(listTimeOff(), date)
      if (away) throw new HttpError(400, `No tasks are planned during ${away.label}`)
      if (get('SELECT 1 FROM assignments WHERE task_id = ? AND date = ?', current.taskId, date)) {
        throw new HttpError(
          409,
          `${current.name} is already planned for ${formatDate(date, { weekday: 'long' })}`,
        )
      }
      run('UPDATE assignments SET date = ?, locked = 1 WHERE id = ?', date, id)
      // Moving back onto a vacated day fills it again; otherwise the old day must stay empty.
      run('DELETE FROM skips WHERE task_id = ? AND date = ?', current.taskId, date)
      run('INSERT OR IGNORE INTO skips (task_id, date) VALUES (?, ?)', current.taskId, current.date)
    }
  })
  res.json(getAssignment(id))
})

app.post('/api/schedule/rebalance', (_req, res) => {
  transaction(() => {
    anchorAll()
    regenerateFuture(false)
  })
  res.status(204).end()
})

app.use('/api', (_req, _res, next) => next(new HttpError(404, 'Not found')))

app.use('/eink', einkRouter)
app.use('/ical', icalRouter)

// Serve the built front end, if there is one (`npm run build`).
const dist = resolve('dist')
if (existsSync(dist)) app.use(express.static(dist))

app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
  const status = error instanceof HttpError ? error.status : 500
  if (status === 500) console.error(error)
  res.status(status).json({ error: status === 500 ? 'Something went wrong' : (error as Error).message })
})

const port = Number(process.env.PORT ?? 3001)
app.listen(port, () => console.log(`Tidy API listening on http://localhost:${port}`))
