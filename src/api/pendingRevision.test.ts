import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { deletePendingRevision, getPendingRevision, putPendingRevision } from './pendingRevision'
import { createDraftMirror } from '../features/plan-editor/draftMirror'

describe('pending revision api', () => {
  beforeEach(() => {
    const values = new Map<string, string>()
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      value: {
        getItem: (key: string) => values.get(key) ?? null,
        setItem: (key: string, value: string) => { values.set(key, value) },
        removeItem: (key: string) => { values.delete(key) },
        clear: () => values.clear(),
        key: (index: number) => [...values.keys()][index] ?? null,
        get length() { return values.size },
      } satisfies Storage,
    })
  })
  afterEach(() => vi.restoreAllMocks())

  it('calls GET/PUT/DELETE with the backend 044 wire shape and keepalive', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        plan_id: 'p/1', version: 3, content_hash: 'fnv1a32:00000000', content: {}, saved_at: '2026-08-22T10:00:00Z',
      }), { status: 200, headers: { 'Content-Type': 'application/json' } }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        plan_id: 'p/1', version: 3, content_hash: 'hash', saved_at: '2026-08-22T10:01:00Z',
      }), { status: 200, headers: { 'Content-Type': 'application/json' } }))
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
    vi.stubGlobal('fetch', fetchMock)
    const mirror = createDraftMirror('p/1', { weeks: [], planStartDate: null, weeksCount: 0 })

    await expect(getPendingRevision('p/1')).resolves.toMatchObject({ plan_id: 'p/1' })
    await putPendingRevision('p/1', mirror, { keepalive: true })
    await deletePendingRevision('p/1')

    expect(fetchMock.mock.calls.map(([url, init]) => [url, init.method, init.keepalive])).toEqual([
      ['/api/plans/p%2F1/pending-revision', 'GET', undefined],
      ['/api/plans/p%2F1/pending-revision', 'PUT', true],
      ['/api/plans/p%2F1/pending-revision', 'DELETE', undefined],
    ])
    expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toEqual({
      version: mirror.version, content_hash: mirror.contentHash, content: mirror.content,
    })
  })

  it.each([404, 405])('silently treats GET %s as no remote mirror', async (status) => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: 'NOT_FOUND' }), {
      status, headers: { 'Content-Type': 'application/json' },
    })))
    await expect(getPendingRevision('plan')).resolves.toBeNull()
  })
})
