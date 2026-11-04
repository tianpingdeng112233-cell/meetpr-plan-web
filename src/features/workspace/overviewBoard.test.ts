import { describe, expect, it } from 'vitest'
import { deriveOverviewBoard } from './overviewBoard'

describe('overview board', () => {
  it('counts attention students once, keeps behind-only students normal, and sorts latest first', () => {
    const board = deriveOverviewBoard({
      students: ['a', 'b', 'c'].map(id => ({ id, display_name: id, status: 'active' as const, evaluation: null })),
      dataByStudent: {}, plansByStudent: {}, conversations: [], requestCount: 2,
      alerts: { status: 'ready', data: { generated_at: '2026-10-22T09:00:00Z', plan_ending: [], training: [
        { student_id: 'a', latest_at: '2026-10-21T12:00:00Z', items: [{ type: 'behind', recommended_date: '2026-10-21', plan_day_id: 'day-a', week_number: 1 }] },
        { student_id: 'b', latest_at: '2026-10-20T12:00:00Z', items: [{ type: 'incomplete', date: '2026-10-20', plan_day_id: 'day-b', plan_exercise_id: 'ex-b', exercise_id: 'squat', set_index: 2, reason: 'missing' }] },
        { student_id: 'c', latest_at: '2026-10-21T12:00:00Z', items: [{ type: 'rpe_over', date: '2026-10-21', plan_day_id: 'day-c', plan_exercise_id: 'ex-c', exercise_id: 'squat', set_index: 1, target_rpe: '8', actual_rpe: '9' }] },
      ] } },
    })
    expect(board.attention.map(row => row.student.id)).toEqual(['c', 'b'])
    expect(board.normal.map(row => row.student.id)).toEqual(['a'])
    expect(board.redCount).toBe(4)
    expect(board.attention[0].tags[0]).toMatchObject({ kind: 'rpe_over', tone: 'red', count: 1 })
    expect(board.attention[1].tags[0]).toMatchObject({ kind: 'incomplete', tone: 'yellow' })
    expect(board.normal[0].tags[0]).toMatchObject({ kind: 'behind', tone: 'gray' })
  })
})

it('uses shared completion thresholds and counts chat/video students once; near competition alone is normal', () => {
  const board = deriveOverviewBoard({
    students: ['a', 'b'].map(id => ({ id, display_name: id, status: 'active', evaluation: null })),
    dataByStudent: { a: { overview: { one_rm: {}, recent_4w: { completion_rate: .64 }, last_trained_at: '2026-10-20' } as never }, b: { profile: { is_competing: true, competition_date: '2026-10-23' } as never } },
    plansByStudent: {}, conversations: [{ other_party: { id: 'a' }, unread_count: 3, last_message_at: '2026-10-22T08:00:00Z' } as never],
    videosByStudent: { a: [{ viewed_at: null, created_at: '2026-10-21T08:00:00Z' }, { viewed_at: 'seen' }] as never },
    reference: new Date('2026-10-22T12:00:00Z'),
    alerts: { status: 'ready', data: { generated_at: '', plan_ending: [{ student_id: 'a', plan_id: 'p', plan_name: 'P', end_date: '2026-10-24', days_left: 2 }], training: [] } },
  })
  expect(board.redCount).toBe(1)
  expect(board.attention[0].tags.map(({ kind, tone, count }) => ({ kind, tone, count }))).toEqual([
    { kind: 'plan_ending', tone: 'yellow', count: 1 }, { kind: 'completion', tone: 'red', count: 1 },
    { kind: 'chat', tone: 'white', count: 3 }, { kind: 'videos', tone: 'white', count: 1 },
  ])
  expect(board.normal.map(row => row.student.id)).toEqual(['b'])
})

it('only falls back to next-week planning for a 404, never for errors or loading', () => {
  const input = {
    students: ['empty', 'planned', 'draft'].map(id => ({ id, display_name: id, status: 'active' as const, evaluation: null })),
    dataByStudent: {}, conversations: [], reference: new Date('2026-10-22T12:00:00Z'),
    plansByStudent: { empty: [], planned: [{ status: 'published', start_date: '2026-10-26', end_date: '2026-11-01' }] as never,
      draft: [{ status: 'draft', start_date: '2026-10-26', end_date: '2026-11-01' }] as never },
  }
  const fallback = deriveOverviewBoard({ ...input, alerts: { status: 'unavailable' } })
  expect(fallback.attention.map(row => row.student.id)).toEqual(['empty', 'draft'])
  expect(fallback.attention[0].tags.map(tag => tag.kind)).toEqual(['plan_ending'])
  expect(deriveOverviewBoard({ ...input, alerts: { status: 'failed' } }).redCount).toBe(0)
  expect(deriveOverviewBoard({ ...input, alerts: { status: 'loading' } }).redCount).toBe(0)
})

it('splits overflow without losing reminders and fits exact widths', async () => {
  const { splitOverviewTags } = await import('./overviewBoard')
  const tags = ['rpe_over', 'incomplete', 'chat'].map(kind => ({ kind, tone: 'white', count: 1, at: null })) as import('./overviewBoard').OverviewTag[]
  expect(splitOverviewTags(tags, [80, 60, 50], 202).hidden).toHaveLength(0)
  expect(splitOverviewTags(tags, [80, 60, 50], 150).visible.map(tag => tag.kind)).toEqual(['rpe_over'])
  expect(splitOverviewTags(tags, [80, 60, 50], 150).hidden).toHaveLength(2)
  expect(splitOverviewTags(tags, [80, 60, 50], 40).hidden).toHaveLength(3)
})

it('orders plan-ending reminders by when the three-day window began, not the future deadline', () => {
  const board = deriveOverviewBoard({
    students: ['ending', 'message'].map(id => ({ id, display_name: id, status: 'active', evaluation: null })),
    dataByStudent: {}, plansByStudent: {},
    conversations: [{ other_party: { id: 'message' }, unread_count: 1, last_message_at: '2026-10-22T08:00:00Z' } as never],
    alerts: { status: 'ready', data: { generated_at: '2026-10-22T09:00:00Z', training: [], plan_ending: [{ student_id: 'ending', plan_id: 'p', plan_name: 'P', days_left: 2, end_date: '2026-10-24' }] } },
  })
  expect(board.attention.map(row => row.student.id)).toEqual(['message', 'ending'])
})

it.each([
  ['2026-11-12', 'gray', false], ['2026-11-11', 'yellow', false], ['2026-11-08', 'yellow', false],
  ['2026-11-07', 'red', true], ['2026-11-05', 'red', true], ['2026-11-04', 'red', true], ['2026-11-03', 'red', true],
] as const)('024 only red service terms affect attention (%s)', (service_until, tone, attention) => {
  const input = { students: [{ id: 'a', display_name: 'A', status: 'active' as const, evaluation: null, service_until }],
    dataByStudent: {}, plansByStudent: {}, conversations: [], reference: new Date(2026, 10, 4) }
  const board = deriveOverviewBoard(input)
  const row = [...board.attention, ...board.normal][0]
  expect(row.tags[0]).toMatchObject({ kind: 'service_term', tone })
  expect(board.attention).toHaveLength(attention ? 1 : 0)
  expect(board.redCount).toBe(attention ? 1 : 0)
  const mixed = deriveOverviewBoard({ ...input, alerts: { status: 'ready', data: { generated_at: '', plan_ending: [], training: [
    { student_id: 'a', latest_at: '2026-11-04T08:00:00Z', items: [{ type: 'incomplete', date: '2026-11-04', plan_day_id: 'd', plan_exercise_id: 'e', exercise_id: 'squat', set_index: 1, reason: 'missing' }] },
  ] } } })
  expect(mixed.attention[0].tags.map(tag => tag.kind)).toEqual(['service_term', 'incomplete'])
  expect(mixed.redCount).toBe(1)
})
it('024 leaves unset terms and ended bindings without tags', () => {
  const board = deriveOverviewBoard({ students: [
    { id: 'old', display_name: 'Old', status: 'active', evaluation: null, service_until: null },
    { id: 'ended', display_name: 'Ended', status: 'active', evaluation: null, bond_status: 'ended', service_until: '2026-11-03' },
  ], dataByStudent: {}, plansByStudent: {}, conversations: [], reference: new Date(2026, 10, 4) })
  expect([...board.normal, ...board.attention].flatMap(row => row.tags)).toEqual([])
  expect(board.redCount).toBe(0)
})
