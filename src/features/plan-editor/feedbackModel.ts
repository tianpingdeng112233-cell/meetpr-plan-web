import { isBlockTrainingDay } from './blockGridModel'
import { recommendedDateForDay } from './mapping'
import type { CoachFeedbackResponse, StudentSetLog, StudentVideo } from '../../api/types'
import type { Week } from './types'

export interface VideoGroup { total: number; pending: number; videos: StudentVideo[] }
export interface FeedbackEntry {
  video: StudentVideo
  inPlan: boolean
  week?: number
  day?: number
  rowId?: string
  dayId?: string
  addedExerciseId?: string
}
export function firstGroupVideo(group: VideoGroup): StudentVideo | undefined {
  return group.videos.find(video => video.viewed_at == null) ?? group.videos[0]
}

/** Join on persisted identities, never on exercise names or approximate dates. */
export function deriveVideoFeedback(weeks: Week[], videos: readonly StudentVideo[], logs: readonly StudentSetLog[] = [], startDate?: string | null) {
  const rows = new Map<string, VideoGroup>()
  const studentAdded = new Map<string, Map<string, VideoGroup>>()
  const positions = new Map<string, Omit<FeedbackEntry, 'video'>>()
  const dayPositions = new Map<string, { week: number; day: number; order: number }>()
  const rowOrder = new Map<string, number>()
  let order = 0
  for (const week of [...weeks].sort((a, b) => a.num - b.num)) {
    const days = [...week.days].filter(isBlockTrainingDay).sort((a, b) => startDate
      ? recommendedDateForDay(startDate, week.num, a).localeCompare(recommendedDateForDay(startDate, week.num, b)) || a.dow - b.dow
      : a.dow - b.dow)
    days.forEach((day, index) => {
      for (const row of day.rows) {
        if (row.serverRowId) positions.set(row.serverRowId, { inPlan: true, week: week.num, day: index + 1, rowId: row.id, dayId: day.serverDayId ?? undefined })
        rowOrder.set(row.id, order++)
      }
      if (day.serverDayId) dayPositions.set(day.serverDayId, { week: week.num, day: index + 1, order: order++ })
    })
  }
  const logById = new Map(logs.map(log => [log.id, log]))
  const entries: FeedbackEntry[] = videos.map(video => {
    const position = video.plan_exercise_id ? positions.get(video.plan_exercise_id) : undefined
    if (position) return { ...position, video }
    const log = video.set_log_id ? logById.get(video.set_log_id) : undefined
    const day = log?.adhoc && log.plan_day_id ? dayPositions.get(log.plan_day_id) : undefined
    return day && log ? { video, inPlan: true, week: day.week, day: day.day, dayId: log.plan_day_id!, addedExerciseId: log.exercise_id } : { video, inPlan: false }
  })
  const entryOrder = (entry: FeedbackEntry) => entry.rowId ? rowOrder.get(entry.rowId)! : dayPositions.get(entry.dayId!)!.order
  entries.sort((a, b) => {
    if (a.inPlan !== b.inPlan) return a.inPlan ? -1 : 1
    if (!a.inPlan) return (b.video.logged_at ?? b.video.created_at).localeCompare(a.video.logged_at ?? a.video.created_at)
    return entryOrder(a) - entryOrder(b) || (a.addedExerciseId ?? '').localeCompare(b.addedExerciseId ?? '') || (a.video.set_index ?? 0) - (b.video.set_index ?? 0)
  })
  const add = (map: Map<string, VideoGroup>, key: string, video: StudentVideo) => {
    const group = map.get(key) ?? { total: 0, pending: 0, videos: [] }
    group.total++; if (video.viewed_at == null) group.pending++
    group.videos.push(video); map.set(key, group)
  }
  for (const entry of entries) {
    if (entry.rowId) add(rows, entry.rowId, entry.video)
    if (entry.addedExerciseId && entry.dayId) {
      const groups = studentAdded.get(entry.dayId) ?? new Map<string, VideoGroup>()
      add(groups, entry.addedExerciseId, entry.video); studentAdded.set(entry.dayId, groups)
    }
  }
  return { rows, studentAdded, entries }
}

export interface DayFeedbackDetail {
  feedback: CoachFeedbackResponse
  source: 'day' | 'set'
  exerciseName: string | null
  exerciseNameEn?: string | null
  setIndex: number | null
}
export interface FeedbackDay {
  dayId: string
  week: number
  day: number
  date: string | null
  /** Monday-first weekday of the actual training date. */
  weekday: number | null
  feedback: DayFeedbackDetail[]
}

export function deriveDayFeedback(
  weeks: Week[], logs: readonly StudentSetLog[],
  feedback: readonly CoachFeedbackResponse[],
  videos: readonly StudentVideo[], startDate?: string | null,
  today = new Date().toLocaleDateString('en-CA'),
) {
  const days: FeedbackDay[] = []
  for (const week of weeks) {
    const ordered = [...week.days].filter(isBlockTrainingDay).sort((a, b) => startDate
      ? recommendedDateForDay(startDate, week.num, a).localeCompare(recommendedDateForDay(startDate, week.num, b)) || a.dow - b.dow
      : a.dow - b.dow)
    ordered.forEach((day, index) => {
      if (!day.serverDayId || !day.completedAt) return
      const rowIds = new Set(day.rows.map(row => row.serverRowId).filter(Boolean))
      const dates = logs.filter(log => log.plan_day_id === day.serverDayId || (log.plan_exercise_id && rowIds.has(log.plan_exercise_id)))
        .map(log => log.logged_date).filter(Boolean).sort()
      // Completion is not a training date (late logging and time zones can differ).
      const date = dates[0] ?? null
      if ((date ?? day.completedAt.slice(0, 10)) > today) return
      days.push({ dayId: day.serverDayId, week: week.num, day: index + 1, date,
        weekday: date ? (new Date(`${date}T12:00:00`).getDay() + 6) % 7 : null, feedback: [] })
    })
  }
  days.sort((a, b) => (a.date ?? '').localeCompare(b.date ?? '') || a.week - b.week || a.day - b.day)
  const byDay = new Map(days.map(day => [day.dayId, day]))
  const byDate = new Map<string, FeedbackDay[]>()
  for (const day of days) if (day.date) byDate.set(day.date, [...(byDate.get(day.date) ?? []), day])
  const exercises = new Map(weeks.flatMap(week => week.days.flatMap(day => day.rows
    .filter(row => row.serverRowId).map(row => [row.serverRowId!, { row, dayId: day.serverDayId }] as const))))
  const videoById = new Map(videos.map(video => [video.id, video]))
  for (const item of feedback) {
    const exercise = item.plan_exercise_id ? exercises.get(item.plan_exercise_id) : undefined
    // A supplied date is authoritative: never silently fall back from another date.
    const targets = item.day_date ? byDate.get(item.day_date) ?? [] : exercise?.dayId && byDay.has(exercise.dayId) ? [byDay.get(exercise.dayId)!] : []
    const video = item.video_id ? videoById.get(item.video_id) : undefined
    const videoExercise = video?.plan_exercise_id ? exercises.get(video.plan_exercise_id) : undefined
    const source = item.video_id || item.plan_exercise_id ? 'set' : 'day'
    const row = exercise?.row ?? videoExercise?.row
    for (const day of targets) day.feedback.push({ feedback: item, source,
      exerciseName: source === 'set' ? row?.name ?? video?.exercise_name ?? null : null,
      exerciseNameEn: row?.nameEn ?? video?.name_en, setIndex: video?.set_index ?? null })
  }
  for (const day of days) day.feedback.sort((a, b) => a.feedback.posted_at.localeCompare(b.feedback.posted_at))
  return { days, byDay }
}
