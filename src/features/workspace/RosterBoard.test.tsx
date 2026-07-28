import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type {
  ChatConversation,
  CoachStudent,
  ExerciseStatsOverview,
  PlanResponse,
  StudentOnboardingProfile,
} from '../../api/types'
import { RosterBoard, ROSTER_GRID_COLUMNS } from './StatsViews'
import { competitionDistance, type RosterDataByStudent } from './rosterOverview'

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const students: CoachStudent[] = [
  { id: 'a', display_name: '甲', status: 'active', evaluation: null },
  { id: 'b', display_name: '乙', status: 'active', evaluation: null },
  { id: 'c', display_name: '丙', status: 'active', evaluation: null },
]

function overview(completionRate: number): ExerciseStatsOverview {
  return {
    exercises: [],
    one_rm: { squat: null, bench: null, deadlift: null },
    last_trained_at: null,
    recent_4w: { trained_days: 0, total_planned_days: 0, completion_rate: completionRate },
  }
}

function profile(overrides: Partial<StudentOnboardingProfile> = {}): StudentOnboardingProfile {
  return {
    deadlift_style: null,
    target_weight_class: '74kg',
    weight_kg: '73.4',
    is_competing: false,
    ...overrides,
  }
}

function plan(overrides: Partial<PlanResponse>): PlanResponse {
  return {
    id: 'plan',
    coach_id: 'coach',
    trainee_id: 'b',
    name: '下周计划',
    start_date: '2026-08-03',
    end_date: '2026-08-09',
    plan_weeks: 1,
    source: 'coach',
    source_template_id: null,
    status: 'published',
    kind: 'regular',
    created_at: '2026-07-20T00:00:00Z',
    updated_at: '2026-07-20T00:00:00Z',
    total_shift_days: 0,
    latest_shift_created_at: null,
    ...overrides,
  }
}

const dataByStudent: RosterDataByStudent = {
  a: { overview: overview(.9), profile: profile(), weekTonnageKg: 7400 },
  b: {
    overview: overview(.7),
    profile: profile({ is_competing: true, competition_date: '2026-08-31' }),
    weekTonnageKg: 6800,
  },
  c: { overview: overview(.6), profile: profile(), weekTonnageKg: null },
}

const conversation: ChatConversation = {
  id: 'conversation',
  other_party: { id: 'a', display_name: '甲' },
  last_message: null,
  last_message_at: null,
  unread_count: 2,
  my_last_read: null,
  other_last_read: null,
}

function tab(host: HTMLElement, label: string): HTMLButtonElement {
  const match = [...host.querySelectorAll<HTMLButtonElement>('[role="tab"]')]
    .find((button) => button.textContent?.startsWith(label))
  if (!match) throw new Error(`tab not found: ${label}`)
  return match
}

describe('RosterBoard overview', () => {
  let host: HTMLDivElement
  let root: Root
  const onSelect = vi.fn()
  const onOpen = vi.fn()

  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-07-27T12:00:00Z'))
    host = document.createElement('div')
    document.body.appendChild(host)
    root = createRoot(host)
  })

  afterEach(() => {
    act(() => root.unmount())
    host.remove()
    vi.useRealTimers()
    vi.clearAllMocks()
  })

  async function renderBoard(): Promise<void> {
    await act(async () => {
      root.render(
        <RosterBoard
          students={students}
          selectedStudentId="a"
          dataByStudent={dataByStudent}
          plansByStudent={{ a: [], b: [plan({})], c: [] }}
          conversations={[conversation]}
          onSelect={onSelect}
          onOpen={onOpen}
        />,
      )
    })
  }

  it('derives tab counts and filters the actual rows', async () => {
    await renderBoard()
    expect(tab(host, '全部学员').textContent).toBe('全部学员3')
    expect(tab(host, '待排').textContent).toBe('待排2')
    expect(tab(host, '需关注').textContent).toBe('需关注2')
    expect(host.querySelectorAll('.roster-overview-row')).toHaveLength(3)

    await act(async () => { tab(host, '待排').click() })
    expect([...host.querySelectorAll('.roster-overview-student b')].map((node) => node.textContent)).toEqual(['甲', '丙'])

    await act(async () => { tab(host, '需关注').click() })
    expect([...host.querySelectorAll('.roster-overview-student b')].map((node) => node.textContent)).toEqual(['乙', '丙'])
  })

  it('shows the write action only on pending rows', async () => {
    await renderBoard()
    expect(host.querySelectorAll('.roster-write')).toHaveLength(2)
    expect(host.querySelector('[data-student-id="b"] .roster-write')).toBeNull()

    await act(async () => {
      host.querySelector<HTMLButtonElement>('[data-student-id="a"] .roster-write')?.click()
    })
    expect(onOpen).toHaveBeenCalledWith('a')
    expect(onSelect).not.toHaveBeenCalled()

    await act(async () => {
      host.querySelector<HTMLElement>('[data-student-id="b"]')?.click()
    })
    expect(onSelect).toHaveBeenCalledWith('b')
  })

  it('uses one exact grid definition for the header and every row', async () => {
    await renderBoard()
    const grids = host.querySelectorAll<HTMLElement>('[data-grid-columns]')
    expect(grids).toHaveLength(4)
    for (const grid of grids) {
      expect(grid.dataset.gridColumns).toBe(ROSTER_GRID_COLUMNS)
      expect(grid.style.gridTemplateColumns).toBe(ROSTER_GRID_COLUMNS)
    }
  })

  it('distinguishes an unavailable profile from an explicit non-competitor', async () => {
    expect(competitionDistance(undefined)).toEqual({ days: null, registered: null })
    expect(competitionDistance(profile(), true)).toEqual({ days: null, registered: null })
    expect(competitionDistance(profile({ is_competing: null }))).toEqual({ days: null, registered: null })
    expect(competitionDistance(profile())).toEqual({ days: null, registered: false })

    await act(async () => {
      root.render(
        <RosterBoard
          students={students}
          selectedStudentId="a"
          dataByStudent={{
            a: {},
            b: { profile: profile(), profileError: true },
            c: { profile: profile({ is_competing: false }) },
          }}
          plansByStudent={{}}
          conversations={null}
          onSelect={onSelect}
          onOpen={onOpen}
        />,
      )
    })

    expect(host.querySelector('[data-student-id="a"] .roster-distance')?.textContent).toBe('—')
    expect(host.querySelector('[data-student-id="b"] .roster-distance')?.textContent).toBe('—')
    expect(host.querySelector('[data-student-id="c"] .roster-distance')?.textContent).toBe('未报名')
  })

  it('moves the selected row with J/K, opens it with Enter, and exempts focused inputs', async () => {
    await renderBoard()

    await act(async () => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'j', bubbles: true }))
    })
    expect(onSelect).toHaveBeenLastCalledWith('b')

    await act(async () => {
      root.render(
        <>
          <input aria-label="总览外部输入" />
          <RosterBoard
            students={students}
            selectedStudentId="b"
            dataByStudent={dataByStudent}
            plansByStudent={{ a: [], b: [plan({})], c: [] }}
            conversations={[conversation]}
            onSelect={onSelect}
            onOpen={onOpen}
          />
        </>,
      )
    })
    await act(async () => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', bubbles: true }))
    })
    expect(onSelect).toHaveBeenLastCalledWith('a')
    await act(async () => {
      root.render(
        <>
          <input aria-label="总览外部输入" />
          <RosterBoard
            students={students}
            selectedStudentId="a"
            dataByStudent={dataByStudent}
            plansByStudent={{ a: [], b: [plan({})], c: [] }}
            conversations={[conversation]}
            onSelect={onSelect}
            onOpen={onOpen}
          />
        </>,
      )
    })
    await act(async () => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    })
    expect(onOpen).toHaveBeenCalledWith('a')

    const input = host.querySelector<HTMLInputElement>('[aria-label="总览外部输入"]')!
    input.focus()
    const calls = onSelect.mock.calls.length
    await act(async () => {
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'j', bubbles: true }))
    })
    expect(onSelect).toHaveBeenCalledTimes(calls)
  })
})
