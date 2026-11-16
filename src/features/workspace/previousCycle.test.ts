import { expect, it } from 'vitest'
import type { PlanResponse } from '../../api/types'
import { selectPreviousCycle } from './previousCycle'

const current = { id: 'current', trainee_id: 'student', start_date: '2026-11-23', status: 'draft' } as PlanResponse
const candidate = (id: string, start_date = '2026-10-19', patch: Partial<PlanResponse> = {}): PlanResponse => ({ ...current, id, start_date, status: 'published', ...patch })
it.each([
  ['无上一份', [], null],
  ['只有草稿', [candidate('draft', undefined, { status: 'draft' })], null],
  ['日期空档', [candidate('gap', '2026-08-03')], 'gap'],
  ['开始日相同取发布更晚', [candidate('early', undefined, { published_at: '2026-10-01T00:00:00Z' }), candidate('late', undefined, { published_at: '2026-10-02T00:00:00Z' })], 'late'],
  ['多份取最近', [candidate('old', '2026-08-03'), candidate('recent', undefined, { status: 'completed' }), candidate('paused', '2026-09-01', { status: 'paused' })], 'recent'],
  ['当前是最早一份', [current, candidate('same', current.start_date), candidate('future', '2026-12-01')], null],
  ['不跨学员', [candidate('other', undefined, { trainee_id: 'other' })], null],
] as const)('selectPreviousCycle：%s', (_name, list, expected) => {
  expect(selectPreviousCycle(list, current)?.id ?? null).toBe(expected)
})
