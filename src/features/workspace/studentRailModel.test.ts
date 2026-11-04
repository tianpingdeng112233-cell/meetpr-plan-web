import { afterEach, expect, it } from 'vitest'
import type { CoachBindRequest, CoachStudent } from '../../api/types'
import { buildStudentRail, previouslyEnded } from './studentRailModel'
import { S, setLocale } from '../../i18n/strings'

afterEach(() => setLocale('zh'))

it('marks returning students with the previous unbind date and leaves legacy/new requests unmarked', () => {
  const request: CoachBindRequest = {
    id: 'request', student_id: 'student', display_name: '王明',
    submitted_at: '2026-11-02T12:00:00Z', expired_at: '2026-11-09T12:00:00Z',
    onboarding: { completed: true, upload_count: 0, deadlift_style: null },
  }
  expect(previouslyEnded({ ...request, previously_ended_at: new Date(2026, 0, 5, 23, 30).toISOString() })).toBe('01/05')
  expect(previouslyEnded(request)).toBeNull()
  expect(previouslyEnded({ ...request, previously_ended_at: null })).toBeNull()
})

function student(id: string, fields: Partial<CoachStudent> = {}): CoachStudent {
  return { id, display_name: id, status: 'active', evaluation: null, ...fields }
}

it.each([
  ['zh', ['09:05 完成', '今日未练', '休息日', '休息日']],
  ['zh-Hant', ['09:05 完成', '今日未練', '休息日', '休息日']],
  ['en', ['Completed at 09:05', 'Not trained today', 'Rest day', 'Rest day']],
] as const)('exposes status keys and browser-local HH:MM for the existing %s dictionary', (locale, labels) => {
  setLocale(locale)
  const { active, ended } = buildStudentRail([
    student('done', { today: { state: 'completed', completed_at: new Date(2026, 10, 2, 9, 5).toISOString() }, pending_video_count: 3 }),
    student('scheduled', { today: { state: 'scheduled', completed_at: null } }),
    student('rest', { alias: null, today: { state: 'rest', completed_at: null } }),
    student('z-legacy'),
    student('ended', { bond_status: 'ended', today: null }),
  ], '')
  expect(active.map(row => row.status)).toEqual([
    { key: 'completed', time: '09:05' }, { key: 'scheduled' }, { key: 'rest' }, { key: 'rest' },
  ])
  expect(active.map(({ status }) => status?.key === 'completed'
    ? S.workspace.studentRail.completed(status.time)
    : status ? S.workspace.studentRail[status.key] : null)).toEqual(labels)
  expect(active.map(row => row.pendingVideoCount)).toEqual([3, 0, 0, 0])
  expect(ended[0].status).toBeNull()
})

it('orders completed students by the server-provided earliest completion, then scheduled, then rest', () => {
  const roster = Object.freeze([
    student('rest', { today: { state: 'rest', completed_at: null } }),
    student('late', { today: { state: 'completed', completed_at: '2026-11-02T07:30:00Z' } }),
    student('scheduled', { today: { state: 'scheduled', completed_at: null } }),
    // The backend already chose the earliest completion of multiple training days.
    student('early', { today: { state: 'completed', completed_at: '2026-11-02T14:00:00+08:00' } }),
  ])
  expect(buildStudentRail(roster, '').active.map(row => row.student.id)).toEqual(['early', 'late', 'scheduled', 'rest'])
  expect(roster.map(row => row.id)).toEqual(['rest', 'late', 'scheduled', 'early'])
})

it.each(['小陈', '王强', 'xiaochen', 'xc', 'wangqiang', 'wq', '  XIAOCHEN  '])('searches alias and real name literally or by pinyin (%s)', query => {
  const roster = [student('other', { display_name: '李明' }), student('match', { display_name: '王强', alias: '小陈' })]
  expect(buildStudentRail(roster, query).active.map(row => row.student.id)).toEqual(['match'])
})

it('returns empty groups when no name matches', () => {
  expect(buildStudentRail([student('王强')], 'not-a-student')).toEqual({ active: [], ended: [] })
})

it('keeps ended students in a separate group and returns search hits regardless of UI collapse state', () => {
  const endedAt = '2026-10-31T12:00:00Z'
  const roster = [
    student('ended', { display_name: '李明', alias: '小李', bond_status: 'ended', ended_at: endedAt, today: null }),
    student('active', { display_name: '李强', bond_status: 'active' }),
    student('legacy', { display_name: '张明' }),
  ]
  const all = buildStudentRail(roster, '')
  expect(all.active.map(row => row.student.id)).toEqual(['active', 'legacy'])
  expect(all.ended.map(row => [row.student.id, row.endedAt])).toEqual([['ended', endedAt]])
  // Collapse belongs to the UI; the model always returns matching ended rows.
  const searched = buildStudentRail(roster, 'xl')
  expect(searched.active).toEqual([])
  expect(searched.ended.map(row => row.student.id)).toEqual(['ended'])
  expect(buildStudentRail(roster, 'not-a-student')).toEqual({ active: [], ended: [] })
})

it('sorts scheduled and rest groups by display-name pinyin, including legacy students without today', () => {
  const roster = [
    student('scheduled-zhou', { display_name: '周明', today: { state: 'scheduled', completed_at: null } }),
    student('rest-wang', { display_name: '王明', today: { state: 'rest', completed_at: null } }),
    student('legacy-zhang', { display_name: '张明' }),
    student('scheduled-chen', { display_name: '王强', alias: '陈强', today: { state: 'scheduled', completed_at: null } }),
    student('null-li', { display_name: '李明', today: null }),
  ]
  const { active } = buildStudentRail(roster, '')
  expect(active.map(row => row.student.id)).toEqual(['scheduled-chen', 'scheduled-zhou', 'null-li', 'rest-wang', 'legacy-zhang'])
  expect(active.map(row => [row.displayName, row.subtitle])).toEqual([
    ['陈强', '王强'], ['周明', null], ['李明', null], ['王明', null], ['张明', null],
  ])
})

it('024 exposes a service capsule only on an active binding, including the gray tier', () => {
  const roster = [student('active', { service_until: '2026-11-12' }), student('unset'),
    student('ended', { bond_status: 'ended', service_until: '2026-11-07' })]
  const rows = buildStudentRail(roster, '', new Date(2026, 10, 4))
  expect(rows.active.find(row => row.student.id === 'active')?.serviceTerm).toMatchObject({ daysLeft: 8, tone: 'gray', shortLabel: '剩 8 天' })
  expect(rows.active.find(row => row.student.id === 'unset')?.serviceTerm).toBeNull()
  expect(rows.ended[0].serviceTerm).toBeNull()
  expect(buildStudentRail([student('ended', { bond_status: 'active', service_until: null })], '').active[0].serviceTerm).toBeNull()
})
