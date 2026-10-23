import { all, db, get, run } from './db.ts'
import { addDays, diffDays, isWeekend, todayISO, weekdayIndex } from '../shared/dates.ts'
import { isWeekendOnly } from '../shared/rules.ts'

// The schedule is built in two steps:
//  1. Each task gets a start day (anchor) chosen so that the total effort per
//     day stays as flat as possible; it then repeats every `interval` days.
//  2. Each occurrence goes to whoever has done the least effort recently,
//     unless that would give them more than one person can do in a day.
//
// Three rules restrict which days a task may land on:
//  - Heavy tasks are only planned on Saturdays and Sundays.
//  - A task that follows another one is only planned on days that task is due.
//  - A task is not planned again shortly after it was last ticked off.

/** Days ahead used to pick start days, and the minimum the calendar is filled. */
const HORIZON = 84
/** Furthest ahead the calendar will ever be generated. */
const MAX_AHEAD = 400
/** Past days whose effort still counts when deciding whose turn it is. */
const BALANCE_WINDOW = 56
/** Effort one person can reasonably be given on one day: a single very heavy task. */
const DAILY_LIMIT = 5
/** Cost per effort point over the daily limit; high enough to outweigh whose turn it is. */
const OVERLOAD_PENALTY = 10
/** Extra cost, as a fraction of effort, for doing the same task twice in a row. */
const REPEAT_PENALTY = 0.5
/** Slight preference for starting sooner when days are otherwise equally good. */
const EARLY_BIAS = 0.005
/** Days to move each weekday, Monday to Sunday, to reach the nearest weekend day. */
const TO_WEEKEND = [-1, -2, 3, 2, 1, 0, 0]

interface TaskRow {
  id: number
  effort: number
  interval: number
  anchor: string
  afterTaskId: number | null
  /** Most recent day the task was ticked off, which can be ahead of today. */
  lastDone: string | null
}

function activeTasks(): TaskRow[] {
  const tasks = all<TaskRow>(
    `SELECT id, effort, interval_days AS interval, anchor_date AS anchor, after_task_id AS afterTaskId,
            (SELECT MAX(a.date) FROM assignments a
              WHERE a.task_id = tasks.id AND a.done_at IS NOT NULL) AS lastDone
       FROM tasks WHERE active = 1`,
  )
  // A task can only follow one that is active and does not follow anything itself.
  const leaders = new Set(tasks.filter((t) => t.afterTaskId === null).map((t) => t.id))
  for (const task of tasks) {
    if (task.afterTaskId !== null && !leaders.has(task.afterTaskId)) task.afterTaskId = null
  }
  return tasks
}

export const getMeta = (key: string) =>
  get<{ value: string }>('SELECT value FROM meta WHERE key = ?', key)?.value

export const setMeta = (key: string, value: string) =>
  run(
    'INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value',
    key,
    value,
  )

/** The date in `allowed` closest to `date`, preferring the earlier one on a tie. */
function nearest(date: string, allowed: string[]): string | undefined {
  let best: string | undefined
  for (const candidate of allowed) {
    if (!best || Math.abs(diffDays(candidate, date)) < Math.abs(diffDays(best, date))) best = candidate
  }
  return best
}

/** The days in [from, to] on which a task is due. */
function occurrences(task: TaskRow, tasks: TaskRow[], from: string, to: string): string[] {
  // The task's own rhythm, before any rule moves it onto an allowed day.
  const rhythm = (start: string, end: string) => {
    const dates: string[] = []
    const skipped = Math.max(0, Math.ceil(diffDays(start, task.anchor) / task.interval))
    for (let d = addDays(task.anchor, skipped * task.interval); d <= end; d = addDays(d, task.interval)) {
      dates.push(d)
    }
    return dates
  }

  const leader = tasks.find((t) => t.id === task.afterTaskId)
  let dates: string[]
  if (leader) {
    // Look a little past the range so days near its edges find their nearest match.
    const reach = leader.interval + 7
    const start = addDays(from, -reach)
    const end = addDays(to, reach)
    const allowed = occurrences(leader, tasks, start, end)
    dates = rhythm(start, end).flatMap((date) => nearest(date, allowed) ?? [])
  } else if (isWeekendOnly(task, tasks)) {
    dates = rhythm(addDays(from, -3), addDays(to, 3)).map((date) =>
      addDays(date, TO_WEEKEND[weekdayIndex(date)]),
    )
  } else {
    return rhythm(from, to)
  }
  // Several dates can be moved onto the same day; the task is then due once.
  return [...new Set(dates)].filter((date) => date >= from && date <= to).sort()
}

/**
 * Effort on each of the HORIZON days from `start`: the occurrences of the
 * `counted` tasks, plus anything already ticked off for one of those days,
 * which stays on the calendar wherever the tasks are moved to.
 */
function loadProfile(counted: TaskRow[], tasks: TaskRow[], start: string): number[] {
  const load = new Array<number>(HORIZON).fill(0)
  const end = addDays(start, HORIZON - 1)
  const seen = new Set<string>()
  for (const task of counted) {
    for (const date of occurrences(task, tasks, start, end)) {
      load[diffDays(date, start)] += task.effort
      seen.add(`${task.id}|${date}`)
    }
  }
  const ticked = all<{ taskId: number; date: string; effort: number }>(
    `SELECT a.task_id AS taskId, a.date, t.effort
       FROM assignments a JOIN tasks t ON t.id = a.task_id
      WHERE a.done_at IS NOT NULL AND a.date BETWEEN ? AND ?`,
    start,
    end,
  )
  for (const entry of ticked) {
    if (!seen.has(`${entry.taskId}|${entry.date}`)) load[diffDays(entry.date, start)] += entry.effort
  }
  return load
}

/** Tasks grouped as [leader, ...followers], heaviest group first so it gets the best days. */
function groups(tasks: TaskRow[]): TaskRow[][] {
  const weight = (group: TaskRow[]) => group.reduce((sum, t) => sum + t.effort, 0)
  return tasks
    .filter((t) => t.afterTaskId === null)
    .map((leader) => [leader, ...tasks.filter((t) => t.afterTaskId === leader.id)])
    .sort((a, b) => weight(b) - weight(a) || a[0].interval - b[0].interval || a[0].id - b[0].id)
}

/** Give a task the allowed start day that adds the least to the busiest days. */
function place(task: TaskRow, tasks: TaskRow[], load: number[], start: string) {
  const end = addDays(start, HORIZON - 1)
  const leader = tasks.find((t) => t.id === task.afterTaskId)

  // Leave at least half its usual gap after the last time it was ticked off.
  const rested = task.lastDone && addDays(task.lastDone, Math.ceil(task.interval / 2))
  const earliest = rested && rested > start ? rested : start

  let allowed: string[]
  if (leader) {
    const span = Math.max(task.interval, leader.interval, 7)
    allowed = occurrences(leader, tasks, earliest, addDays(earliest, MAX_AHEAD)).filter(
      (date, i) => i === 0 || diffDays(date, earliest) < span,
    )
  } else {
    const weekendOnly = isWeekendOnly(task, tasks)
    // One full cycle covers every possible start; a weekend may be up to a week away.
    const span = weekendOnly ? Math.max(task.interval, 7) : task.interval
    allowed = Array.from({ length: span }, (_, i) => addDays(earliest, i)).filter(
      (date) => !weekendOnly || isWeekend(date),
    )
  }
  // Only days inside the horizon can be compared; otherwise take the first allowed day.
  let candidates = allowed.filter((date) => date <= end)
  if (!candidates.length) candidates = allowed.slice(0, 1)

  let best = candidates[0] ?? start
  let bestCost = Infinity
  for (const anchor of candidates) {
    const dates = occurrences({ ...task, anchor }, tasks, start, end)
    let cost = 0
    for (const date of dates) {
      const day = diffDays(date, start)
      // Squared load, so piling onto a busy day costs more than filling a quiet one.
      cost += (load[day] + task.effort) ** 2 - load[day] ** 2
    }
    cost = (dates.length ? cost / dates.length : 0) + diffDays(anchor, start) * EARLY_BIAS
    if (cost < bestCost) {
      best = anchor
      bestCost = cost
    }
  }

  task.anchor = best
  run('UPDATE tasks SET anchor_date = ? WHERE id = ?', best, task.id)
  for (const date of occurrences(task, tasks, start, end)) load[diffDays(date, start)] += task.effort
}

/** Pick fresh start days for every task. */
export function anchorAll() {
  const today = todayISO()
  const tasks = activeTasks()
  const load = loadProfile([], tasks, today)
  for (const task of groups(tasks).flat()) place(task, tasks, load, today)
}

/**
 * Pick new start days after the given tasks changed, fitting them around all
 * the others. Tasks that follow a moved task move with it, and a task is also
 * moved when a heavy follower now needs it to be on a weekend.
 */
export function reanchor(changedIds: number[]) {
  const today = todayISO()
  const tasks = activeTasks()
  const changed = new Set(changedIds)

  const moving: TaskRow[] = []
  for (const [leader, ...followers] of groups(tasks)) {
    const leaderMoves = changed.has(leader.id) || (isWeekendOnly(leader, tasks) && !isWeekend(leader.anchor))
    if (leaderMoves) moving.push(leader)
    moving.push(...followers.filter((t) => leaderMoves || changed.has(t.id)))
  }

  const load = loadProfile(
    tasks.filter((t) => !moving.includes(t)),
    tasks,
    today,
  )
  for (const task of moving) {
    // New days, so even hand-assigned entries no longer line up.
    run('DELETE FROM assignments WHERE task_id = ? AND date >= ? AND done_at IS NULL', task.id, today)
    run('DELETE FROM skips WHERE task_id = ? AND date >= ?', task.id, today)
    place(task, tasks, load, today)
  }
}

/** Create the missing assignments for every day in [from, to]. */
function generate(from: string, to: string) {
  const tasks = activeTasks()
  const users = all<{ id: number }>('SELECT id FROM users ORDER BY id')
  if (!tasks.length || !users.length) return

  const dueOn = new Map<string, TaskRow[]>()
  for (const task of tasks) {
    for (const date of occurrences(task, tasks, from, to)) {
      const due = dueOn.get(date)
      if (due) due.push(task)
      else dueOn.set(date, [task])
    }
  }

  // Effort counts for whoever actually did the work, not who it was planned for.
  const balance = new Map(users.map((u) => [u.id, 0]))
  const recent = all<{ userId: number; effort: number }>(
    `SELECT COALESCE(a.done_by, a.user_id) AS userId, SUM(t.effort) AS effort
       FROM assignments a JOIN tasks t ON t.id = a.task_id
      WHERE a.date >= ? AND a.date < ?
      GROUP BY 1`,
    addDays(from, -BALANCE_WINDOW),
    from,
  )
  for (const row of recent) balance.set(row.userId, row.effort)

  const lastDoneBy = new Map(
    all<{ taskId: number; userId: number }>(
      `SELECT a.task_id AS taskId, COALESCE(a.done_by, a.user_id) AS userId
         FROM assignments a
        WHERE a.date = (SELECT MAX(b.date) FROM assignments b
                         WHERE b.task_id = a.task_id AND b.date < ?)`,
      from,
    ).map((row) => [row.taskId, row.userId]),
  )

  // Completed or hand-assigned entries that survived a reschedule. They can sit
  // on days their task is no longer due, and still count as that person's work.
  interface Fixed {
    taskId: number
    date: string
    userId: number
    effort: number
  }
  const fixedOn = new Map<string, Fixed[]>()
  const kept = all<Fixed>(
    `SELECT a.task_id AS taskId, a.date, COALESCE(a.done_by, a.user_id) AS userId, t.effort
       FROM assignments a JOIN tasks t ON t.id = a.task_id
      WHERE a.date BETWEEN ? AND ?`,
    from,
    to,
  )
  for (const entry of kept) {
    const fixed = fixedOn.get(entry.date)
    if (fixed) fixed.push(entry)
    else fixedOn.set(entry.date, [entry])
  }

  // Occurrences someone moved to another day stay empty.
  const skipped = new Set(
    all<{ taskId: number; date: string }>(
      'SELECT task_id AS taskId, date FROM skips WHERE date BETWEEN ? AND ?',
      from,
      to,
    ).map((row) => `${row.taskId}|${row.date}`),
  )

  const periods = all<{ userId: number | null; start: string; end: string }>(
    'SELECT user_id AS userId, start_date AS start, end_date AS end FROM time_off WHERE end_date >= ? AND start_date <= ?',
    from,
    to,
  )

  const insert = db.prepare('INSERT INTO assignments (task_id, user_id, date) VALUES (?, ?, ?)')

  for (let date = from; date <= to; date = addDays(date, 1)) {
    // What each person has on this day so far.
    const dayLoad = new Map(users.map((u) => [u.id, 0]))
    const give = (taskId: number, userId: number, effort: number) => {
      dayLoad.set(userId, (dayLoad.get(userId) ?? 0) + effort)
      balance.set(userId, (balance.get(userId) ?? 0) + effort)
      lastDoneBy.set(taskId, userId)
    }

    const fixed = fixedOn.get(date) ?? []
    for (const entry of fixed) give(entry.taskId, entry.userId, entry.effort)

    // Time off: nothing is planned while the household is away, and people who are away get nothing.
    const covering = periods.filter((p) => p.start <= date && date <= p.end)
    const here = covering.some((p) => p.userId === null)
      ? []
      : users.filter((u) => !covering.some((p) => p.userId === u.id))

    const open = (here.length ? (dueOn.get(date) ?? []) : [])
      .filter(
        (task) => !fixed.some((entry) => entry.taskId === task.id) && !skipped.has(`${task.id}|${date}`),
      )
      .sort((a, b) => b.effort - a.effort || a.id - b.id)
    for (const task of open) {
      const cost = (id: number) =>
        balance.get(id)! +
        (lastDoneBy.get(task.id) === id ? task.effort * REPEAT_PENALTY : 0) +
        Math.max(0, dayLoad.get(id)! + task.effort - DAILY_LIMIT) * OVERLOAD_PENALTY
      const userId = here.reduce((best, u) => (cost(u.id) < cost(best.id) ? u : best)).id
      insert.run(task.id, userId, date)
      give(task.id, userId, task.effort)
    }
  }
}

/** Make sure the calendar is filled in up to `to`. Existing days never change. */
export function ensureGenerated(to: string) {
  const today = todayISO()
  const limit = addDays(today, MAX_AHEAD)
  if (to > limit) to = limit
  const until = getMeta('generated_until')
  const from = until ? addDays(until, 1) : today
  if (to < from) return
  generate(from, to)
  setMeta('generated_until', to)
}

/**
 * Rebuild everything from today onwards after the task list changed.
 * Completed tasks are always kept; hand-assigned ones only if `keepLocked`.
 */
export function regenerateFuture(keepLocked = true) {
  const today = todayISO()
  const horizon = addDays(today, HORIZON)
  const until = getMeta('generated_until')

  run(
    'DELETE FROM assignments WHERE date >= ? AND done_at IS NULL AND (locked = 0 OR ?)',
    today,
    keepLocked ? 0 : 1,
  )
  // A full reset also forgets moves.
  if (!keepLocked) run('DELETE FROM skips WHERE date >= ?', today)
  run(
    `DELETE FROM assignments WHERE date >= ? AND done_at IS NULL
        AND task_id IN (SELECT id FROM tasks WHERE active = 0)`,
    today,
  )

  const from = until && until < today ? addDays(until, 1) : today
  const to = until && until > horizon ? until : horizon
  generate(from, to)
  setMeta('generated_until', to)
}
