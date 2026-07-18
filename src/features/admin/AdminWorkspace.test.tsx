import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AdminPlanWithChildren } from '../../api/admin'

const api = vi.hoisted(() => ({
  overview: vi.fn(), users: vi.fn(), user: vi.fn(), bindings: vi.fn(), plans: vi.fn(), plan: vi.fn(),
}))

vi.mock('../../api/admin', () => ({
  getAdminOverview: api.overview,
  getAdminUsers: api.users,
  getAdminUser: api.user,
  getAdminBindings: api.bindings,
  getAdminPlans: api.plans,
  getAdminPlan: api.plan,
}))

import { AdminWorkspace } from './AdminWorkspace'

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

// Exercise names ride along in the admin payload (exercise_name), so the page
// must never fall back to the coach-scoped /exercises catalog.
const fullPlan: AdminPlanWithChildren = {
  id: 'p1', coach_id: 'c1', trainee_id: 's1', name: '力量积累', start_date: '2026-07-01', end_date: '2026-07-28',
  plan_weeks: 1, source: 'coach', source_template_id: null, status: 'published', kind: 'regular',
  created_at: '2026-06-30T00:00:00Z', updated_at: '2026-07-01T00:00:00Z',
  days: [{ id: 'd1', plan_id: 'p1', day_of_week: 1, week_number: 1, sort_order: 0, exercises: [{
    id: 'pe1', plan_day_id: 'd1', exercise_id: 'e1', exercise_name: '竞技深蹲', is_main_lift: true, sort_order: 0, notes: null,
    sets: [{ id: 'set1', plan_exercise_id: 'pe1', set_number: 1, target_reps: 5, target_reps_max: null, intensity_mode: 'weight', target_value: '140.00', set_type: 'working', rest_seconds: null, coach_note: null, created_at: '2026-07-01T00:00:00Z' }],
  }] }],
}

async function settle() {
  for (let index = 0; index < 10; index++) await Promise.resolve()
}

function button(host: HTMLElement, label: string): HTMLButtonElement {
  const found = [...host.querySelectorAll('button')].find((item) => item.textContent?.trim() === label)
  if (!found) throw new Error(`button not found: ${label}`)
  return found
}

function buttonContaining(host: HTMLElement, label: string): HTMLButtonElement {
  const found = [...host.querySelectorAll('button')].find((item) => item.textContent?.includes(label))
  if (!found) throw new Error(`button not found containing: ${label}`)
  return found
}

function type(input: HTMLInputElement, value: string) {
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(input, value)
  input.dispatchEvent(new Event('input', { bubbles: true }))
}

describe('AdminWorkspace', () => {
  let host: HTMLDivElement
  let root: Root

  beforeEach(() => {
    host = document.createElement('div')
    document.body.appendChild(host)
    root = createRoot(host)
    api.overview.mockResolvedValue({ stats: { coaches: 1, coachedStudents: 1, selfTrainStudents: 0, activeBonds: 1, publishedPlans: 1 }, recentUsers: [], recentPlans: [] })
    api.users.mockResolvedValue({ users: [{ id: 'c1', displayName: '教练甲', role: 'coach', phone: '13800000000', createdAt: '2026-07-18T00:00:00Z', relation: { studentCount: 1 } }, { id: 's1', displayName: null, role: 'coached_student', phone: '13900000000', createdAt: '2026-07-17T00:00:00Z', relation: { coachId: 'c1', coachName: '教练甲' } }] })
    api.user.mockResolvedValue({ user: { id: 'c1', displayName: '教练甲', role: 'coach', phone: '13800000000', createdAt: '2026-07-18T00:00:00Z', relation: { studentCount: 1 } }, relations: [], plans: [] })
    api.bindings.mockResolvedValue({ bindings: [] })
    api.plans.mockResolvedValue({ plans: [{ id: 'p1', name: '力量积累', coachId: 'c1', coachName: '教练甲', traineeId: 's1', studentName: '学员乙', status: 'published', weeks: 1, startDate: '2026-07-01', endDate: '2026-07-28', createdAt: '2026-06-30' }] })
    api.plan.mockResolvedValue(fullPlan)
  })

  afterEach(() => {
    act(() => root.unmount())
    host.remove()
    vi.clearAllMocks()
  })

  it('filters locally, preserves list back-navigation, and renders a read-only plan matrix', async () => {
    await act(async () => { root.render(<AdminWorkspace onLogout={vi.fn()}/>); await settle() })
    expect(host.textContent).toContain('COACHES // 教练总数')

    await act(async () => { button(host, '用户管理').click(); await settle() })
    const search = host.querySelector<HTMLInputElement>('input[placeholder="搜索姓名或手机号"]')
    expect(search).not.toBeNull()
    await act(async () => { if (search) type(search, '139'); await settle() })
    expect(host.textContent).toContain('13900000000')
    expect(host.textContent).not.toContain('13800000000')

    await act(async () => { if (search) type(search, ''); await settle(); button(host, '教练甲教练138000000002026-07-18学员 1 人').click(); await settle() })
    expect(host.querySelector('[data-testid="admin-user-detail"]')).not.toBeNull()
    expect(host.textContent).not.toContain('DANGER // 管理操作')
    await act(async () => { const back = host.querySelector<HTMLButtonElement>('header button'); back?.click(); await settle() })
    expect(host.querySelector('[data-testid="admin-users"]')).not.toBeNull()

    await act(async () => { button(host, '计划总览').click() })
    await act(async () => { await settle() })
    await act(async () => { buttonContaining(host, '力量积累').click() })
    await act(async () => { await settle() })
    expect(host.textContent).toContain('READ-ONLY //')
    expect(host.textContent).toContain('竞技深蹲')
    expect(host.textContent).toContain('1×5 140kg')
    expect(host.querySelector('[data-testid="admin-plan-detail"] input')).toBeNull()
  })

  it('distinguishes an unnamed coach from a template and never shows raw UUIDs', async () => {
    api.plans.mockResolvedValue({ plans: [
      { id: 'p2', name: '无名教练计划', coachId: 'c2', coachName: null, traineeId: 's2', studentName: null, status: 'published', weeks: 1, startDate: null, endDate: null, createdAt: '2026-06-29' },
      { id: 'p3', name: '模板计划', coachId: null, coachName: null, traineeId: 's3', studentName: '学员丙', status: 'draft', weeks: 1, startDate: null, endDate: null, createdAt: '2026-06-28' },
    ] })
    api.plan.mockResolvedValue({ ...fullPlan, id: 'p2', coach_id: 'c2', trainee_id: 's2' })

    await act(async () => { root.render(<AdminWorkspace onLogout={vi.fn()}/>); await settle() })
    await act(async () => { button(host, '计划总览').click(); await settle() })
    const rowText = buttonContaining(host, '无名教练计划').textContent ?? ''
    expect(rowText).toContain('未设置姓名')
    expect(rowText).not.toContain('模板')
    expect(buttonContaining(host, '模板计划').textContent).toContain('—（模板）')

    await act(async () => { buttonContaining(host, '无名教练计划').click(); await settle() })
    const detailText = host.querySelector('[data-testid="admin-plan-detail"]')?.textContent ?? ''
    expect(detailText).toContain('未设置姓名 → 未设置姓名')
    expect(detailText).not.toContain('c2')
    expect(detailText).not.toContain('s2')
  })
})
