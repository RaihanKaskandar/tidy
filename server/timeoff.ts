import { all, run } from './db.ts'
import { regenerateFuture } from './scheduler.ts'
import { todayISO } from '../shared/dates.ts'
import type { TimeOff } from '../shared/types.ts'

const COLUMNS = 'id, label, icon, start_date AS startDate, end_date AS endDate, user_id AS userId'

/** Periods that are not over yet, soonest first. */
export const listTimeOff = () =>
  all<TimeOff>(`SELECT ${COLUMNS} FROM time_off WHERE end_date >= ? ORDER BY start_date, id`, todayISO())

/**
 * Re-plan the coming days after time off changed. Planned tasks that now fall
 * in someone's time off go, even hand-assigned ones; everything else follows
 * the normal re-plan, which also brings tasks back when a period is removed.
 */
export function applyTimeOff() {
  run(
    `DELETE FROM assignments
      WHERE done_at IS NULL AND date >= ?
        AND EXISTS (SELECT 1 FROM time_off o
                     WHERE assignments.date BETWEEN o.start_date AND o.end_date
                       AND (o.user_id IS NULL OR o.user_id = assignments.user_id))`,
    todayISO(),
  )
  regenerateFuture(true)
}
