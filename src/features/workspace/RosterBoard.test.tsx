import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, onTestFinished, vi } from 'vitest'
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

  it('renders e1RM badges from the backend trend, falling back to registered values', async () => {
    const original = { a: dataByStudent.a.overview, b: dataByStudent.b.overview }
    onTestFinished(() => {
      dataByStudent.a.overview = original.a
      dataByStudent.b.overview = original.b
    })
    // 甲:有实测序列——数值在涨但后端 trend=down,必须显示 ↓(锁「趋势不在前端重算」)。
    dataByStudent.a.overview = {
      ...overview(.9),
      one_rm: { squat: '140', bench: null, deadlift: null },
      e1rm_series: {
        squat: { trend: 'down', points: [{ date: '2026-07-01', value: '150' }, { date: '2026-07-20', value: '155.4' }] },
        bench: { trend: 'new', points: [{ date: '2026-07-20', value: '99.6' }] },
        deadlift: { trend: 'up', points: [{ date: '2026-07-20', value: '180.2' }] },
      },
    }
    // 乙:老后端无 e1rm_series——回落登记值置灰;丙:两者皆无——显示 —。
    dataByStudent.b.overview = { ...overview(.7), one_rm: { squat: '120', bench: '80', deadlift: '150' } }
    await renderBoard()

    const badge = (row: number, family: string) => host
      .querySelectorAll('.roster-overview-row')[row]!
      .querySelector(`[data-testid="roster-e1rm-${family}"]`)!
    expect(badge(0, 'squat').textContent).toBe('S155↓')
    expect(badge(0, 'squat').querySelector('.trend-down')).not.toBeNull()
    expect(badge(0, 'bench').textContent).toBe('B100')      // trend=new 不显示箭头
    expect(badge(0, 'deadlift').querySelector('.trend-up')?.textContent).toBe('↑')
    expect(badge(1, 'squat').textContent).toBe('S120')
    expect(badge(1, 'squat').classList.contains('registered')).toBe(true)
    expect(badge(1, 'squat').getAttribute('title')).toContain('登记值')
    expect(badge(2, 'deadlift').textContent).toBe('D—')
    // 纯无数据态不带 .registered——三态视觉不合并。
    expect(badge(2, 'deadlift').classList.contains('registered')).toBe(false)
  })
})
