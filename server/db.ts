import { DatabaseSync } from 'node:sqlite'
import type { SQLInputValue } from 'node:sqlite'
import { mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'

const path = resolve(process.env.DB_PATH ?? 'data/tidy.db')
mkdirSync(dirname(path), { recursive: true })

export const db = new DatabaseSync(path)

db.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA foreign_keys = ON;

  CREATE TABLE IF NOT EXISTS users (
    id    INTEGER PRIMARY KEY,
    name  TEXT NOT NULL UNIQUE,
    color TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS tasks (
    id            INTEGER PRIMARY KEY,
    name          TEXT NOT NULL,
    icon          TEXT NOT NULL,
    effort        INTEGER NOT NULL CHECK (effort BETWEEN 1 AND 5),
    interval_days INTEGER NOT NULL CHECK (interval_days >= 1),
    -- First day the task is due; it then repeats every interval_days.
    anchor_date   TEXT NOT NULL,
    -- Task this one always shares a day with (mopping follows vacuuming).
    after_task_id INTEGER REFERENCES tasks(id),
    -- Deleted tasks are kept (active = 0) so past calendar entries stay intact.
    active        INTEGER NOT NULL DEFAULT 1
  );

  CREATE TABLE IF NOT EXISTS assignments (
    id      INTEGER PRIMARY KEY,
    task_id INTEGER NOT NULL REFERENCES tasks(id),
    user_id INTEGER NOT NULL REFERENCES users(id),
    date    TEXT NOT NULL,
    done_at TEXT,
    done_by INTEGER REFERENCES users(id),
    -- Set when someone hands a task over by hand, so rescheduling leaves it alone.
    locked  INTEGER NOT NULL DEFAULT 0,
    UNIQUE (task_id, date)
  );
  CREATE INDEX IF NOT EXISTS idx_assignments_date ON assignments(date);

  -- Planned occurrences a person moved to another day; they must not be planned again.
  CREATE TABLE IF NOT EXISTS skips (
    task_id INTEGER NOT NULL REFERENCES tasks(id),
    date    TEXT NOT NULL,
    PRIMARY KEY (task_id, date)
  );

  -- Stretches of days (holiday, exam week) when nobody, or one person, does any tasks.
  CREATE TABLE IF NOT EXISTS time_off (
    id         INTEGER PRIMARY KEY,
    label      TEXT NOT NULL,
    icon       TEXT NOT NULL,
    start_date TEXT NOT NULL,
    end_date   TEXT NOT NULL,
    -- NULL means the whole household.
    user_id    INTEGER REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS meta (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );
`)

// Databases created before tasks could be linked lack this column.
const taskColumns = db.prepare('PRAGMA table_info(tasks)').all()
if (!taskColumns.some((column) => column.name === 'after_task_id')) {
  db.exec('ALTER TABLE tasks ADD COLUMN after_task_id INTEGER REFERENCES tasks(id)')
}

export const all = <T>(sql: string, ...params: SQLInputValue[]) =>
  db.prepare(sql).all(...params) as unknown as T[]

export const get = <T>(sql: string, ...params: SQLInputValue[]) =>
  db.prepare(sql).get(...params) as unknown as T | undefined

export const run = (sql: string, ...params: SQLInputValue[]) => db.prepare(sql).run(...params)

export function transaction<T>(fn: () => T): T {
  db.exec('BEGIN')
  try {
    const result = fn()
    db.exec('COMMIT')
    return result
  } catch (error) {
    db.exec('ROLLBACK')
    throw error
  }
}
