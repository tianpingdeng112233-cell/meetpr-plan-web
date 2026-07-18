import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AuthUser } from './api/types'

const auth = vi.hoisted(() => ({ currentUser: vi.fn(), logout: vi.fn() }))

vi.mock('./api/auth', () => ({ currentUser: auth.currentUser, logout: auth.logout }))
vi.mock('./features/auth/LoginScreen', () => ({ LoginScreen: () => <div data-testid="login">login</div> }))
vi.mock('./features/workspace/PlanWorkspace', () => ({ PlanWorkspace: () => <div data-testid="coach">coach</div> }))
vi.mock('./features/admin/AdminWorkspace', () => ({ AdminWorkspace: () => <div data-testid="admin">admin</div> }))
vi.mock('./features/plan-editor/PlanEditor', () => ({ PlanEditor: () => <div>sample</div> }))

import App from './App'

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

function user(role: AuthUser['role']): AuthUser {
  return { id: role, phone: '+8613900000001', role, createdAt: '2026-07-18T00:00:00Z' }
}

describe('App role routing', () => {
  let host: HTMLDivElement
  let root: Root

  beforeEach(() => {
    host = document.createElement('div')
    document.body.appendChild(host)
    root = createRoot(host)
  })

  afterEach(() => {
    act(() => root.unmount())
    host.remove()
    vi.clearAllMocks()
  })

  it.each([['admin', 'admin'], ['coach', 'coach']] as const)('routes %s to its independent workspace', async (role, testId) => {
    auth.currentUser.mockReturnValue(user(role))
    await act(async () => { root.render(<App/>); await Promise.resolve() })
    expect(host.querySelector(`[data-testid="${testId}"]`)).not.toBeNull()
  })

  it.each(['coached_student', 'self_train_student'] as const)(
    'clears a stale %s session instead of opening either workspace',
    async (role) => {
      auth.currentUser.mockReturnValue(user(role))
      await act(async () => { root.render(<App/>); await Promise.resolve() })
      expect(auth.logout).toHaveBeenCalled()
      expect(host.querySelector('[data-testid="login"]')).not.toBeNull()
      expect(host.querySelector('[data-testid="coach"], [data-testid="admin"]')).toBeNull()
    },
  )
})
