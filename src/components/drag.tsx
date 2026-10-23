import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import type { PointerEvent as ReactPointerEvent, ReactNode } from 'react'
import type { Assignment } from '../../shared/types.ts'

// Moving a task to another day. Dragging starts from a small grip on the row (so
// scrolling and tapping a row can never move anything by accident) and works the
// same for mouse and touch. A tap on the grip, without dragging, opens a picker
// instead. Days that accept a drop are marked with data-drop-date; past days have
// data-drop-ok="false". HTML5 drag and drop is not used: it does not exist on touch.

const THRESHOLD = 6
const EDGE = 90
const BOTTOM_EDGE = 130

interface DragState {
  assignment: Assignment
  /** The valid day under the pointer, if any. */
  hover: string | null
}

interface DragApi {
  drag: DragState | null
  begin: (event: ReactPointerEvent, assignment: Assignment) => void
  /** Opens the day picker for a task (keyboard and tap). */
  pick: (assignment: Assignment) => void
}

const DragContext = createContext<DragApi>({ drag: null, begin: () => {}, pick: () => {} })
export const useDrag = () => useContext(DragContext)

/** CSS classes for a day that can receive a dragged task. */
export function dropClass(drag: DragState | null, date: string, today: string) {
  if (!drag) return ''
  if (date < today) return 'drop-no'
  return date === drag.hover ? 'drop-ok drop-hover' : 'drop-ok'
}

interface Props {
  onDrop: (assignment: Assignment, date: string) => void
  onPick: (assignment: Assignment) => void
  children: ReactNode
}

export function DragProvider({ onDrop, onPick, children }: Props) {
  const [drag, setDrag] = useState<DragState | null>(null)
  const ghostRef = useRef<HTMLDivElement>(null)
  const point = useRef({ x: 0, y: 0 })
  const handlers = useRef({ onDrop, onPick })
  handlers.current = { onDrop, onPick }
  const cleanup = useRef<(() => void) | null>(null)

  const moveGhost = () => {
    const ghost = ghostRef.current
    if (ghost)
      ghost.style.transform = `translate(${point.current.x + 14}px, ${point.current.y - 26}px) rotate(-2deg) scale(1.03)`
  }
  useLayoutEffect(moveGhost, [drag?.assignment.id])

  const begin = useCallback((event: ReactPointerEvent, assignment: Assignment) => {
    if (event.button !== 0) return
    cleanup.current?.()
    const startX = event.clientX
    const startY = event.clientY
    point.current = { x: startX, y: startY }
    let dragging = false
    let hover: string | null = null
    let frame = 0

    const hoverAt = () => {
      const target = document
        .elementFromPoint(point.current.x, point.current.y)
        ?.closest<HTMLElement>('[data-drop-date]')
      const next = target && target.dataset.dropOk !== 'false' ? target.dataset.dropDate! : null
      if (next !== hover) {
        hover = next
        setDrag({ assignment, hover })
      }
    }

    // Scroll the page when the pointer nears the top or bottom edge.
    const tick = () => {
      const { y } = point.current
      const top = EDGE - y
      const bottom = y - (window.innerHeight - BOTTOM_EDGE)
      const speed = top > 0 ? -Math.min(18, top / 4) : bottom > 0 ? Math.min(18, bottom / 4) : 0
      if (speed) {
        window.scrollBy(0, speed)
        hoverAt()
      }
      frame = requestAnimationFrame(tick)
    }

    const onMove = (e: PointerEvent) => {
      point.current = { x: e.clientX, y: e.clientY }
      if (!dragging) {
        if (Math.hypot(e.clientX - startX, e.clientY - startY) < THRESHOLD) return
        dragging = true
        document.documentElement.classList.add('is-dragging')
        setDrag({ assignment, hover: null })
        frame = requestAnimationFrame(tick)
      }
      moveGhost()
      hoverAt()
    }

    const finish = (commit: boolean) => {
      cleanup.current?.()
      cleanup.current = null
      if (!commit) return
      if (!dragging) handlers.current.onPick(assignment)
      else if (hover && hover !== assignment.date) handlers.current.onDrop(assignment, hover)
    }
    const onUp = () => finish(true)
    const onCancel = () => finish(false)
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && finish(false)

    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onCancel)
    window.addEventListener('keydown', onKey)
    cleanup.current = () => {
      cancelAnimationFrame(frame)
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onCancel)
      window.removeEventListener('keydown', onKey)
      document.documentElement.classList.remove('is-dragging')
      setDrag(null)
    }
  }, [])

  useEffect(() => () => cleanup.current?.(), [])

  const api = useMemo<DragApi>(
    () => ({ drag, begin, pick: (assignment) => handlers.current.onPick(assignment) }),
    [drag, begin],
  )

  return (
    <DragContext.Provider value={api}>
      {children}
      {drag && (
        <div className="drag-ghost" ref={ghostRef} aria-hidden="true">
          <span>{drag.assignment.icon}</span>
          {drag.assignment.name}
        </div>
      )}
    </DragContext.Provider>
  )
}
