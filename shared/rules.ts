/** Most people a household can have. */
export const MAX_USERS = 6

/** Colours offered to the people in a household, in the order they are handed out. */
export const PERSON_COLORS = ['#6d5efc', '#e2702a', '#16a34a', '#db2777', '#0891b2', '#ca8a04']

/** Effort from which a task counts as heavy and is kept to weekends. */
export const HEAVY_EFFORT = 4

interface Linkable {
  id: number
  effort: number
  afterTaskId: number | null
}

/**
 * Heavy tasks are only planned on Saturdays and Sundays. So is any task that a
 * heavy task follows, because the two have to land on the same day.
 */
export const isWeekendOnly = (task: Linkable, tasks: Linkable[]) =>
  task.effort >= HEAVY_EFFORT ||
  tasks.some((other) => other.afterTaskId === task.id && other.effort >= HEAVY_EFFORT)
