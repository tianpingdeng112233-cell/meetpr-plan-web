import { isBlockTrainingDay } from './blockGridModel'
import { recommendedDateForDay } from './mapping'
import type { StudentSetLog, StudentVideo } from '../../api/types'
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
