export function cardClass(isDarkMode: boolean): string {
  return isDarkMode ? 'glass text-white' : 'glass text-zinc-800'
}

export function inputClass(isDarkMode: boolean): string {
  return isDarkMode
    ? 'glass-input bg-black/30 border border-white/10 text-white placeholder:text-white/35 outline-none'
    : 'glass-input bg-white/70 border border-white/80 text-zinc-900 placeholder:text-zinc-400 outline-none'
}

export function textPrimary(isDarkMode: boolean): string {
  return isDarkMode ? 'text-white' : 'text-zinc-900'
}

export function textMuted(isDarkMode: boolean): string {
  return isDarkMode ? 'text-zinc-300' : 'text-zinc-600'
}

export function primaryButton(extra = ''): string {
  return `btn-glow rounded-full bg-[#7c7bb9] font-semibold text-white disabled:opacity-40 ${extra}`
}
