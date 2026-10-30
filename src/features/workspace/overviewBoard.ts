import type { OverviewAlerts, TrainingAlert } from '../../api/overviewAlerts'
import { deriveRosterRows, isFailedRosterDatum, type RosterOverviewRow } from './rosterOverview'
import { completionRateTone } from './metricThresholds'
import { S } from '../../i18n/strings'

export type AlertsState = { status: 'ready'; data: OverviewAlerts } | { status: 'loading' | 'failed' | 'unavailable' }
export type OverviewTag = {
  kind: TrainingAlert['type'] | 'plan_ending' | 'completion' | 'chat' | 'videos'
  tone: 'red' | 'yellow' | 'white' | 'gray'
  count: number
  at: string | null
  target?: TrainingAlert
  endDate?: string
  daysLeft?: number
}
export interface OverviewRow extends RosterOverviewRow { tags: OverviewTag[]; latestAt: number }
export interface OverviewBoard { attention: OverviewRow[]; normal: OverviewRow[]; redCount: number }

export function deriveOverviewBoard(input: Parameters<typeof deriveRosterRows>[0] & { alerts?: AlertsState; requestCount?: number }): OverviewBoard {
  const rows = deriveRosterRows(input).map((row): OverviewRow => {
    const id = row.student.id
    const tags: OverviewTag[] = []
    if (input.alerts?.status === 'ready') {
      const training = input.alerts.data.training.find(item => item.student_id === id)
      for (const kind of ['rpe_over', 'incomplete', 'behind'] as const) {
        const items = training?.items.filter(item => item.type === kind) ?? []
        if (items.length) tags.push({ kind, tone: kind === 'rpe_over' ? 'red' : kind === 'incomplete' ? 'yellow' : 'gray', count: items.length, at: training!.latest_at, target: items[0] })
      }
      const ending = input.alerts.data.plan_ending.find(item => item.student_id === id)
      if (ending) {
        // 054 supplies no occurrence timestamp for plan_ending. Use the start
        // of its three-day window, or the plan update if it entered later.
        const windowStart = Date.parse(`${ending.end_date}T00:00:00Z`) - 3 * 86_400_000
        const updatedAt = input.plansByStudent[id]?.find(plan => plan.id === ending.plan_id)?.updated_at
        const occurredAt = Math.max(windowStart, Date.parse(updatedAt ?? '') || 0)
        const sampledAt = Date.parse(input.alerts.data.generated_at) || occurredAt
        tags.push({ kind: 'plan_ending', tone: 'yellow', count: 1, at: new Date(Math.min(occurredAt, sampledAt)).toISOString(), endDate: ending.end_date, daysLeft: ending.days_left })
      }
    } else if (input.alerts?.status === 'unavailable' && row.pending) {
      const latest = input.plansByStudent[id]?.filter(plan => plan.status === 'published').sort((a, b) => b.end_date.localeCompare(a.end_date))[0]
      tags.push({ kind: 'plan_ending', tone: 'yellow', count: 1, at: latest?.updated_at ?? null, endDate: latest?.end_date })
    }
    if (completionRateTone(row.completionPercent) === 'bad') {
      const overview = row.data.overview
      tags.push({ kind: 'completion', tone: 'red', count: 1, at: overview && !isFailedRosterDatum(overview) ? overview.last_trained_at : null })
    }
    if (row.unreadCount > 0) tags.push({ kind: 'chat', tone: 'white', count: row.unreadCount, at: input.conversations?.find(item => item.other_party.id === id)?.last_message_at ?? null })
    if (row.pendingVideoCount) tags.push({ kind: 'videos', tone: 'white', count: row.pendingVideoCount, at: (input.videosByStudent?.[id] ?? []).filter(video => video.viewed_at == null).map(video => video.created_at).sort().at(-1) ?? null })
    // Behind is always last; it cannot promote a student or affect attention ordering.
    tags.sort((a, b) => Number(a.kind === 'behind') - Number(b.kind === 'behind'))
    return { ...row, tags, needsAttention: tags.some(tag => tag.tone !== 'gray'), latestAt: Math.max(0, ...tags.filter(tag => tag.tone !== 'gray').map(tag => Date.parse(tag.at ?? '') || 0)) }
  })
  const attention = rows.filter(row => row.needsAttention).sort((a, b) => b.latestAt - a.latestAt || a.ordinal - b.ordinal)
  return { attention, normal: rows.filter(row => !row.needsAttention), redCount: attention.length + (input.requestCount ?? 0) }
}

/** Widths are measured by the view; the pure split keeps overflow counting testable. */
export function splitOverviewTags(tags: readonly OverviewTag[], widths: readonly number[], available: number, overflowWidth = 40) {
  const total = widths.reduce((sum, width) => sum + width, 0) + Math.max(0, tags.length - 1) * 6
  if (total <= available) return { visible: [...tags], hidden: [] as OverviewTag[] }
  let used = 0, count = 0
  while (count < tags.length && used + widths[count] + 6 + overflowWidth <= available) {
    used += widths[count] + 6
    count++
  }
  return { visible: tags.slice(0, count), hidden: tags.slice(count) }
}

export function overviewTagLabel(tag: OverviewTag): string {
  const copy = S.workspace.overview
  switch (tag.kind) {
    case 'rpe_over': return copy.rpeOver(tag.count)
    case 'incomplete': return copy.incomplete(tag.count)
    case 'behind': return copy.behind(tag.count)
    case 'chat': return copy.messages(tag.count)
    case 'videos': return copy.videos(tag.count)
    case 'completion': return S.stats.roster.completionLow
    case 'plan_ending': return tag.daysLeft == null ? copy.nextWeekMissing : tag.daysLeft < 0 ? copy.ended(-tag.daysLeft) : copy.remaining(tag.daysLeft)
  }
}
