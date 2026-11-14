import { createContext, useContext, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react'
import { textMuted } from '../lib/ui'

type PersonRef = { id: string; name: string }
type Selection = { personId: string; fromGroupId: string | null }

type Board = {
  selected: Selection | null
  overId: string | null
  consumeDragClick: () => boolean
  toggleSelect: (personId: string, fromGroupId: string | null) => void
  move: (personId: string, fromGroupId: string | null, toGroupId: string | null) => void
  beginDrag: (person: PersonRef, fromGroupId: string | null, event: ReactPointerEvent<HTMLButtonElement>) => void
}

const AssignContext = createContext<Board | null>(null)

export function useAssigning(): boolean {
  return useContext(AssignContext)?.selected != null
}

export function AssignBoard({
  children,
  onMove,
}: {
  children: ReactNode
  onMove: (personId: string, fromGroupId: string | null, toGroupId: string | null) => void
}) {
  const [selected, setSelected] = useState<Selection | null>(null)
  const [overId, setOverId] = useState<string | null>(null)
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
    onMove(personId, fromGroupId, toGroupId)
  }

  function beginDrag(person: PersonRef, fromGroupId: string | null, event: ReactPointerEvent<HTMLButtonElement>) {
    if (event.pointerType === 'touch' || event.button !== 0) return
    const pointerId = event.pointerId
    const originX = event.clientX
    const originY = event.clientY
    dragRef.current = { id: person.id, fromGroupId, moved: false }
    const onPointerMove = (ev: PointerEvent) => {
      if (ev.pointerId !== pointerId || !dragRef.current) return
      const dx = ev.clientX - originX
      const dy = ev.clientY - originY
      if (!dragRef.current.moved && dx * dx + dy * dy < 36) return
      dragRef.current.moved = true
      setGhost({ name: person.name, x: ev.clientX, y: ev.clientY })
      const node = document.elementFromPoint(ev.clientX, ev.clientY)
      setOverId(node?.closest('[data-drop-group]')?.getAttribute('data-drop-group') ?? null)
    }
    const onPointerUp = (ev: PointerEvent) => {
      if (ev.pointerId !== pointerId) return
      window.removeEventListener('pointermove', onPointerMove)
      window.removeEventListener('pointerup', onPointerUp)
      window.removeEventListener('pointercancel', onPointerUp)
      const drag = dragRef.current
      dragRef.current = null
      setGhost(null)
      setOverId(null)
      if (!drag?.moved) return
      suppress.current = true
      const stopClick = (click: MouseEvent) => {
        click.preventDefault()
        click.stopPropagation()
        window.removeEventListener('click', stopClick, true)
      }
      window.addEventListener('click', stopClick, true)
      const node = document.elementFromPoint(ev.clientX, ev.clientY)
      const zone = node?.closest('[data-drop-group]')?.getAttribute('data-drop-group') ?? null
      if (zone) move(drag.id, drag.fromGroupId, zone === 'all' ? null : zone)
    }
    window.addEventListener('pointermove', onPointerMove)
    window.addEventListener('pointerup', onPointerUp)
    window.addEventListener('pointercancel', onPointerUp)
  }

  const board: Board = {
    selected,
    overId,
    consumeDragClick,
    toggleSelect: (personId, fromGroupId) => {
      if (consumeDragClick()) return
      setSelected((current) =>
        current?.personId === personId && current.fromGroupId === fromGroupId ? null : { personId, fromGroupId },
      )
    },
    move,
    beginDrag,
  }

  return (
    <AssignContext.Provider value={board}>
      {children}
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
  const armed = board.selected != null
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
      className={`min-h-11 rounded-2xl p-1.5 ${hot ? 'bg-[#7c7bb9]/30 ring-2 ring-[#7c7bb9]' : armed ? 'ring-1 ring-[#7c7bb9]/45' : ''}`}
    >
      {children}
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
            onClick={(event) => {
              event.stopPropagation()
              board.toggleSelect(person.id, fromGroupId)
            }}
            className={`min-h-11 max-w-full cursor-grab select-none truncate rounded-full px-3 text-sm font-semibold ${
              on ? 'bg-[#7c7bb9] text-white' : isDarkMode ? 'bg-white/10 text-white' : 'bg-black/[0.06] text-zinc-900'
            }`}
          >
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
