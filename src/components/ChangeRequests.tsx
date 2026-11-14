import { t } from '../i18n'
import { formatBlockLabel } from '../lib/blocks'
import { restoreBlocks, type ChangeRequest } from '../lib/changeRequests'
import { formatLongDate, formatTime } from '../lib/dates'
import { textMuted, textPrimary } from '../lib/ui'
import type { Language, TimeBlock } from '../types'

export function ChangeRequestList({
  lang,
  isDarkMode,
  requests,
  onResolve,
}: {
  lang: Language
  isDarkMode: boolean
  requests: ChangeRequest[]
  onResolve?: (id: string, decision: 'accepted' | 'declined') => void
}) {
  const pending = requests.filter((request) => request.status === 'pending')
  if (pending.length === 0) return null
  const wholeDay = lang === 'zh' ? '全天' : 'Whole day'
  return (
    <section className="space-y-2" data-change-requests="">
      <h3 className={`text-sm font-semibold ${textPrimary(isDarkMode)}`}>{t(lang, 'change_request')}</h3>
      {pending.map((request) => {
        const previous = restoreBlocks(request.previousBlocks)
        const proposed = restoreBlocks(request.proposedBlocks)
        const same = (left: TimeBlock, right: TimeBlock) => left.kind === right.kind && left.start.getTime() === right.start.getTime() && left.end.getTime() === right.end.getTime()
        const added = proposed.filter((block) => !previous.some((item) => same(item, block)))
        const now = request.sessionKeys.map((key) => {
          const start = new Date(key)
          return Number.isNaN(start.getTime()) ? key : `${formatLongDate(start, lang)} ${formatTime(start, lang)}`
        }).join(' · ') || '—'
        const asked = added.map((block) => formatBlockLabel(block, lang, wholeDay)).join(' · ') || '—'
        return (
          <article key={request.id} data-change-request={request.id} className="glass-well space-y-2 rounded-2xl p-3">
            <p className={`text-sm font-bold ${textPrimary(isDarkMode)}`}>{request.personName}</p>
            <p className={`text-xs ${textMuted(isDarkMode)}`}>{t(lang, 'request_now')} {now}</p>
            <p className={`text-xs ${textMuted(isDarkMode)}`}>{t(lang, 'request_asked')} {asked}</p>
            {onResolve ? (
              <div className="flex gap-2">
                <button type="button" data-accept-request="" onClick={() => onResolve(request.id, 'accepted')} className="tone-fill-sage min-h-11 rounded-full px-4 text-xs font-bold">
                  {t(lang, 'accept_request')}
                </button>
                <button type="button" data-decline-request="" onClick={() => onResolve(request.id, 'declined')} className="tone-fill-pink min-h-11 rounded-full px-4 text-xs font-bold">
                  {t(lang, 'decline_request')}
                </button>
              </div>
            ) : null}
          </article>
        )
      })}
    </section>
  )
}
