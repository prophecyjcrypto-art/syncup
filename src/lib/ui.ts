export function cardClass(isDarkMode: boolean): string {
  return isDarkMode ? 'glass text-white' : 'glass text-zinc-800'
}

export function inputClass(isDarkMode: boolean): string {
  return isDarkMode
    ? 'field-control glass-input bg-black/30 border border-white/10 text-white placeholder:text-white/35 outline-none'
    : 'field-control glass-input bg-white/70 border border-white/80 text-zinc-900 placeholder:text-zinc-400 outline-none'
}

export function textPrimary(isDarkMode: boolean): string {
  return isDarkMode ? 'text-[color:var(--p-ink)]' : 'text-zinc-900'
}

export function textMuted(isDarkMode: boolean): string {
  return isDarkMode ? 'text-[color:var(--p-muted)]' : 'text-zinc-600'
}

export function primaryButton(extra = ''): string {
  return `btn-glow btn-primary btn-press rounded-full font-semibold disabled:opacity-40 ${extra}`
}

/** Quiet text/control action — not a pill CTA. */
export function quietButton(extra = ''): string {
  return `inline-flex h-8 items-center rounded-md px-2 text-xs font-bold opacity-75 transition-opacity hover:opacity-100 ${extra}`
}

/** Filled, rounded group. Spacing separates these; they do not use a hairline rule. */
export function groupSurface(extra = ''): string {
  return `glass-well min-w-0 card-pad ${extra}`.trim()
}
