import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AuthRoleError, login } from './auth'
import type { UserRole } from './types'

function response(role: UserRole) {
  return new Response(JSON.stringify({
    user: { id: role, phone: '+8613900000001', role, createdAt: '2026-07-18T00:00:00Z' },
    accessToken: `${role}-access`, refreshToken: `${role}-refresh`,
  }), { status: 200, headers: { 'Content-Type': 'application/json' } })
}

describe('web login role gate', () => {
  beforeEach(() => {
    const store = new Map<string, string>()
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => void store.set(key, value),
      removeItem: (key: string) => void store.delete(key),
      clear: () => store.clear(),
    })
  })
  afterEach(() => vi.restoreAllMocks())

  it('admits an admin through the shared coach login gate', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response('admin')))
    await expect(login('+8613900000001', 'secret', 'coach')).resolves.toMatchObject({ role: 'admin' })
    expect(localStorage.getItem('mpw.accessToken')).toBe('admin-access')
  })

  it.each(['coached_student', 'self_train_student'] as const)(
    'still rejects a %s before persisting any session',
    async (role) => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response(role)))
      await expect(login('+8613900000001', 'secret', 'coach')).rejects.toBeInstanceOf(AuthRoleError)
      expect(localStorage.getItem('mpw.accessToken')).toBeNull()
      expect(localStorage.getItem('mpw.user')).toBeNull()
    },
  )
})
