import type { TimeOff } from './types.ts'

/** The time off periods that include a day. */
export const timeOffOn = (periods: TimeOff[], date: string) =>
  periods.filter((p) => p.startDate <= date && date <= p.endDate)

/** The period during which nobody does any tasks on a day, if there is one. */
export const householdAway = (periods: TimeOff[], date: string) =>
  timeOffOn(periods, date).find((p) => p.userId === null)
