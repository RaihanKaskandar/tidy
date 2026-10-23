import { useCallback, useEffect, useMemo, useState } from 'react'
import { api } from './api.ts'
import { addDays, formatDate, monthGrid, shiftMonth, todayISO, weekdayIndex } from '../shared/dates.ts'
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
import { Balance } from './components/Balance.tsx'
import { Avatar, CalendarIcon, GearIcon, ListIcon, WeekIcon } from './components/bits.tsx'
import { CalendarView } from './components/CalendarView.tsx'
import { DayPanel } from './components/DayPanel.tsx'
import { DragProvider } from './components/drag.tsx'
import { MoveSheet } from './components/MoveSheet.tsx'
import { SetupScreen } from './components/SetupScreen.tsx'
import { SettingsSheet } from './components/SettingsSheet.tsx'
import { TasksView } from './components/TasksView.tsx'
import { WeekView } from './components/WeekView.tsx'
import { applyLook, applyTheme, loadLook, loadTheme } from './theme.ts'
import type { Look, Theme } from './theme.ts'

const ME_KEY = 'tidy.me'

type View = 'calendar' | 'week' | 'tasks'

const weekOf = (date: string) => addDays(date, -weekdayIndex(date))

export default function App() {
  const [today] = useState(todayISO)
  const [users, setUsers] = useState<User[] | null>(null)
  const [tasks, setTasks] = useState<Task[]>([])
  const [timeOff, setTimeOff] = useState<TimeOff[]>([])
  const [assignments, setAssignments] = useState<Assignment[]>([])
  const [meId, setMeId] = useState(() => Number(localStorage.getItem(ME_KEY)) || null)
  const [view, setView] = useState<View>('calendar')
  const [weekStart, setWeekStart] = useState(() => weekOf(today))
  const [weekAssignments, setWeekAssignments] = useState<Assignment[]>([])
  const [theme, setTheme] = useState<Theme>(loadTheme)
  const [look, setLook] = useState<Look>(loadLook)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [moving, setMoving] = useState<Assignment | null>(null)
  const [notice, setNotice] = useState<{ text: string; undo: () => void } | null>(null)
  const [month, setMonth] = useState(today.slice(0, 7))
  const [selected, setSelected] = useState(today)
  const [mineOnly, setMineOnly] = useState(false)
  // Bumped whenever the server re-plans, so the calendar reloads.
  const [scheduleVersion, setScheduleVersion] = useState(0)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!notice) return
    const timer = setTimeout(() => setNotice(null), 7000)
    return () => clearTimeout(timer)
  }, [notice])

  const fail = useCallback((e: unknown) => setError(e instanceof Error ? e.message : String(e)), [])

  useEffect(() => {
    Promise.all([api.users(), api.tasks(), api.timeOff()])
      .then(([loadedUsers, loadedTasks, loadedTimeOff]) => {
        setUsers(loadedUsers)
        setTasks(loadedTasks)
        setTimeOff(loadedTimeOff)
      })
      .catch(fail)
  }, [fail])

  const days = useMemo(() => monthGrid(month), [month])

  useEffect(() => {
    let stale = false
    api
      .assignments(days[0], days[days.length - 1])
      .then((loaded) => !stale && setAssignments(loaded))
      .catch(fail)
    return () => {
      stale = true
    }
  }, [days, scheduleVersion, fail])

  useEffect(() => {
    let stale = false
    api
      .assignments(weekStart, addDays(weekStart, 6))
      .then((loaded) => !stale && setWeekAssignments(loaded))
      .catch(fail)
    return () => {
      stale = true
    }
  }, [weekStart, scheduleVersion, fail])

  const groupByDate = useCallback(
    (list: Assignment[]) => {
      const map = new Map<string, Assignment[]>()
      for (const a of list) {
        if (mineOnly && a.userId !== meId) continue
        const day = map.get(a.date)
        if (day) day.push(a)
        else map.set(a.date, [a])
      }
      return map
    },
    [mineOnly, meId],
  )

  const byDate = useMemo(() => groupByDate(assignments), [groupByDate, assignments])
  const weekByDate = useMemo(() => groupByDate(weekAssignments), [groupByDate, weekAssignments])

  const monthAssignments = useMemo(
    () => assignments.filter((a) => a.date.startsWith(month)),
    [assignments, month],
  )

  function chooseMe(id: number) {
    localStorage.setItem(ME_KEY, String(id))
    setMeId(id)
  }

  function showMonth(next: string) {
    setMonth(next)
    setSelected(today.startsWith(next) ? today : `${next}-01`)
  }

  function selectDate(date: string) {
    setSelected(date)
    setMonth(date.slice(0, 7))
  }

  async function patchAssignment(id: number, patch: AssignmentPatch) {
    try {
      const updated = await api.updateAssignment(id, patch)
      const replace = (list: Assignment[]) => list.map((a) => (a.id === id ? updated : a))
      setAssignments(replace)
      setWeekAssignments(replace)
    } catch (e) {
      fail(e)
    }
  }

  /** Run a change to the task list, then reload everything that depends on it. */
  async function changeSchedule(change: () => Promise<unknown>) {
    try {
      await change()
      setTasks(await api.tasks())
      setScheduleVersion((v) => v + 1)
      return true
    } catch (e) {
      fail(e)
      return false
    }
  }

  /** Move one occurrence to another day, showing it there straight away. */
  async function moveAssignment(a: Assignment, date: string, undoable = true) {
    const relocate = (list: Assignment[]) => list.map((x) => (x.id === a.id ? { ...x, date } : x))
    setAssignments(relocate)
    setWeekAssignments(relocate)
    try {
      await api.updateAssignment(a.id, { date })
      if (undoable) {
        const when =
          date === today ? 'today' : formatDate(date, { weekday: 'long', day: 'numeric', month: 'short' })
        setNotice({
          text: `Moved ${a.name} to ${when}`,
          undo: () => {
            setNotice(null)
            void moveAssignment({ ...a, date }, a.date, false)
          },
        })
      } else {
        setNotice(null)
      }
    } catch (e) {
      fail(e)
    } finally {
      setScheduleVersion((v) => v + 1)
    }
  }

  function changeTheme(next: Theme) {
    setTheme(next)
    applyTheme(next)
  }

  function changeLook(next: Look) {
    setLook(next)
    applyLook(next)
  }

  /** Add or change people, then reload the plan, since a new person takes a share of it. */
  async function changePeople(change: () => Promise<unknown>) {
    try {
      await change()
      setUsers(await api.users())
      setScheduleVersion((v) => v + 1)
      return true
    } catch (e) {
      fail(e)
      return false
    }
  }

  async function createHousehold(people: UserInput[]) {
    for (const person of people) {
      if (!(await changePeople(() => api.createUser(person)))) return
    }
    const [first] = await api.users()
    if (first) chooseMe(first.id)
  }

  /** Change the time off, then reload the plan it re-shuffled. */
  async function changeTimeOff(change: () => Promise<unknown>) {
    try {
      await change()
      setTimeOff(await api.timeOff())
      setScheduleVersion((v) => v + 1)
      return true
    } catch (e) {
      fail(e)
      return false
    }
  }

  const saveTimeOff = (input: TimeOffInput, id?: number) =>
    changeTimeOff(() => (id === undefined ? api.createTimeOff(input) : api.updateTimeOff(id, input)))

  const saveTask = (input: TaskInput, id?: number) =>
    changeSchedule(() => (id === undefined ? api.createTask(input) : api.updateTask(id, input)))

  if (!users) {
    return <div className="splash">{error ?? 'Loading…'}</div>
  }

  if (users.length === 0) return <SetupScreen onCreate={createHousehold} />

  const me = users.find((u) => u.id === meId)
  if (!me) {
    return (
      <div className="splash">
        <div className="card welcome">
          <span className="brand-mark">🧹</span>
          <h1>Welcome to Tidy</h1>
          <p className="muted">Who's using this device?</p>
          <div className="welcome-users">
            {users.map((user) => (
              <button key={user.id} className="welcome-user" onClick={() => chooseMe(user.id)}>
                <Avatar user={user} />
                {user.name}
              </button>
            ))}
          </div>
        </div>
      </div>
    )
  }

  return (
    <DragProvider onDrop={(a, date) => void moveAssignment(a, date)} onPick={setMoving}>
      <div className="app">
        <header className="topbar">
          <div className="brand">
            <span className="brand-mark">🧹</span>
            Tidy
          </div>

          <nav className="tabs" aria-label="Sections">
            <button
              className="tab"
              aria-current={view === 'calendar' ? 'page' : undefined}
              onClick={() => setView('calendar')}
            >
              <CalendarIcon />
              Calendar
            </button>
            <button
              className="tab"
              aria-current={view === 'week' ? 'page' : undefined}
              onClick={() => setView('week')}
            >
              <WeekIcon />
              Week
            </button>
            <button
              className="tab"
              aria-current={view === 'tasks' ? 'page' : undefined}
              onClick={() => setView('tasks')}
            >
              <ListIcon />
              Tasks
            </button>
          </nav>

          <div className="top-actions">
            <div className="who" role="radiogroup" aria-label="Who is using the app">
              {users.map((user) => (
                <button
                  key={user.id}
                  className="who-btn"
                  role="radio"
                  aria-checked={user.id === me.id}
                  aria-label={user.name}
                  onClick={() => chooseMe(user.id)}
                >
                  <Avatar user={user} small />
                  <span className="who-name">{user.name}</span>
                </button>
              ))}
            </div>

            <button
              className="icon-btn settings-btn"
              aria-label="Settings"
              onClick={() => setSettingsOpen(true)}
            >
              <GearIcon />
            </button>
          </div>
        </header>

        {view === 'calendar' ? (
          <main className="calendar-layout">
            <CalendarView
              timeOff={timeOff}
              month={month}
              days={days}
              byDate={byDate}
              users={users}
              today={today}
              selected={selected}
              mineOnly={mineOnly}
              onSelect={selectDate}
              onMonthChange={(by) => showMonth(shiftMonth(month, by))}
              onToday={() => showMonth(today.slice(0, 7))}
              onMineOnlyChange={setMineOnly}
            />
            <aside className="side">
              <DayPanel
                timeOff={timeOff}
                date={selected}
                today={today}
                items={byDate.get(selected) ?? []}
                users={users}
                onToggle={(a) =>
                  patchAssignment(a.id, a.doneAt ? { done: false } : { done: true, doneBy: me.id })
                }
                onReassign={(a, userId) => patchAssignment(a.id, { userId })}
              />
              <Balance
                label={formatDate(`${month}-01`, { month: 'long' })}
                assignments={monthAssignments}
                users={users}
              />
            </aside>
          </main>
        ) : view === 'week' ? (
          <WeekView
            timeOff={timeOff}
            start={weekStart}
            today={today}
            byDate={weekByDate}
            users={users}
            mineOnly={mineOnly}
            onWeekChange={(by) => setWeekStart(addDays(weekStart, by * 7))}
            onToday={() => setWeekStart(weekOf(today))}
            onMineOnlyChange={setMineOnly}
            onToggle={(a) =>
              patchAssignment(a.id, a.doneAt ? { done: false } : { done: true, doneBy: me.id })
            }
            onReassign={(a, userId) => patchAssignment(a.id, { userId })}
          />
        ) : (
          <TasksView
            users={users}
            today={today}
            timeOff={timeOff}
            onSaveTimeOff={saveTimeOff}
            onDeleteTimeOff={(id) => changeTimeOff(() => api.deleteTimeOff(id))}
            tasks={tasks}
            onSave={saveTask}
            onDelete={(id) => changeSchedule(() => api.deleteTask(id))}
            onRebalance={() => changeSchedule(api.rebalance)}
          />
        )}

        {settingsOpen && (
          <SettingsSheet
            users={users}
            theme={theme}
            look={look}
            onAddPerson={(input) => changePeople(() => api.createUser(input))}
            onUpdatePerson={(id, input) => changePeople(() => api.updateUser(id, input))}
            onTheme={changeTheme}
            onLook={changeLook}
            onClose={() => setSettingsOpen(false)}
          />
        )}

        {moving && (
          <MoveSheet
            assignment={moving}
            today={today}
            onMove={(date) => {
              void moveAssignment(moving, date)
              setMoving(null)
            }}
            onClose={() => setMoving(null)}
          />
        )}

        {notice && !error && (
          <div className="toast" role="status">
            <span>{notice.text}</span>
            <button onClick={notice.undo}>Undo</button>
          </div>
        )}

        {error && (
          <div className="toast" role="alert">
            <span>{error}</span>
            <button onClick={() => setError(null)}>Dismiss</button>
          </div>
        )}
      </div>
    </DragProvider>
  )
}
