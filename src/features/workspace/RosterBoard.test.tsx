import { StudentPlanCursorBadges } from '../plan-editor/components/StudentPlanCursorBadges'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, onTestFinished, vi } from 'vitest'
import type {
  ChatConversation,
  CoachStudent,
  ExerciseStatsOverview,
  PlanResponse,
  StudentOnboardingProfile,
  StudentVideo,
} from '../../api/types'
import { deriveOverviewBoard } from './overviewBoard'
import { RosterBoard, RosterE1rmBadges, ROSTER_GRID_COLUMNS } from './StatsViews'
import { competitionDistance, FAILED_ROSTER_DATUM, type RosterDataByStudent } from './rosterOverview'

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
    latest_shift: overrides.latest_shift ?? null,
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
          board={deriveOverviewBoard({ students, dataByStudent, plansByStudent: { a: [], b: [plan({})], c: [] }, conversations: [conversation], alerts: { status: 'unavailable' } })}
        />,
      )
    })
  }

  it('019 keeps video and chat counts actionable as reminder tags', async () => {
    const onOpenVideos = vi.fn(), onOpenChat = vi.fn()
    await act(async () => root.render(<RosterBoard students={students} selectedStudentId="a"
      dataByStudent={dataByStudent} plansByStudent={{ a: [], b: [], c: [] }}
      conversations={[conversation, { ...conversation, id: 'cb', other_party: { id: 'b', display_name: '乙' }, unread_count: 5 }]}
      videosByStudent={{ a: [{ id: 'va', viewed_at: null } as StudentVideo], b: [], c: [
        { id: 'vc', viewed_at: null } as StudentVideo,
        { id: 'vd', viewed_at: null } as StudentVideo,
        { id: 've', viewed_at: 'seen' } as StudentVideo,
      ] }} onSelect={onSelect} onOpen={onOpen} onOpenVideos={onOpenVideos} onOpenChat={onOpenChat} />))
    const names = () => [...host.querySelectorAll('.roster-overview-student b')].map(n => n.textContent)
    expect(names()).toEqual(['甲', '乙', '丙'])
    expect(host.querySelector('.roster-overview-student i')).toBeNull()
    expect(host.querySelector('[data-student-id="b"] [data-alert-kind="videos"]')).toBeNull()
    expect(host.querySelector('[data-student-id="c"] [data-alert-kind="videos"]')?.textContent).toBe('视频 2')
    await act(async () => host.querySelector<HTMLButtonElement>('[data-student-id="a"] [data-alert-kind="videos"]')!.click())
    await act(async () => host.querySelector<HTMLButtonElement>('[data-student-id="b"] [data-alert-kind="chat"]')!.click())
    expect(onOpenVideos).toHaveBeenCalledWith('a')
    expect(onOpenChat).toHaveBeenCalledWith('b')
    expect(onSelect).not.toHaveBeenCalled()
    expect(onOpen).not.toHaveBeenCalled()
  })

  it('019 shows all overflow tags in a viewport popover outside the scroll container', async () => {
    onTestFinished(() => { vi.restoreAllMocks() })
    vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(110)
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({ x: 100, y: 700, left: 100, right: 180, top: 700, bottom: 722, width: 80, height: 22, toJSON() {} })
    await renderBoard()
    const more = [...host.querySelectorAll<HTMLButtonElement>('.overview-overflow button')].find(button => button.textContent?.startsWith('+'))!
    expect(more).toBeTruthy()
    await act(async () => more.focus())
    const popover = document.body.querySelector<HTMLElement>('.overview-tag-popover')!
    expect(popover).not.toBeNull()
    expect(host.querySelector('.roster-overview-scroll')?.contains(popover)).toBe(false)
    expect(popover.querySelectorAll('button')).toHaveLength(2)
    expect(Number.parseFloat(popover.style.top)).toBeLessThan(700)
    await act(async () => popover.querySelector<HTMLButtonElement>('[data-alert-kind="plan_ending"]')!.click())
    expect(onOpen).toHaveBeenCalledWith('a')
  })

  it('019 groups the actual rows into attention and normal without filter tabs', async () => {
    await renderBoard()
    expect(host.querySelector('[role="tablist"]')).toBeNull()
    expect(host.querySelector('.overview-section.attention .overview-section-head')?.textContent).toBe('需要注意2')
    expect(host.querySelector('.overview-section.normal .overview-section-head')?.textContent).toBe('正常1')
    expect(host.querySelectorAll('.roster-overview-row')).toHaveLength(3)
    expect([...host.querySelectorAll('.overview-section.attention .roster-overview-student b')].map(node => node.textContent)).toEqual(['甲', '丙'])
    expect([...host.querySelectorAll('.overview-section.normal .roster-overview-student b')].map(node => node.textContent)).toEqual(['乙'])
  })

  it('019 fallback planning tags remain actionable only for pending students', async () => {
    await renderBoard()
    expect(host.querySelectorAll('[data-alert-kind="plan_ending"]')).toHaveLength(2)
    expect(host.querySelector('[data-student-id="b"] [data-alert-kind="plan_ending"]')).toBeNull()

    await act(async () => {
      host.querySelector<HTMLButtonElement>('[data-student-id="a"] [data-alert-kind="plan_ending"]')?.click()
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

  it('preserves trustworthy cursor badges for editor consumers after their removal from the board', async () => {
    await act(async () => {
      root.render(
        <><span data-student-id="a"><StudentPlanCursorBadges cursor={{ kind: 'day', dayId: 'cursor', weekNumber: 2, dayOrdinal: 3, calendarDate: '2026-07-23', lagDays: 4 }} compact /></span>
          <span data-student-id="b"><StudentPlanCursorBadges cursor={{ kind: 'completed' }} compact /></span>
          <span data-student-id="c"><StudentPlanCursorBadges cursor={undefined} compact /></span></>,
      )
    })

    expect(host.querySelector('[data-student-id="a"] [data-student-cursor]')?.textContent)
      .toBe('进行至 W2D3滞后 4 天')
    expect(host.querySelector('[data-student-id="b"] [data-student-cursor]')?.textContent)
      .toBe('已完成全部')
    expect(host.querySelector('[data-student-id="c"] [data-student-cursor]')).toBeNull()
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

    expect(host.querySelector('[data-student-id="a"] .roster-distance')).toBeNull()
    expect(host.querySelector('[data-student-id="b"] .state-inline-fail')?.textContent).toBe('↻失败')
    expect(host.querySelector('[data-student-id="c"] .roster-distance')?.textContent).toBe('未报名')
  })

  it('renders delayed cell skeletons without changing the row height', async () => {
    await act(async () => {
      root.render(
        <RosterBoard
          students={[students[0]]}
          selectedStudentId="a"
          dataByStudent={{ a: {} }}
          plansByStudent={{}}
          conversations={null}
          onSelect={onSelect}
          onOpen={onOpen}
        />,
      )
    })
    expect(host.querySelectorAll('[data-student-id="a"] .state-cell-skeleton')).toHaveLength(0)
    await act(async () => vi.advanceTimersByTime(150))
    expect(host.querySelectorAll('[data-student-id="a"] .state-cell-skeleton').length).toBeGreaterThanOrEqual(4)
    expect(host.querySelector<HTMLElement>('[data-student-id="a"]')?.classList.contains('roster-overview-row')).toBe(true)
  })

  it('isolates a failed field, retries its request, and restores successful content', async () => {
    const retryTonnage = vi.fn()
    const failed: RosterDataByStudent = {
      a: { ...dataByStudent.a, weekTonnageKg: FAILED_ROSTER_DATUM },
    }
    const render = async (data: RosterDataByStudent) => act(async () => root.render(
      <RosterBoard
        students={[students[0]]}
        selectedStudentId="a"
        dataByStudent={data}
        plansByStudent={{ a: [] }}
        conversations={null}
        onSelect={onSelect}
        onOpen={onOpen}
        onRetryWeekTonnage={retryTonnage}
      />,
    ))

    await render(failed)
    const row = host.querySelector('[data-student-id="a"]')!
    expect(row.querySelector('.roster-completion')?.textContent).toContain('90%')
    expect(row.querySelector('.state-inline-fail')?.textContent).toBe('↻失败')
    await act(async () => row.querySelector<HTMLButtonElement>('.state-inline-fail')?.click())
    expect(retryTonnage).toHaveBeenCalledWith('a')
    expect(onSelect).not.toHaveBeenCalled()

    await render({ a: { ...dataByStudent.a, weekTonnageKg: 6200 } })
    expect(host.querySelector('[data-student-id="a"] .roster-number')?.textContent).toBe('6.2t')
    expect(host.querySelector('[data-student-id="a"] .state-inline-fail')).toBeNull()
  })

  it('keeps e1RM failure separate from an authoritative empty response', async () => {
    const retryOverview = vi.fn()
    await act(async () => root.render(
      <RosterE1rmBadges overview={FAILED_ROSTER_DATUM} onRetry={retryOverview} />,
    ))
    expect(host.textContent).toContain('e1RM 拉取失败')
    expect(host.textContent).not.toContain('尚无实测或登记值')
    await act(async () => host.querySelector<HTMLButtonElement>('.state-inline-fail')?.click())
    expect(retryOverview).toHaveBeenCalledTimes(1)

    await act(async () => root.render(<RosterE1rmBadges overview={overview(0)} />))
    expect(host.textContent).toBe('尚无实测或登记值')
  })

  it('moves the selected row with J/K, opens it with Enter, and exempts focused inputs', async () => {
    await renderBoard()

    await act(async () => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'j', bubbles: true }))
    })
    expect(onSelect).toHaveBeenLastCalledWith('c')

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
    expect(onSelect).toHaveBeenLastCalledWith('c')
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
    // 乙:老后端无 e1rm_series——回落登记值置灰;丙:两者皆无——显示明确空态。
    dataByStudent.b.overview = { ...overview(.7), one_rm: { squat: '120', bench: '80', deadlift: '150' } }
    await renderBoard()

    const badge = (row: number, family: string) => host
      .querySelector(`[data-student-id="${students[row].id}"]`)!
      .querySelector(`[data-testid="roster-e1rm-${family}"]`)!
    expect(badge(0, 'squat').textContent).toBe('S155↓')
    expect(badge(0, 'squat').querySelector('.trend-down')).not.toBeNull()
    expect(badge(0, 'bench').textContent).toBe('B100')      // trend=new 不显示箭头
    expect(badge(0, 'deadlift').querySelector('.trend-up')?.textContent).toBe('↑')
    expect(badge(1, 'squat').textContent).toBe('S120')
    expect(badge(1, 'squat').classList.contains('registered')).toBe(true)
    expect(badge(1, 'squat').getAttribute('title')).toContain('登记值')
    expect(host.querySelector('[data-student-id="c"] .roster-e1rm-empty')?.textContent).toBe('尚无实测或登记值')
  })
})
