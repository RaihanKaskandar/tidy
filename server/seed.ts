import { get, run, transaction } from './db.ts'
import { anchorAll, getMeta, regenerateFuture, setMeta } from './scheduler.ts'
import { todayISO } from '../shared/dates.ts'

// name, icon, effort (1–5), repeat every N days, and optionally the task it shares a day with
const TASKS: [string, string, number, number, string?][] = [
  ['Wipe kitchen counters', '🧽', 1, 2],
  ['Take out trash', '🗑️', 1, 3],
  ['Vacuum', '🧹', 3, 7],
  ['Clean bathroom', '🚿', 4, 7],
  ['Clean toilet', '🚽', 2, 7],
  ['Clean stove & sink', '🍳', 3, 7],
  ['Mop floors', '🪣', 4, 14, 'Vacuum'],
  ['Dust surfaces', '🪶', 2, 14],
  ['Paper & glass recycling', '♻️', 2, 14],
  ['Clean fridge', '🧊', 3, 28],
  ['Wash windows', '🪟', 5, 84],
]

/** Bumped whenever the planning rules change, so existing calendars get re-planned once. */
const RULES_VERSION = '3'

const count = (table: string) => get<{ n: number }>(`SELECT COUNT(*) AS n FROM ${table}`)!.n

/** Fill a brand-new database with a starter task list. People are added on first use. */
export function seed() {
  transaction(() => {
    if (count('tasks') === 0) {
      const today = todayISO()
      for (const [name, icon, effort, interval] of TASKS) {
        run(
          'INSERT INTO tasks (name, icon, effort, interval_days, anchor_date) VALUES (?, ?, ?, ?, ?)',
          name,
          icon,
          effort,
          interval,
          today,
        )
      }
    }
    if (getMeta('rules_version') !== RULES_VERSION) {
      // Also links starter tasks in databases from before tasks could be linked.
      for (const [name, , , , after] of TASKS) {
        if (!after) continue
        run(
          `UPDATE tasks
              SET after_task_id = (SELECT id FROM tasks
                                    WHERE name = ? AND active = 1 AND after_task_id IS NULL)
            WHERE name = ? AND active = 1 AND after_task_id IS NULL`,
          after,
          name,
        )
      }
      anchorAll()
      regenerateFuture(false)
      setMeta('rules_version', RULES_VERSION)
    }
  })
}
