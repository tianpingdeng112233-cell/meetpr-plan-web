import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  getAdminBindings,
  getAdminExerciseUsage,
  getAdminOverview,
  getAdminPlan,
  getAdminPlans,
  getAdminUser,
  getAdminUsers,
} from './admin'

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
    await getAdminPlans()
    await getAdminExerciseUsage()
    await getAdminPlan('plan/one')

    const calls = vi.mocked(fetch).mock.calls
    expect(calls.map(([url]) => url)).toEqual([
      '/api/admin/overview',
      '/api/admin/users',
      '/api/admin/users/user%2Fone',
      '/api/admin/bindings',
      '/api/admin/plans',
      '/api/admin/exercise-usage',
      '/api/admin/plans/plan%2Fone',
    ])
    calls.forEach(([, init]) => expect(new Headers(init?.headers).get('Authorization')).toBe('Bearer admin-token'))
  })
})
