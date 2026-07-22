import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const api = vi.hoisted(() => ({
  getExerciseStatsOverview: vi.fn(),
  getExerciseStats: vi.fn(),
  getStudentOnboarding: vi.fn(),
  getStudentPlans: vi.fn(),
  getPlan: vi.fn(),
}))

vi.mock('../../api/coach', () => ({
  getExerciseStatsOverview: api.getExerciseStatsOverview,
  getExerciseStats: api.getExerciseStats,
}))
vi.mock('../../api/plans', () => ({
  getStudentOnboarding: api.getStudentOnboarding,
  getStudentPlans: api.getStudentPlans,
  getPlan: api.getPlan,
}))

import { e1rmTrendArrow, StudentBoard } from './StatsViews'

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

async function settle(): Promise<void> {
  for (let index = 0; index < 8; index++) await Promise.resolve()
}

describe('coach roster e1RM', () => {
  let host: HTMLDivElement
  let root: Root

  beforeEach(() => {
    host = document.createElement('div')
    document.body.appendChild(host)
    root = createRoot(host)
    api.getStudentOnboarding.mockResolvedValue(null)
  })

  afterEach(() => {
    act(() => root.unmount())
    host.remove()
    vi.clearAllMocks()
  })

  async function renderBoard(): Promise<void> {
    await act(async () => {
      root.render(<StudentBoard students={[{ id: 'student', display_name: '学员', status: 'active', evaluation: null }]} />)
      await settle()
    })
  }

  it('uses the backend trend mapping without recalculating it', () => {
    expect(e1rmTrendArrow('up')).toBe('↑')
    expect(e1rmTrendArrow('down')).toBe('↓')
    expect(e1rmTrendArrow('flat')).toBe('→')
    expect(e1rmTrendArrow('new')).toBe('')
  })

  it('falls back to a visually distinct registered 1RM when the new field is absent', async () => {
    api.getExerciseStatsOverview.mockResolvedValue({
      exercises: [],
      one_rm: { squat: '160.00', bench: '100.00', deadlift: null },
      last_trained_at: null,
      recent_4w: { trained_days: 0, total_planned_days: 0, completion_rate: 0 },
    })
    await renderBoard()

    const squat = host.querySelector<HTMLElement>('[data-testid="roster-e1rm-squat"]')!
    expect(squat.textContent).toBe('160')
    expect(squat.classList.contains('registered')).toBe(true)
    expect(squat.title).toBe('登记值,尚无实测')
    expect(host.querySelector('[data-testid="roster-e1rm-deadlift"]')?.textContent).toBe('—')
  })

  it('shows the latest e1RM point and the trend supplied by the backend', async () => {
    api.getExerciseStatsOverview.mockResolvedValue({
      exercises: [],
      one_rm: { squat: '160.00', bench: '100.00', deadlift: '190.00' },
      last_trained_at: '2026-07-20',
      recent_4w: { trained_days: 3, total_planned_days: 4, completion_rate: .75 },
      e1rm_series: {
        squat: { points: [{ date: '2026-07-01', value: '165.00' }, { date: '2026-07-20', value: '172.50' }], trend: 'down' },
        bench: { points: [], trend: 'new' },
        deadlift: { points: [], trend: 'flat' },
      },
    })
    await renderBoard()

    const squat = host.querySelector<HTMLElement>('[data-testid="roster-e1rm-squat"]')!
    expect(squat.textContent).toBe('172.5↓')
    expect(squat.querySelector('.trend-down')).not.toBeNull()
    expect(squat.classList.contains('registered')).toBe(false)
  })
})
