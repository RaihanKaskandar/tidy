import express from 'express'
import { all, run } from './db.ts'
import { listAssignments } from './assignments.ts'
import { addDays, formatDate, isISODate, todayISO } from '../shared/dates.ts'
import type { Assignment, User } from '../shared/types.ts'

// A day-by-day board for e-ink screens. It is plain HTML without any JavaScript, so
// it also works in the old browsers found on e-readers and can be captured as
// an image for a panel. Everything is pure black on white (greys dither badly
// on e-ink), and people are told apart by column instead of by colour. Tasks
// are ticked off with form posts.

const DEFAULT_DAYS = 7
const DEFAULT_REFRESH_MINUTES = 30

interface View {
  /** First day shown. */
  from: string
  /** The most days shown; fewer appear when the screen is too short for them. */
  days: number
  /** Minutes between automatic reloads, 0 for never. */
  refresh: number
}

// The board always fits the screen, because many e-ink panels cannot scroll:
// short screens get a compact layout, and day cards that do not fit completely
// are left out (they wrap into a second column that is clipped away). Rows are
// small tables so the columns still line up in browsers without flexbox, which
// simply get a normal scrolling page.
const STYLE = `
  * { -webkit-box-sizing: border-box; box-sizing: border-box; }
  html, body { margin: 0; background: #fff; color: #000; }
  body { font: 17px/1.3 system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; }
  a { color: #000; }
  table { width: 100%; border-collapse: separate; border-spacing: 0; }
  form { margin: 0; }
  .page { max-width: 900px; margin: 0 auto; padding: 14px 16px; }

  .top td { padding: 0 0 4px; vertical-align: bottom; }
  .eyebrow { font-size: 14px; font-weight: 800; letter-spacing: 0.14em; text-transform: uppercase; }
  h1 { margin: 2px 0 0; font-size: 42px; font-weight: 800; line-height: 1; letter-spacing: -0.03em; }
  .nav { text-align: right; white-space: nowrap; }
  .nav a { display: inline-block; min-width: 46px; height: 46px; margin-left: 8px; padding: 0 14px;
           border: 1.5px solid #000; border-radius: 23px; font-size: 18px; font-weight: 700;
           line-height: 42px; text-align: center; text-decoration: none; }

  .row { table-layout: fixed; }
  .row th, .row td { padding: 6px 10px; font-weight: normal; text-align: left; vertical-align: top; }
  .row .day { width: 78px; }

  .avatar { float: left; width: 40px; height: 40px; margin-right: 10px; border: 1.5px solid #000;
            border-radius: 50%; font-size: 18px; font-weight: 800; line-height: 37px; text-align: center; }
  .avatar.solid { background: #000; color: #fff; }
  .who { display: block; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
  .person b { display: block; padding-top: 1px; font-size: 19px; font-weight: 800; letter-spacing: -0.01em; }
  .person small { display: block; font-size: 13px; }
  .bar-wrap { display: block; padding-top: 8px; clear: both; }
  .bar { display: block; height: 9px; border: 1.5px solid #000; border-radius: 5px; overflow: hidden; }
  .bar i { display: block; height: 100%; background: #000; }

  .card { margin-top: 8px; }
  .card th, .card td { border-top: 1.5px solid #000; border-bottom: 1.5px solid #000; }
  .card td + td { border-left: 1px dotted #000; }
  .card td:last-child { border-right: 1.5px solid #000; border-radius: 0 16px 16px 0; }
  .card .day { padding: 8px 4px; border-left: 1.5px solid #000; border-right: 1.5px solid #000;
               border-radius: 16px 0 0 16px; text-align: center; vertical-align: middle; }
  .dow { display: block; font-size: 12px; font-weight: 800; letter-spacing: 0.12em; text-transform: uppercase; }
  .num { display: block; font-size: 30px; font-weight: 800; line-height: 1.1; letter-spacing: -0.03em; }
  .mon { display: block; font-size: 13px; font-weight: 600; }
  .today .day { background: #000; color: #fff; }
  .today th, .today td { border-top-width: 2.5px; border-bottom-width: 2.5px; }
  .today td:last-child { border-right-width: 2.5px; }
  .today .name { font-size: 20px; font-weight: 800; }

  .task { position: relative; display: block; width: 100%; min-height: 44px; margin: 0;
          padding: 9px 4px 9px 36px; border: 0; border-radius: 0; background: transparent; color: #000;
          font: inherit; text-align: left; cursor: pointer; -webkit-appearance: none; appearance: none; }
  .box { position: absolute; top: 9px; left: 4px; width: 22px; height: 22px; border: 1.5px solid #000;
         border-radius: 7px; }
  .today .box { top: 11px; }
  .done .box { background: #000; }
  .done .box:after { content: ''; position: absolute; top: 2px; left: 6px; width: 6px; height: 11px;
                     border: solid #fff; border-width: 0 2.5px 2.5px 0;
                     -webkit-transform: rotate(45deg); transform: rotate(45deg); }
  .name { display: block; font-weight: 600; }
  .done .name { font-weight: 400; text-decoration: line-through; }
  .note { display: block; margin-top: 4px; font-size: 13px; }
  .effort { display: block; margin-top: 6px; line-height: 0; }
  .effort i { display: inline-block; width: 7px; height: 7px; margin-right: 3px; border: 1px solid #000;
              border-radius: 50%; }
  .effort i.on { background: #000; }
  .none { padding: 9px 4px; }

  .foot { margin: 6px 0 0; font-size: 13px; text-align: center; }

  @supports (display: flex) {
    html, body { height: 100%; overflow: hidden; }
    .page { display: flex; flex-direction: column; height: 100vh; height: 100dvh; }
    .days { display: flex; flex: 1 1 0; flex-flow: column wrap; align-content: flex-start;
            min-height: 0; overflow: hidden; }
    .card { flex: none; width: 100%; }
  }

  @media (max-height: 520px) {
    .page { padding: 8px 12px; }
    .top td { padding: 0 0 2px; vertical-align: middle; }
    .eyebrow, h1 { display: inline-block; vertical-align: baseline; }
    .eyebrow { font-size: 12px; }
    h1 { margin: 0 0 0 6px; font-size: 26px; }
    .nav a { min-width: 36px; height: 36px; margin-left: 6px; padding: 0 10px; border-radius: 18px;
             font-size: 16px; line-height: 32px; }
    .row th, .row td { padding: 2px 8px; }
    .row .day { width: 64px; }
    .avatar { width: 26px; height: 26px; margin-right: 8px; font-size: 13px; line-height: 23px; }
    .who { line-height: 26px; }
    .person b, .person small { display: inline; padding: 0; }
    .person b { font-size: 16px; }
    .person small { margin-left: 4px; font-size: 12px; }
    .bar-wrap, .mon, .foot { display: none; }
    .card { margin-top: 6px; }
    .card .day { padding: 4px; }
    .card td:last-child { border-radius: 0 12px 12px 0; }
    .card .day { border-radius: 12px 0 0 12px; }
    .dow { font-size: 11px; }
    .num { font-size: 22px; }
    .task { min-height: 40px; padding: 8px 4px 8px 32px; }
    .box, .today .box { top: 9px; width: 20px; height: 20px; border-radius: 6px; }
    .done .box:after { top: 1px; left: 5px; }
    .name { display: inline; }
    .today .name { font-size: 18px; }
    .effort { display: inline-block; margin: 0 0 0 6px; vertical-align: middle; }
    .none { padding: 8px 4px; }
  }
`

const escapeHtml = (text: string) => text.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`)

function parseView(source: Record<string, unknown>): View {
  const number = (value: unknown) => (value === undefined ? NaN : Math.floor(Number(value)))
  const days = number(source.days)
  const refresh = number(source.refresh)
  return {
    from: isISODate(source.from) ? source.from : todayISO(),
    days: days >= 1 ? Math.min(days, 14) : DEFAULT_DAYS,
    refresh: refresh >= 0 ? Math.min(refresh, 1440) : DEFAULT_REFRESH_MINUTES,
  }
}

/** Link to the board, leaving out anything that is already the default. */
function href({ from, days, refresh }: View) {
  const params = new URLSearchParams()
  if (from !== todayISO()) params.set('from', from)
  if (days !== DEFAULT_DAYS) params.set('days', String(days))
  if (refresh !== DEFAULT_REFRESH_MINUTES) params.set('refresh', String(refresh))
  const query = params.toString()
  return query ? `/eink?${query}` : '/eink'
}

function renderBoard(view: View): string {
  const { from, days, refresh } = view
  const today = todayISO()
  const users = all<User>('SELECT id, name, color FROM users ORDER BY id')
  const userName = new Map(users.map((u) => [u.id, u.name]))
  const assignments = listAssignments(from, addDays(from, days - 1))

  const task = (a: Assignment) => {
    const done = !!a.doneAt
    let note = ''
    if (done && a.doneBy !== null && a.doneBy !== a.userId) {
      note = `<span class="note">done by ${escapeHtml(userName.get(a.doneBy) ?? '?')}</span>`
    } else if (!done && a.date < today) {
      note = '<span class="note">missed</span>'
    }
    return `
      <form method="post" action="/eink/assignments/${a.id}">
        <input type="hidden" name="done" value="${done ? 0 : 1}">
        <input type="hidden" name="from" value="${from}">
        <input type="hidden" name="days" value="${days}">
        <input type="hidden" name="refresh" value="${refresh}">
        <button class="task${done ? ' done' : ''}">
          <span class="box"></span>
          <span class="name">${escapeHtml(a.name)}</span>
          <span class="effort">${'<i class="on"></i>'.repeat(a.effort)}${'<i></i>'.repeat(5 - a.effort)}</span>
          ${note}
        </button>
      </form>`
  }

  // People alternate between a filled and an outlined avatar instead of a colour.
  const heads = users.map((user, index) => {
    const mine = assignments.filter((a) => a.userId === user.id)
    const effort = mine.reduce((sum, a) => sum + a.effort, 0)
    const done = mine.reduce((sum, a) => sum + (a.doneAt ? a.effort : 0), 0)
    return `
      <th class="person">
        <span class="avatar${index % 2 === 0 ? ' solid' : ''}">${escapeHtml(user.name.charAt(0).toUpperCase())}</span>
        <span class="who">
          <b>${escapeHtml(user.name)}</b>
          <small>${effort ? `${done} of ${effort} effort points done` : 'Nothing planned'}</small>
        </span>
        <span class="bar-wrap"><span class="bar"><i style="width: ${effort ? Math.round((done / effort) * 100) : 0}%"></i></span></span>
      </th>`
  })

  const rows = Array.from({ length: days }, (_, i) => {
    const date = addDays(from, i)
    const cells = users.map((user) => {
      const mine = assignments.filter((a) => a.date === date && a.userId === user.id)
      return `<td>${mine.map(task).join('') || '<div class="none">&ndash;</div>'}</td>`
    })
    return `
      <div class="card${date === today ? ' today' : ''}">
        <table class="row"><tr>
          <th class="day">
            <span class="dow">${date === today ? 'Today' : formatDate(date, { weekday: 'short' })}</span>
            <span class="num">${formatDate(date, { day: 'numeric' })}</span>
            <span class="mon">${formatDate(date, { month: 'short' })}</span>
          </th>
          ${cells.join('')}
        </tr></table>
      </div>`
  })

  const updated = new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  ${refresh > 0 ? `<meta http-equiv="refresh" content="${refresh * 60}">` : ''}
  <title>Tidy</title>
  <style>${STYLE}</style>
</head>
<body>
<div class="page">
  <table class="top">
    <tr>
      <td>
        <div class="eyebrow">${from === today ? '' : 'From '}${formatDate(from, { weekday: 'long' })}</div>
        <h1>${formatDate(from, { day: 'numeric' })} ${formatDate(from, { month: 'long' })}</h1>
      </td>
      <td class="nav">
        ${from === today ? '' : `<a href="${href({ ...view, from: today })}">Today</a>`}
        <a href="${href({ ...view, from: addDays(from, -1) })}" aria-label="Previous day">&larr;</a>
        <a href="${href({ ...view, from: addDays(from, 1) })}" aria-label="Next day">&rarr;</a>
      </td>
    </tr>
  </table>
  <table class="row"><tr><th class="day"></th>${heads.join('')}</tr></table>
  <div class="days">${rows.join('')}</div>
  <p class="foot">
    Tidy &middot; updated ${updated}${refresh > 0 ? ` &middot; refreshes every ${refresh} min` : ''}
    &middot; <a href="/">Full app</a>
  </p>
</div>
</body>
</html>`
}

export const einkRouter = express.Router()

einkRouter.get('/', (req, res) => {
  res.type('html').send(renderBoard(parseView(req.query)))
})

einkRouter.post('/assignments/:id', express.urlencoded({ extended: false }), (req, res) => {
  const body = (req.body ?? {}) as Record<string, unknown>
  const id = Number(req.params.id)
  if (Number.isInteger(id)) {
    if (body.done === '1') {
      // The board can't tell who tapped, so the person it was planned for gets the credit.
      run(
        "UPDATE assignments SET done_at = datetime('now'), done_by = user_id WHERE id = ? AND done_at IS NULL",
        id,
      )
    } else {
      run('UPDATE assignments SET done_at = NULL, done_by = NULL WHERE id = ?', id)
    }
  }
  res.redirect(303, href(parseView(body)))
})
