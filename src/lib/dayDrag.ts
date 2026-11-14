/** Days from `from` through `to`, in calendar order. */
export function datesInRange(ordered: readonly string[], from: string, to: string): string[] {
  const start = ordered.indexOf(from)
  const end = ordered.indexOf(to)
  if (start < 0 || end < 0) return []
  const [left, right] = start <= end ? [start, end] : [end, start]
  return ordered.slice(left, right + 1)
}

/** Snapshot plus a continuous range set on or off, matching the day the gesture started on. */
export function paintRange(snapshot: ReadonlySet<string>, ordered: readonly string[], from: string, to: string, turnOn: boolean): string[] {
  const range = new Set(datesInRange(ordered, from, to))
  const next = new Set(snapshot)
  for (const iso of range) {
    if (turnOn) next.add(iso)
    else next.delete(iso)
  }
  return [...next].sort()
}

let swallowClick = false

/** True once, after a drag, so the synthetic click does not toggle the day again. */
export function consumeDayClick(): boolean {
  if (!swallowClick) return false
  swallowClick = false
  return true
}

const HOLD_MS = 280

export function beginDayRangeDrag(input: {
  pointerId: number
  pointerType: string
  button: number
  clientX: number
  clientY: number
  iso: string
  ordered: readonly string[]
  selected: ReadonlySet<string>
  onRange: (next: string[]) => void
}): void {
  if (input.pointerType === 'mouse' && input.button !== 0) return
  const snapshot = new Set(input.selected)
  const turnOn = !snapshot.has(input.iso)
  const originX = input.clientX
  const originY = input.clientY
  let armed = false
  let active = true

  const paint = (iso: string) => {
    input.onRange(paintRange(snapshot, input.ordered, input.iso, iso, turnOn))
  }

  const hold = window.setTimeout(() => {
    if (!active) return
    armed = true
    paint(input.iso)
  }, HOLD_MS)

  const blockScroll = (event: TouchEvent) => {
    if (armed) event.preventDefault()
  }

  const dayAt = (x: number, y: number) => {
    const node = document.elementFromPoint(x, y)?.closest('[data-cal-iso]')
    return node instanceof HTMLElement ? node.getAttribute('data-cal-iso') : null
  }

  const stop = () => {
    active = false
    window.clearTimeout(hold)
    window.removeEventListener('pointermove', onMove)
    window.removeEventListener('pointerup', onUp)
    window.removeEventListener('pointercancel', onUp)
    window.removeEventListener('touchmove', blockScroll)
  }

  const onMove = (event: PointerEvent) => {
    if (!active || event.pointerId !== input.pointerId) return
    const dx = event.clientX - originX
    const dy = event.clientY - originY
    if (!armed) {
      if (dx * dx + dy * dy > 144) {
        swallowClick = true
        window.setTimeout(() => {
          swallowClick = false
        }, 0)
        stop()
      }
      return
    }
    event.preventDefault()
    const iso = dayAt(event.clientX, event.clientY)
    if (iso) paint(iso)
  }

  const onUp = (event: PointerEvent) => {
    if (event.pointerId !== input.pointerId) return
    const dragged = armed
    stop()
    if (!dragged) return
    swallowClick = true
    window.setTimeout(() => {
      swallowClick = false
    }, 0)
  }

  window.addEventListener('pointermove', onMove)
  window.addEventListener('pointerup', onUp)
  window.addEventListener('pointercancel', onUp)
  window.addEventListener('touchmove', blockScroll, { passive: false })
}
