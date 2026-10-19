import { expect, it } from 'vitest'
import type { StudentSetLog, StudentVideo } from '../../api/types'
import type { Week } from './types'
import { deriveVideoFeedback } from './feedbackModel'

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
