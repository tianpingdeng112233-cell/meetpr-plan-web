import * as reviews from './admin'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  getAdminBindings,
  getAdminExerciseUsage,
  getAdminOverview,
  getAdminUser,
  getAdminUsers,
} from './admin'

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals() })

describe('admin API contract', () => {
  beforeEach(() => {
    const store = new Map<string, string>()
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => void store.set(key, value),
      removeItem: (key: string) => void store.delete(key),
      clear: () => store.clear(),
    })
    localStorage.setItem('mpw.accessToken', 'admin-token')
    vi.stubGlobal('fetch', vi.fn().mockImplementation(() => Promise.resolve(new Response('{}', {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }))))
  })
  afterEach(() => vi.restoreAllMocks())

  it('uses the approved read-only endpoint paths and bearer auth', async () => {
    await getAdminOverview()
    await getAdminUsers()
    await getAdminUser('user/one')
    await getAdminBindings()
    await getAdminExerciseUsage()

    const calls = vi.mocked(fetch).mock.calls
    expect(calls.map(([url]) => url)).toEqual([
      '/api/admin/overview',
      '/api/admin/users',
      '/api/admin/users/user%2Fone',
      '/api/admin/bindings',
      '/api/admin/exercise-usage',
    ])
    calls.forEach(([, init]) => expect(new Headers(init?.headers).get('Authorization')).toBe('Bearer admin-token'))
  })
})

const listedCoachInput = {
  name: '林教练', nickname: '阿林', gender: '男', douyin_handle: 'lin', douyin_url: 'https://www.douyin.com/user/lin',
  province: '浙江', city: '杭州', gyms: ['无'], teaching_mode: '线上' as const,
  best_total_kg: 600, competition_class: null, equipment: null, certifications: null, coaching_years: 5,
}
const listedCoach = { ...listedCoachInput, id: 'coach/one', status: 'published', best_total_kg: '600.00', coaching_years: '5.0', submitted_by: null, reviewed_by: null, reviewed_at: null, rejection_reason: null, created_at: '2026-11-09', updated_at: '2026-11-09' }

async function reviewRequest(call: () => Promise<unknown>, method: string, path: string, body: unknown, response: unknown) {
  const store = new Map([['mpw.accessToken', 'admin-token']])
  vi.stubGlobal('localStorage', { getItem: (key: string) => store.get(key) ?? null })
  vi.stubGlobal('fetch', vi.fn(async () => response === undefined
    ? new Response(null, { status: 204 })
    : new Response(JSON.stringify(response), { status: method === 'POST' && path === '/words' ? 201 : 200 })))
  expect(await call()).toEqual(response)
  expect(fetch).toHaveBeenCalledTimes(1)
  const [url, init] = vi.mocked(fetch).mock.calls[0]
  expect(url).toBe(`/api/admin/coach-reviews${path}`)
  expect(init?.method ?? 'GET').toBe(method)
  expect(init?.body === undefined ? undefined : JSON.parse(String(init.body))).toEqual(body)
  expect(new Headers(init?.headers).get('Authorization')).toBe('Bearer admin-token')
}

it('imports CSV and parses counts and skip reasons', async () => {
  await reviewRequest(() => reviews.importCoachRoster('a,b\n1,2'), 'POST', '/import', { csv: 'a,b\n1,2' }, { created: 3, updated: 1, skipped: 2, skips: [{ row: 5, reason: 'example' }, { row: 6, reason: 'invalid_fields' }] })
})

it('lists roster with encoded status and search', async () => {
  await reviewRequest(() => reviews.getAdminListedCoaches({ status: 'hidden', q: '林 & lin' }), 'GET', '/coaches?status=hidden&q=%E6%9E%97+%26+lin', undefined, { coaches: [listedCoach] })
})

it('patches every roster field and preserves numeric strings in response', async () => {
  await reviewRequest(() => reviews.updateAdminListedCoach('coach/one', listedCoachInput), 'PATCH', '/coaches/coach%2Fone', listedCoachInput, listedCoach)
})

it('changes roster publication status', async () => {
  await reviewRequest(() => reviews.setAdminListedCoachStatus('coach/one', 'hidden'), 'POST', '/coaches/coach%2Fone/status', { status: 'hidden' }, { ...listedCoach, status: 'hidden' })
})

it('lists pending coach submissions', async () => {
  await reviewRequest(() => reviews.getAdminCoachSubmissions(), 'GET', '/submissions', undefined, { coaches: [{ ...listedCoach, status: 'pending' }] })
})

it('decides a coach submission with reason', async () => {
  await reviewRequest(() => reviews.decideAdminCoachSubmission('coach/one', 'reject', '资料不全'), 'POST', '/submissions/coach%2Fone/decision', { action: 'reject', reason: '资料不全' }, { ...listedCoach, status: 'rejected' })
})

it('lists grouped overdue reports with original text', async () => {
  await reviewRequest(() => reviews.getAdminCoachReviewReports(), 'GET', '/reports', undefined, { reports: [{ review_id: 'review/one', listed_coach_id: 'coach/one', body: '点评原文', deleted_at: null, report_count: 1, first_reported_at: '2026-11-01', age_seconds: 300000, overdue: true, reasons: [{ id: 'report-1', reason: 'privacy', explanation: '泄露隐私' }] }] })
})

it('decides reports using the review ID', async () => {
  await reviewRequest(() => reviews.decideAdminCoachReviewReport('review/one', 'delete'), 'POST', '/reports/review%2Fone/decision', { action: 'delete' }, { action: 'delete' })
})

it('lists blocked words', async () => {
  await reviewRequest(() => reviews.getAdminCoachReviewWords(), 'GET', '/words', undefined, { words: [{ id: 'word/one', word: '拦截词' }] })
})

it('adds a blocked word', async () => {
  await reviewRequest(() => reviews.addAdminCoachReviewWord('拦截词'), 'POST', '/words', { word: '拦截词' }, { id: 'word/one', word: '拦截词' })
})

it('deletes a blocked word and accepts 204', async () => {
  await reviewRequest(() => reviews.deleteAdminCoachReviewWord('word/one'), 'DELETE', '/words/word%2Fone', undefined, undefined)
})

it('lists the roster without optional filters', async () => {
  await reviewRequest(() => reviews.getAdminListedCoaches(), 'GET', '/coaches', undefined, { coaches: [] })
})
it('approves without a reason, restores a coach and keeps a reported review', async () => {
  await reviewRequest(() => reviews.decideAdminCoachSubmission('c1', 'approve'), 'POST', '/submissions/c1/decision', { action: 'approve' }, listedCoach)
  await reviewRequest(() => reviews.setAdminListedCoachStatus('c1', 'published'), 'POST', '/coaches/c1/status', { status: 'published' }, listedCoach)
  await reviewRequest(() => reviews.decideAdminCoachReviewReport('r1', 'keep'), 'POST', '/reports/r1/decision', { action: 'keep' }, { action: 'keep' })
})
it('preserves the existing API error contract for review writes', async () => {
  vi.stubGlobal('localStorage', { getItem: () => 'admin-token' })
  vi.stubGlobal('fetch', vi.fn(async () => new Response('{"error":"LISTED_COACH_EXISTS"}', { status: 409 })))
  await expect(reviews.updateAdminListedCoach('c1', listedCoachInput)).rejects.toMatchObject({ status: 409, code: 'LISTED_COACH_EXISTS' })
})
