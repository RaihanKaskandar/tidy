import type {
  Assignment,
  AssignmentPatch,
  Task,
  TaskInput,
  TimeOff,
  TimeOffInput,
  User,
  UserInput,
} from '../shared/types.ts'

async function request<T>(path: string, method = 'GET', body?: unknown): Promise<T> {
  const response = await fetch(`/api${path}`, {
    method,
    headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  if (!response.ok) {
    const detail = await response.json().catch(() => null)
    throw new Error(detail?.error ?? `Request failed (${response.status})`)
  }
  return response.status === 204 ? (undefined as T) : response.json()
}

export const api = {
  users: () => request<User[]>('/users'),
  createUser: (input: UserInput) => request<User>('/users', 'POST', input),
  updateUser: (id: number, input: UserInput) => request<User>(`/users/${id}`, 'PUT', input),
  tasks: () => request<Task[]>('/tasks'),
  createTask: (task: TaskInput) => request<Task>('/tasks', 'POST', task),
  updateTask: (id: number, task: TaskInput) => request<Task>(`/tasks/${id}`, 'PUT', task),
  deleteTask: (id: number) => request<void>(`/tasks/${id}`, 'DELETE'),
  assignments: (from: string, to: string) => request<Assignment[]>(`/assignments?from=${from}&to=${to}`),
  updateAssignment: (id: number, patch: AssignmentPatch) =>
    request<Assignment>(`/assignments/${id}`, 'PATCH', patch),
  timeOff: () => request<TimeOff[]>('/timeoff'),
  createTimeOff: (input: TimeOffInput) => request<TimeOff>('/timeoff', 'POST', input),
  updateTimeOff: (id: number, input: TimeOffInput) => request<TimeOff>(`/timeoff/${id}`, 'PUT', input),
  deleteTimeOff: (id: number) => request<void>(`/timeoff/${id}`, 'DELETE'),
  rebalance: () => request<void>('/schedule/rebalance', 'POST'),
}
