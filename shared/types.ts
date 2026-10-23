export interface UserInput {
  name: string
  /** A hex colour such as #6d5efc. */
  color: string
}

export interface User extends UserInput {
  id: number
}

export interface TaskInput {
  name: string
  icon: string
  /** 1 (quick) to 5 (very heavy) */
  effort: number
  intervalDays: number
  /** Another task this one is always planned on the same day as, and listed after. */
  afterTaskId: number | null
}

export interface Task extends TaskInput {
  id: number
}

/** One scheduled occurrence of a task on a given day. */
export interface Assignment {
  id: number
  date: string
  taskId: number
  userId: number
  doneAt: string | null
  doneBy: number | null
  name: string
  icon: string
  effort: number
}

export interface AssignmentPatch {
  done?: boolean
  doneBy?: number
  userId?: number
  /** Move this occurrence to another day (today or later). */
  date?: string
}

export interface TimeOffInput {
  label: string
  icon: string
  /** First and last day, both included. */
  startDate: string
  endDate: string
  /** The person who is away, or null when nobody does any tasks. */
  userId: number | null
}

export interface TimeOff extends TimeOffInput {
  id: number
}
