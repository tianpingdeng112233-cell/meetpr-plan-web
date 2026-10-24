import { expect, it } from 'vitest'
import type { CoachFeedbackResponse, StudentSetLog, StudentVideo } from '../../api/types'
import type { Week } from './types'
import { deriveDayFeedback, deriveVideoFeedback } from './feedbackModel'

const video = (id: string, exercise: string | null, set: number, viewed = false): StudentVideo => ({
  id, plan_exercise_id: exercise, set_index: set, set_log_id: null, content_type: 'video/mp4',
  size_bytes: 1, filename: id, created_at: '2026-10-12T00:00:00Z', logged_at: null, viewed_at: viewed ? '2026-10-13' : null,
})
const weeks = [{ num: 2, days: [{ dow: 2, serverDayId: 'd2', rows: [{ id: 'r2', serverRowId: 'e2' }] }] },
  { num: 1, days: [{ dow: 0, serverDayId: 'd1', rows: [{ id: 'r1', serverRowId: 'e1' }] }] }] as Week[]
it('groups mixed views and repeated uploads by action, orders the plan, and joins student-added videos only through their log', () => {
  const videos = [video('later', 'e2', 0), video('set2', 'e1', 1), video('set1-seen', 'e1', 0, true),
    video('set1-new', 'e1', 0), video('old', 'old-block', 0), video('unlinked', null, 0),
    { ...video('added', null, 1), set_log_id: 'adhoc-log' }]
  const logs = [{ id: 'adhoc-log', adhoc: true, plan_day_id: 'd1', exercise_id: 'curl' }] as StudentSetLog[]
  const result = deriveVideoFeedback(weeks, videos, logs)
  expect(result.rows.get('r1')).toMatchObject({ total: 3, pending: 2 })
  expect(result.rows.get('r1')?.videos.map(v => v.id)).toEqual(['set1-seen', 'set1-new', 'set2'])
  expect(result.studentAdded.get('d1')?.get('curl')).toMatchObject({ total: 1, pending: 1 })
  expect(result.entries.filter(e => e.inPlan).map(e => [e.video.id, e.week, e.day])).toEqual([
    ['set1-seen', 1, 1], ['set1-new', 1, 1], ['set2', 1, 1], ['added', 1, 1], ['later', 2, 1],
  ])
  expect(result.entries.filter(e => !e.inPlan).map(e => e.video.id)).toEqual(['old', 'unlinked'])
  expect(videos[1].id).toBe('set2')
})
it('counts unsaved empty training days and uses shifted recommended-date order for Dx', () => {
  const plan = [{ num: 1, days: [
    { dow: 0, rest: false, rows: [] },
    { dow: 1, rest: false, serverDayId: 'd1', shiftedToDate: '2026-10-23', rows: [{ id: 'r1', serverRowId: 'e1' }] },
    { dow: 2, rest: false, serverDayId: 'd2', rows: [{ id: 'r2', serverRowId: 'e2' }] },
  ] }] as Week[]
  const result = deriveVideoFeedback(plan, [video('v1', 'e1', 0), video('v2', 'e2', 0)], [], '2026-10-19')
  expect(result.entries.map(entry => [entry.video.id, entry.day])).toEqual([['v2', 2], ['v1', 3]])
})


it('020 lists only completed training days in actual-date order with weekdays, independently of the recommendation', () => {
  const plan = [{ num: 1, days: [
    { dow: 0, serverDayId: 'later', completedAt: '2026-10-22T20:00:00Z', rows: [{ id: 'r1', serverRowId: 'e1' }] },
    { dow: 2, serverDayId: 'earlier', completedAt: '2026-10-20T20:00:00Z', rows: [{ id: 'r2', serverRowId: 'e2' }] },
    { dow: 4, serverDayId: 'unfinished', completedAt: null, rows: [{ id: 'r3', serverRowId: 'e3' }] },
    { dow: 5, serverDayId: 'future', completedAt: '2026-11-01T20:00:00Z', rows: [{ id: 'r4', serverRowId: 'e4' }] },
  ] }] as Week[]
  const logs = [
    { plan_exercise_id: 'e1', logged_date: '2026-10-22' },
    { plan_exercise_id: 'e2', logged_date: '2026-10-20' },
    { plan_exercise_id: 'e3', logged_date: '2026-10-21' },
  ] as StudentSetLog[]
  const result = deriveDayFeedback(plan, logs, [], [], '2026-10-19', '2026-10-24')
  expect(result.days.map(day => [day.dayId, day.week, day.day, day.date, day.weekday, day.feedback.length])).toEqual([
    ['earlier', 1, 2, '2026-10-20', 1, 0], ['later', 1, 1, '2026-10-22', 3, 0],
  ])
})


it('020 joins mixed feedback chronologically, prefers day_date, falls back to this plan’s exercise, and drops unrelated feedback', () => {
  const plan = [{ num: 1, days: [
    { dow: 0, serverDayId: 'd1', completedAt: '2026-10-20T20:00:00Z', rows: [{ id: 'r1', serverRowId: 'e1', name: '竞技卧推' }] },
    { dow: 2, serverDayId: 'd2', completedAt: '2026-10-22T20:00:00Z', rows: [{ id: 'r2', serverRowId: 'e2', name: '相扑硬拉' }] },
  ] }] as Week[]
  const feedback = [
    { id: 'day', day_date: '2026-10-20', plan_exercise_id: null, video_id: null, posted_at: '2026-10-21T10:00:00Z' },
    { id: 'legacy', day_date: null, plan_exercise_id: 'e1', video_id: 'v1', posted_at: '2026-10-20T21:00:00Z' },
    { id: 'date-first', day_date: '2026-10-22', plan_exercise_id: 'e1', video_id: null, posted_at: '2026-10-22T21:00:00Z' },
    { id: 'old-block', day_date: null, plan_exercise_id: 'old', video_id: null },
    { id: 'other-date', day_date: '2026-09-01', plan_exercise_id: 'e1', video_id: null },
    { id: 'unlinked', day_date: null, plan_exercise_id: null, video_id: null },
  ] as CoachFeedbackResponse[]
  const result = deriveDayFeedback(plan, [{ plan_exercise_id: 'e1', logged_date: '2026-10-20' }, { plan_exercise_id: 'e2', logged_date: '2026-10-22' }] as StudentSetLog[], feedback, [video('v1', 'e1', 2)], '2026-10-19', '2026-10-24')
  expect(result.days.map(day => day.feedback.length)).toEqual([2, 1])
  expect(result.byDay.get('d1')?.feedback.map(item => [item.feedback.id, item.source, item.exerciseName, item.setIndex])).toEqual([
    ['legacy', 'set', '竞技卧推', 2], ['day', 'day', null, null],
  ])
  expect(result.byDay.get('d2')?.feedback[0]).toMatchObject({ source: 'set', exerciseName: '竞技卧推', setIndex: null })
})


it('020 never substitutes completion time for a missing actual training date', () => {
  const plan = [{ num: 1, days: [{ dow: 0, serverDayId: 'd1', completedAt: '2026-10-24T01:00:00Z', rows: [{ id: 'r1', serverRowId: 'e1' }] }] }] as Week[]
  const waiting = deriveDayFeedback(plan, [], [], [], '2026-10-19', '2026-10-24')
  expect(waiting.days).toHaveLength(1)
  expect(waiting.days[0].date).toBeNull()
  expect(waiting.days[0].weekday).toBeNull()
  const loaded = deriveDayFeedback(plan, [{ plan_exercise_id: 'e1', logged_date: '2026-10-23' }] as StudentSetLog[], [], [], '2026-10-19', '2026-10-24')
  expect(loaded.days[0].date).toBe('2026-10-23')
})
