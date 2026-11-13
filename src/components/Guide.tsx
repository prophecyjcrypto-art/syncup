import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import { t } from '../i18n'
import type { Language } from '../types'

export type FlowStep = 'setup' | 'choreographers' | 'dancers' | 'results'

const FLOW: FlowStep[] = ['setup', 'choreographers', 'dancers', 'results']

export function InfoTip({ lang, text, name }: { lang: Language; text: string; name?: string }) {
  const [pinned, setPinned] = useState(false)
  const [hover, setHover] = useState(false)
  const [focus, setFocus] = useState(false)
  const rootRef = useRef<HTMLSpanElement>(null)
  const bubbleRef = useRef<HTMLSpanElement>(null)
  const fromPointer = useRef(false)
  const touchAt = useRef(0)
  const pinnedRef = useRef(false)
  const hoverRef = useRef(false)
  const tipId = useId()
  const open = pinned || hover || focus
  pinnedRef.current = pinned
  hoverRef.current = hover

  useEffect(() => {
    function onPointerDown(event: PointerEvent) {
      if (event.pointerType !== 'mouse') {
        touchAt.current = Date.now()
        if (hoverRef.current) setHover(false)
      }
      if (pinnedRef.current && !rootRef.current?.contains(event.target as Node)) setPinned(false)
    }
    function onKey(event: KeyboardEvent) {
      if (event.key !== 'Escape') return
      setPinned(false)
      setHover(false)
      setFocus(false)
    }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [])

  useLayoutEffect(() => {
    const root = rootRef.current
    const bubble = bubbleRef.current
    if (!open || !root || !bubble) return
    const card = root.closest('.glass')
    const previous = card instanceof HTMLElement ? { zIndex: card.style.zIndex, position: card.style.position } : null
    if (card instanceof HTMLElement) {
      if (getComputedStyle(card).position === 'static') card.style.position = 'relative'
      card.style.zIndex = '40'
    }
    const pad = 12
    bubble.style.left = '0px'
    const rect = bubble.getBoundingClientRect()
    let shift = 0
    if (rect.right > window.innerWidth - pad) shift = rect.right - (window.innerWidth - pad)
    if (rect.left - shift < pad) shift -= pad - (rect.left - shift)
    bubble.style.left = `${-shift}px`
    return () => {
      if (!(card instanceof HTMLElement) || !previous) return
      card.style.zIndex = previous.zIndex
      card.style.position = previous.position
    }
  }, [open, text])

  function allowHover(event: { pointerType: string }) {
    return event.pointerType === 'mouse' && Date.now() - touchAt.current > 1000
  }

  return (
    <span
      ref={rootRef}
      className={`info-tip ${open ? 'z-50' : ''}`}
      onPointerEnter={(event) => {
        if (allowHover(event)) setHover(true)
      }}
      onPointerLeave={(event) => {
        if (event.pointerType === 'mouse') setHover(false)
      }}
    >
      <button
        type="button"
        data-info={name}
        aria-label={t(lang, 'info')}
        aria-expanded={open}
        aria-describedby={open ? tipId : undefined}
        onPointerDown={(event) => {
          fromPointer.current = true
          if (event.pointerType !== 'mouse') touchAt.current = Date.now()
        }}
        onFocus={() => {
          if (!fromPointer.current) setFocus(true)
        }}
        onBlur={() => {
          fromPointer.current = false
          setFocus(false)
        }}
        onClick={(event) => {
          event.preventDefault()
          event.stopPropagation()
          setPinned((value) => !value)
        }}
        className="inline-flex h-[18px] w-[18px] items-center justify-center rounded-full border border-current/25 text-[10px] font-semibold leading-none opacity-60 hover:opacity-100"
      >
        i
      </button>
      {open ? (
        <span ref={bubbleRef} id={tipId} role="tooltip" className="tip-bubble">
          <span className="tip-bubble-body">{text}</span>
        </span>
      ) : null}
    </span>
  )
}

export function FieldLabel({
  lang,
  label,
  tip,
  className = '',
}: {
  lang: Language
  label: string
  tip?: string
  className?: string
}) {
  return (
    <span className={`inline-flex items-center gap-1.5 ${className}`}>
      {label}
      {tip ? <InfoTip lang={lang} text={tip} /> : null}
    </span>
  )
}

export function MiniSteps({ steps }: { steps: string[] }) {
  return (
    <ol className="mb-5 grid grid-cols-1 gap-2 sm:grid-cols-3">
      {steps.map((step, index) => (
        <li key={step} className="glass-well flex items-center gap-3 rounded-2xl px-3 py-2.5 text-sm">
          <span className="text-[11px] font-medium tabular-nums opacity-45">{String(index + 1).padStart(2, '0')}</span>
          <span>{step}</span>
        </li>
      ))}
    </ol>
  )
}

export function FlowSteps({
  lang,
  current,
  enabled,
  onJump,
}: {
  lang: Language
  current: FlowStep
  enabled: Record<FlowStep, boolean>
  onJump: (step: FlowStep) => void
}) {
  const labels: Record<FlowStep, string> = {
    setup: t(lang, 'flow_event'),
    choreographers: t(lang, 'manage_leadership'),
    dancers: t(lang, 'manage_members'),
    results: t(lang, 'results'),
  }
  return (
    <ol className="chip-row mx-auto w-full max-w-4xl text-sm">
      {FLOW.map((step, index) => {
        const active = step === current
        const can = enabled[step]
        return (
          <li key={step} className="flex shrink-0 items-center gap-1">
            <button
              type="button"
              disabled={!can}
              onClick={() => onJump(step)}
              className={`flex min-h-11 items-center gap-2 rounded-full pr-2 disabled:cursor-default ${active ? '' : 'opacity-55'}`}
            >
              <span
                className={`flex h-6 w-6 items-center justify-center rounded-full text-[11px] ${
                  active ? 'bg-[#7c7bb9] text-white' : 'glass-well'
                }`}
              >
                {index + 1}
              </span>
              <span className={`whitespace-nowrap ${active ? 'font-medium' : ''}`}>{labels[step]}</span>
            </button>
            {index < FLOW.length - 1 && <span className="opacity-25">—</span>}
          </li>
        )
      })}
    </ol>
  )
}
