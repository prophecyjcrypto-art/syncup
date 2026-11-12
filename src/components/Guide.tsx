import { useEffect, useRef, useState } from 'react'
import { t } from '../i18n'
import { primaryButton } from '../lib/ui'
import type { Language } from '../types'

export type FlowStep = 'setup' | 'choreographers' | 'dancers' | 'results'

const FLOW: FlowStep[] = ['setup', 'choreographers', 'dancers', 'results']

export function InfoTip({ lang, text }: { lang: Language; text: string }) {
  const [open, setOpen] = useState(false)
  return (
    <span className="group relative inline-flex align-middle">
      <button
        type="button"
        aria-label={t(lang, 'info')}
        aria-expanded={open}
        onClick={(event) => {
          event.preventDefault()
          event.stopPropagation()
          setOpen((value) => !value)
        }}
        className="inline-flex h-[18px] w-[18px] items-center justify-center rounded-full border border-current/25 text-[10px] font-semibold leading-none opacity-60 hover:opacity-100"
      >
        i
      </button>
      <span role="tooltip" className={open ? 'tip-bubble' : 'tip-bubble hidden group-hover:block group-focus-within:block'}>
        {text}
      </span>
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

export type GuideId = 'events' | 'setup' | 'organizers' | 'participants' | 'results' | 'portal'

const GUIDE_POINTS: Record<GuideId, Parameters<typeof t>[1][]> = {
  events: ['guide_events_1', 'guide_events_2', 'guide_events_3'],
  setup: ['guide_setup_1', 'guide_setup_2', 'guide_setup_3'],
  organizers: ['guide_choreo_1', 'guide_choreo_2', 'guide_choreo_3'],
  participants: ['guide_dancers_1', 'guide_dancers_2', 'guide_dancers_3'],
  results: ['guide_results_1', 'guide_results_2', 'guide_results_3'],
  portal: ['guide_portal_1', 'guide_portal_2', 'guide_portal_3'],
}

function storageKey(id: GuideId): string {
  return `syncup.guide.dismissed.${id}`
}

function readDismissed(id: GuideId): boolean {
  try {
    return localStorage.getItem(storageKey(id)) === '1'
  } catch {
    return false
  }
}

export function InstructionBox({ id, lang, className = '' }: { id: GuideId; lang: Language; className?: string }) {
  const [gone, setGone] = useState(() => readDismissed(id))
  const [checked, setChecked] = useState(false)
  const dialogRef = useRef<HTMLDialogElement>(null)
  const titleId = `guide-${id}-title`

  useEffect(() => {
    if (gone) return
    const dialog = dialogRef.current
    if (!dialog) return
    const modal: HTMLDialogElement = dialog
    modal.setAttribute('closedby', 'none')
    if (!modal.open) modal.showModal()
    const keepOpen = (event: Event) => {
      event.preventDefault()
    }
    modal.addEventListener('cancel', keepOpen)
    const focusFirst = () => {
      const first = modal.querySelector<HTMLElement>('[data-guide-never], button:not(:disabled)')
      ;(first ?? modal).focus({ preventScroll: true, focusVisible: true } as FocusOptions)
    }
    focusFirst()
    const onFocusIn = (event: FocusEvent) => {
      if (!modal.open) return
      if (event.target instanceof Node && modal.contains(event.target)) return
      focusFirst()
    }
    document.addEventListener('focusin', onFocusIn)
    return () => {
      modal.removeEventListener('cancel', keepOpen)
      document.removeEventListener('focusin', onFocusIn)
      try {
        if (modal.open) modal.close()
      } catch {
        // The dialog can already be disconnected when the page changes.
      }
    }
  }, [gone])

  function confirm() {
    if (!checked) return
    try {
      localStorage.setItem(storageKey(id), '1')
    } catch {
      // Storage can be blocked. The box still closes for this visit.
    }
    setGone(true)
  }

  if (gone) return null

  return (
    <dialog
      ref={dialogRef}
      className={`guide-dialog guide-box ${className}`}
      data-guide={id}
      aria-modal="true"
      aria-labelledby={titleId}
      closedby="none"
    >
      <h3 id={titleId} className="guide-box-title">
        {t(lang, 'guide_title')}
      </h3>
      <ul>
        {GUIDE_POINTS[id].map((key) => (
          <li key={key}>{t(lang, key)}</li>
        ))}
      </ul>
      <div className="guide-actions">
        <label className="guide-check">
          <input
            type="checkbox"
            className="guide-check-input"
            checked={checked}
            data-guide-never=""
            onChange={(event) => setChecked(event.target.checked)}
          />
          {t(lang, 'guide_never')}
        </label>
        <button
          type="button"
          className={primaryButton('guide-confirm min-h-11 w-full cursor-pointer px-5 py-2 text-sm sm:w-auto')}
          disabled={!checked}
          data-guide-confirm=""
          onClick={confirm}
        >
          {t(lang, 'guide_got_it')}
        </button>
      </div>
    </dialog>
  )
}

export function HintList({ id, items, className = '' }: { id?: string; items: string[]; className?: string }) {
  if (items.length === 0) return null
  return (
    <ul id={id} className={`hint-list ${className}`}>
      {items.map((item) => (
        <li key={item}>{item}</li>
      ))}
    </ul>
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
