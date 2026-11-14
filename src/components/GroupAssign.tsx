import { createContext, useContext, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react'
import type { RoleGrantKind } from '../lib/roles'
import { textMuted } from '../lib/ui'

type PersonRef = { id: string; name: string }
type Selection = { personId: string; fromGroupId: string | null }

type Board = {
  selected: Selection | null
  overId: string | null
  dragging: boolean
  dragId: string | null
  consumeDragClick: () => boolean
  toggleSelect: (personId: string, fromGroupId: string | null) => void
  move: (personId: string, fromGroupId: string | null, toGroupId: string | null) => void
  grant: (personId: string, role: RoleGrantKind) => void
  beginDrag: (person: PersonRef, fromGroupId: string | null, event: ReactPointerEvent<HTMLButtonElement>) => void
}

function dropAt(x: number, y: number): { group: string | null; role: RoleGrantKind | null } {
  const node = document.elementFromPoint(x, y)
  const role = node?.closest('[data-drop-role]')?.getAttribute('data-drop-role')
  const group = node?.closest('[data-drop-group]')?.getAttribute('data-drop-group') ?? null
  return { group, role: role === 'organizer' || role === 'admin' ? role : null }
}

const AssignContext = createContext<Board | null>(null)

export function useAssigning(): boolean {
  return useContext(AssignContext)?.selected != null
}

function Grip() {
  return (
    <svg data-grip="" width="10" height="14" viewBox="0 0 10 14" aria-hidden="true" className="shrink-0 opacity-70">
      <circle cx="2.5" cy="2" r="1.05" fill="currentColor" />
      <circle cx="7.5" cy="2" r="1.05" fill="currentColor" />
      <circle cx="2.5" cy="7" r="1.05" fill="currentColor" />
      <circle cx="7.5" cy="7" r="1.05" fill="currentColor" />
      <circle cx="2.5" cy="12" r="1.05" fill="currentColor" />
      <circle cx="7.5" cy="12" r="1.05" fill="currentColor" />
    </svg>
  )
}

export function AssignBoard({
  children,
  onMove,
  onGrant,
}: {
  children: ReactNode
  onMove: (personId: string, fromGroupId: string | null, toGroupId: string | null) => void
  onGrant?: (personId: string, role: RoleGrantKind) => void
}) {
  const [selected, setSelected] = useState<Selection | null>(null)
  const [overId, setOverId] = useState<string | null>(null)
  const [dragging, setDragging] = useState(false)
  const [dragId, setDragId] = useState<string | null>(null)
  const [ghost, setGhost] = useState<{ name: string; x: number; y: number } | null>(null)
  const suppress = useRef(false)
  const dragRef = useRef<{ id: string; fromGroupId: string | null; moved: boolean } | null>(null)

  function consumeDragClick() {
    if (!suppress.current) return false
    suppress.current = false
    return true
  }

  function move(personId: string, fromGroupId: string | null, toGroupId: string | null) {
    setSelected(null)
    setOverId(null)
    setDragging(false)
    onMove(personId, fromGroupId, toGroupId)
  }

  function grant(personId: string, role: RoleGrantKind) {
    setSelected(null)
    setOverId(null)
    setDragging(false)
    onGrant?.(personId, role)
  }

  function beginDrag(person: PersonRef, fromGroupId: string | null, event: ReactPointerEvent<HTMLButtonElement>) {
    if (event.pointerType === 'mouse' && event.button !== 0) return
    const pointerId = event.pointerId
    const originX = event.clientX
    const originY = event.clientY
    const touch = event.pointerType === 'touch'
    dragRef.current = { id: person.id, fromGroupId, moved: false }
    let listening = true

    const place = (x: number, y: number) => {
      if (!dragRef.current) return
      dragRef.current.moved = true
      setDragging(true)
      setDragId(person.id)
      setGhost({ name: person.name, x, y })
      const drop = dropAt(x, y)
      setOverId(drop.role ? `role:${drop.role}` : drop.group)
      if (y < 88) window.scrollBy(0, -16)
      else if (y > window.innerHeight - 88) window.scrollBy(0, 16)
    }

    const hold = touch
      ? window.setTimeout(() => {
          if (listening && dragRef.current && !dragRef.current.moved) place(originX, originY)
        }, 240)
      : 0

    const blockTouchScroll = (ev: TouchEvent) => {
      if (dragRef.current?.moved) ev.preventDefault()
    }

    const end = (ev: PointerEvent) => {
      if (ev.pointerId !== pointerId) return
      listening = false
      window.clearTimeout(hold)
      window.removeEventListener('pointermove', onPointerMove)
      window.removeEventListener('pointerup', end)
      window.removeEventListener('pointercancel', end)
      window.removeEventListener('touchmove', blockTouchScroll)
      const drag = dragRef.current
      dragRef.current = null
      setGhost(null)
      setOverId(null)
      setDragging(false)
      setDragId(null)
      if (!drag?.moved) return
      suppress.current = true
      const stopClick = (click: MouseEvent) => {
        click.preventDefault()
        click.stopPropagation()
        window.removeEventListener('click', stopClick, true)
      }
      window.addEventListener('click', stopClick, true)
      const drop = dropAt(ev.clientX, ev.clientY)
      if (drop.role) {
        grant(drag.id, drop.role)
        return
      }
      if (drop.group) move(drag.id, drag.fromGroupId, drop.group === 'all' ? null : drop.group)
    }

    const onPointerMove = (ev: PointerEvent) => {
      if (!listening || ev.pointerId !== pointerId || !dragRef.current) return
      const dx = ev.clientX - originX
      const dy = ev.clientY - originY
      if (!dragRef.current.moved && dx * dx + dy * dy < (touch ? 64 : 36)) return
      window.clearTimeout(hold)
      if (touch) ev.preventDefault()
      place(ev.clientX, ev.clientY)
    }

    if (touch) window.addEventListener('touchmove', blockTouchScroll, { passive: false })
    window.addEventListener('pointermove', onPointerMove)
    window.addEventListener('pointerup', end)
    window.addEventListener('pointercancel', end)
  }

  const board: Board = {
    selected,
    overId,
    dragging,
    dragId,
    consumeDragClick,
    toggleSelect: (personId, fromGroupId) => {
      if (consumeDragClick()) return
      setSelected((current) =>
        current?.personId === personId && current.fromGroupId === fromGroupId ? null : { personId, fromGroupId },
      )
    },
    move,
    grant,
    beginDrag,
  }

  return (
    <AssignContext.Provider value={board}>
      <div data-assign-board="" className="flex flex-col gap-4" data-assign-dragging={dragging || selected != null ? '' : undefined}>
      {children}
      </div>
      {ghost ? (
        <span
          data-assign-ghost=""
          className="pointer-events-none fixed z-50 min-h-11 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#7c7bb9] px-3 py-2 text-sm font-bold text-white shadow-lg"
          style={{ left: ghost.x, top: ghost.y }}
        >
          {ghost.name}
        </span>
      ) : null}
    </AssignContext.Provider>
  )
}

export function AssignTarget({
  targetId,
  ariaLabel,
  children,
}: {
  targetId: string | null
  ariaLabel: string
  children: ReactNode
}) {
  const board = useContext(AssignContext)
  if (!board) return null
  const key = targetId ?? 'all'
  const hot = board.overId === key
  const armed = board.dragging || board.selected != null
  return (
    <div
      data-drop-group={key}
      data-assign-tray=""
      role="group"
      aria-label={ariaLabel}
      onClick={(event) => {
        const clicked = event.target as HTMLElement
        if (clicked.closest('[data-person-id]')) return
        if (clicked.closest('button, a, input, textarea, select') && !clicked.closest('[data-assign-hit]')) return
        if (board.consumeDragClick()) return
        if (!board.selected) return
        board.move(board.selected.personId, board.selected.fromGroupId, targetId)
      }}
      className={`assign-target min-h-11 rounded-2xl p-1.5 ${hot ? 'assign-hot' : ''} ${armed ? 'assign-armed' : ''}`}
    >
      {children}
    </div>
  )
}

export function AssignRoleTarget({
  role,
  ariaLabel,
  hint,
  children,
}: {
  role: RoleGrantKind
  ariaLabel: string
  hint?: string
  children: ReactNode
}) {
  const board = useContext(AssignContext)
  if (!board) return null
  const key = `role:${role}`
  const hot = board.overId === key
  const armed = board.dragging || board.selected != null
  return (
    <div
      data-drop-role={role}
      data-assign-tray=""
      role="group"
      aria-label={ariaLabel}
      onClick={(event) => {
        const clicked = event.target as HTMLElement
        if (clicked.closest('[data-person-id]')) return
        if (clicked.closest('button, a, input, textarea, select') && !clicked.closest('[data-assign-hit]')) return
        if (board.consumeDragClick()) return
        if (!board.selected) return
        board.grant(board.selected.personId, role)
      }}
      className={`assign-target min-h-16 rounded-2xl p-1.5 ${hot ? 'assign-hot' : ''} ${armed ? 'assign-armed' : ''}`}
    >
      {children}
      {hint ? (
        <p data-drop-hint="" className="px-1 py-2 text-sm font-medium opacity-70">
          {hint}
        </p>
      ) : null}
    </div>
  )
}

export function AssignChips({
  people,
  fromGroupId,
  isDarkMode,
}: {
  people: PersonRef[]
  fromGroupId: string | null
  isDarkMode: boolean
}) {
  const board = useContext(AssignContext)
  if (!board || people.length === 0) return null
  return (
    <div className="flex flex-wrap gap-1.5">
      {people.map((person) => {
        const on = board.selected?.personId === person.id && board.selected.fromGroupId === fromGroupId
        return (
          <button
            key={person.id}
            type="button"
            data-person-id={person.id}
            data-from-group={fromGroupId ?? 'all'}
            aria-pressed={on}
            onPointerDown={(event) => board.beginDrag(person, fromGroupId, event)}
            onContextMenu={(event) => event.preventDefault()}
            onClick={(event) => {
              event.stopPropagation()
              board.toggleSelect(person.id, fromGroupId)
            }}
            className={`assign-chip inline-flex min-h-11 max-w-full cursor-grab select-none items-center gap-1.5 truncate rounded-full px-3 text-sm font-semibold touch-none ${
              board.dragId === person.id ? 'opacity-40' : ''
            } ${on ? 'tone-fill-purple' : isDarkMode ? 'bg-white/10 text-white' : 'bg-black/[0.06] text-zinc-900'}`}
          >
            <Grip />
            {person.name}
          </button>
        )
      })}
    </div>
  )
}

export function AssignTray({
  targetId,
  people,
  isDarkMode,
  label,
  ariaLabel,
}: {
  targetId: string | null
  people: PersonRef[]
  isDarkMode: boolean
  label?: string
  ariaLabel: string
}) {
  return (
    <AssignTarget targetId={targetId} ariaLabel={ariaLabel}>
      {label ? <p className={`px-1 text-[10px] font-bold uppercase tracking-widest ${textMuted(isDarkMode)}`}>{label}</p> : null}
      <AssignChips people={people} fromGroupId={targetId} isDarkMode={isDarkMode} />
    </AssignTarget>
  )
}
