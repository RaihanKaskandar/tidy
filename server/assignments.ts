import { all, get, transaction } from './db.ts'
import { ensureGenerated } from './scheduler.ts'
import type { Assignment } from '../shared/types.ts'

const SELECT = `
  SELECT a.id, a.date, a.task_id AS taskId, a.user_id AS userId,
         a.done_at AS doneAt, a.done_by AS doneBy, t.name, t.icon, t.effort
    FROM assignments a JOIN tasks t ON t.id = a.task_id`

/** Assignments for every day in [from, to], planning those days first if needed. */
export function listAssignments(from: string, to: string) {
  transaction(() => ensureGenerated(to))
  return all<Assignment>(
    `${SELECT} WHERE a.date BETWEEN ? AND ? ORDER BY a.date, t.after_task_id IS NOT NULL, t.effort DESC, t.name`,
    from,
    to,
  )
}

export const getAssignment = (id: number) => get<Assignment>(`${SELECT} WHERE a.id = ?`, id)
