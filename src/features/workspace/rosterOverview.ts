import type {
  ChatConversation,
  CoachStudent,
  ExerciseStatsOverview,
  PlanResponse,
  PlanWithChildren,
  StudentOnboardingProfile,
} from '../../api/types'
import { isStudentPendingNextWeek } from './pendingPlan'
import { completionRateTone } from './metricThresholds'

export type RosterTab = 'all' | 'pending' | 'attention'

export interface RosterDataEntry {
  overview?: ExerciseStatsOverview | null
  profile?: StudentOnboardingProfile | null
  profileError?: boolean
  weekTonnageKg?: number | null
}

export type RosterDataByStudent = Record<string, RosterDataEntry>

export interface RosterOverviewRow {
  student: CoachStudent
  ordinal: number
  completionPercent: number | null
  pending: boolean | null
  needsAttention: boolean
  redFlag: string
  competitionDays: number | null
  isRegistered: boolean | null
  unreadCount: number
  data: RosterDataEntry
}

export interface RosterCounts {
  all: number
  pending: number
  attention: number
}

function isoDate(reference: Date): string {
  const year = reference.getFullYear()
  const month = String(reference.getMonth() + 1).padStart(2, '0')
  const day = String(reference.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function dateOnlyDiff(from: string, to: string): number | null {
  const fromParts = from.split('-').map(Number)
  const toParts = to.split('-').map(Number)
  if (fromParts.length !== 3 || toParts.length !== 3 || [...fromParts, ...toParts].some((part) => !Number.isFinite(part))) return null
  return Math.round((
    Date.UTC(toParts[0], toParts[1] - 1, toParts[2])
    - Date.UTC(fromParts[0], fromParts[1] - 1, fromParts[2])
  ) / 86_400_000)
}

export function completionPercent(overview: ExerciseStatsOverview | null | undefined): number | null {
  if (!overview || !Number.isFinite(overview.recent_4w.completion_rate)) return null
  return Math.round(overview.recent_4w.completion_rate * 100)
}

export function competitionDistance(
  profile: StudentOnboardingProfile | null | undefined,
  profileError = false,
  reference = new Date(),
): { days: number | null; registered: boolean | null } {
  if (profileError || profile == null) return { days: null, registered: null }
  if (profile.is_competing === false) return { days: null, registered: false }
  if (profile.is_competing !== true) return { days: null, registered: null }
  if (!profile.competition_date) return { days: null, registered: true }
  return {
    days: dateOnlyDiff(isoDate(reference), profile.competition_date),
    registered: true,
  }
}

export function deriveRedFlag({
  completion,
  pending,
  competitionDays,
}: {
  completion: number | null
  pending: boolean | null
  competitionDays: number | null
}): string {
  const flags: string[] = []
  if (completionRateTone(completion) === 'bad') flags.push('完成率低')

  const competitionIsNear = competitionDays != null && competitionDays >= 0 && competitionDays <= 35
  if (competitionIsNear) {
    const weeks = Math.ceil(competitionDays / 7)
    flags.push(pending ? `待排 · 赛前 ${weeks} 周` : `赛前 ${weeks} 周`)
  }
  return flags.join(' · ')
}

export function deriveRosterRows({
  students,
  dataByStudent,
  plansByStudent,
  conversations,
  reference = new Date(),
}: {
  students: CoachStudent[]
  dataByStudent: RosterDataByStudent
  plansByStudent: Record<string, PlanResponse[]>
  conversations: ChatConversation[] | null
  reference?: Date
}): RosterOverviewRow[] {
  const unreadByStudent = new Map(
    (conversations ?? []).map((conversation) => [conversation.other_party.id, conversation.unread_count]),
  )

  return students.map((student, index) => {
    const data = dataByStudent[student.id] ?? {}
    const completion = completionPercent(data.overview)
    const pending = Object.hasOwn(plansByStudent, student.id)
      ? isStudentPendingNextWeek(plansByStudent[student.id], reference)
      : null
    const competition = competitionDistance(data.profile, data.profileError, reference)
    const redFlag = deriveRedFlag({
      completion,
      pending,
      competitionDays: competition.days,
    })
    return {
      student,
      ordinal: index + 1,
      completionPercent: completion,
      pending,
      needsAttention: redFlag !== '',
      redFlag,
      competitionDays: competition.days,
      isRegistered: competition.registered,
      unreadCount: unreadByStudent.get(student.id) ?? 0,
      data,
    }
  })
}

export function deriveRosterCounts(rows: readonly RosterOverviewRow[]): RosterCounts {
  return {
    all: rows.length,
    pending: rows.filter((row) => row.pending === true).length,
    attention: rows.filter((row) => row.needsAttention).length,
  }
}

export function filterRosterRows(rows: readonly RosterOverviewRow[], tab: RosterTab): RosterOverviewRow[] {
  if (tab === 'pending') return rows.filter((row) => row.pending === true)
  if (tab === 'attention') return rows.filter((row) => row.needsAttention)
  return [...rows]
}

export function findCurrentPublishedPlan(
  plans: readonly PlanResponse[],
  reference = new Date(),
): PlanResponse | null {
  const today = isoDate(reference)
  return [...plans]
    .filter((plan) => plan.status === 'published' && plan.start_date <= today && plan.end_date >= today)
    .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime())[0] ?? null
}

/** Planned kg tonnage for the calendar week containing `reference`. */
export function currentPublishedWeekTonnage(plan: PlanWithChildren, reference = new Date()): number | null {
  const today = isoDate(reference)
  const offset = dateOnlyDiff(plan.start_date, today)
  if (offset == null || offset < 0) return null
  const weekNumber = Math.floor(offset / 7) + 1
  if (weekNumber > plan.plan_weeks) return null

  return plan.days
    .filter((day) => day.week_number === weekNumber)
    .flatMap((day) => day.exercises)
    .flatMap((exercise) => exercise.sets)
    .reduce((total, set) => {
      if (set.intensity_mode !== 'weight') return total
      const weight = Number(set.target_value)
      return Number.isFinite(weight) ? total + weight * set.target_reps : total
    }, 0)
}
