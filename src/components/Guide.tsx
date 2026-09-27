import { useState, type ReactNode } from 'react'
import { t } from '../i18n'
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

export function GuideNote({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <p className={`guide-note mt-3 opacity-75 ${className}`}>{children}</p>
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
    <ol className="mx-auto mb-8 flex w-full max-w-4xl flex-wrap items-center gap-x-2 gap-y-3 text-sm">
      {FLOW.map((step, index) => {
        const active = step === current
        const can = enabled[step]
        return (
          <li key={step} className="flex items-center gap-2">
            <button
              type="button"
              disabled={!can}
              onClick={() => onJump(step)}
              className={`flex items-center gap-2 rounded-full py-1 pr-2 disabled:cursor-default ${active ? '' : 'opacity-55'}`}
            >
              <span
                className={`flex h-6 w-6 items-center justify-center rounded-full text-[11px] ${
                  active ? 'bg-[#7c7bb9] text-white' : 'glass-well'
                }`}
              >
                {index + 1}
              </span>
              <span className={active ? 'font-medium' : ''}>{labels[step]}</span>
            </button>
            {index < FLOW.length - 1 && <span className="opacity-25">—</span>}
          </li>
        )
      })}
    </ol>
  )
}
