import { act, useState } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { CoachStudent, ExerciseStatsOverview } from '../../api/types'
import { TrackingDashboard } from './TrackingDashboard'

;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const students: CoachStudent[] = [
  { id: 'student-a', display_name: '甲学员', status: 'active', evaluation: null },
  { id: 'student-b', display_name: '乙学员', status: 'active', evaluation: null },
]

function overview(withTracking = true): ExerciseStatsOverview {
  const base: ExerciseStatsOverview = {
    exercises: [],
    one_rm: { squat: null, bench: null, deadlift: null },
    last_trained_at: '2026-08-08',
    recent_4w: { trained_days: 8, total_planned_days: 10, completion_rate: .8 },
  }
  if (!withTracking) return base
  return {
    ...base,
    e1rm_series: {
      squat: { trend: 'up', points: [{ date: '2026-07-06', value: '100' }, { date: '2026-08-03', value: '112' }] },
      bench: { trend: 'flat', points: [{ date: '2026-07-06', value: '75' }, { date: '2026-08-03', value: '75' }] },
      // 单点 + 后端 trend='new':detail 不显示「较起点」,趋势不自算。
      deadlift: { trend: 'new', points: [{ date: '2026-08-03', value: '140' }] },
    },
    weekly_volume: [{
      week_start: '2026-08-03', volume_kg: '14700', avg_rpe: '8.1',
      volume_by_family: { squat: '6000', bench: '3900', deadlift: '4800', other: '0' },
    }],
    weekly_family_metrics: {
      squat: [{ week_start: '2026-07-27', volume_kg: '5200', avg_rpe: '7.8', top_set_intensity: '81.5' }, { week_start: '2026-08-03', volume_kg: '6000', avg_rpe: '8.2', top_set_intensity: '84.0' }],
      bench: [{ week_start: '2026-08-03', volume_kg: '3900', avg_rpe: '7.5', top_set_intensity: '78.0' }],
      deadlift: [{ week_start: '2026-08-03', volume_kg: '4800', avg_rpe: null, top_set_intensity: '86.5' }],
    },
    intensity_distribution: {
      squat: { lt70: 2, b70_80: 3, b80_90: 4, gte90: 1 },
      bench: { lt70: 4, b70_80: 4, b80_90: 2, gte90: 0 },
      // 全零分布必须落空态,不画空柱状图。
      deadlift: { lt70: 0, b70_80: 0, b80_90: 0, gte90: 0 },
    },
    rep_distribution: {
      squat: [{ reps: 1, count: 2 }, { reps: 5, count: 6 }, { reps: 8, count: 2 }],
      bench: [{ reps: 3, count: 4 }, { reps: 8, count: 6 }],
      deadlift: [{ reps: 1, count: 3 }, { reps: 9, count: 7 }],
    },
  }
}

function Harness({ cache, ensure }: {
  cache: Record<string, ExerciseStatsOverview | null | undefined>
  ensure: (studentId: string) => void
}) {
  const [studentId, setStudentId] = useState('student-a')
  return <TrackingDashboard
    students={students}
    selectedStudentId={studentId}
    onStudentChange={setStudentId}
    overview={cache[studentId]}
    onEnsureOverview={ensure}
  />
}

describe('TrackingDashboard', () => {
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

  it('draws all eight cards from the injected overview with the lift color contract', () => {
    const ensure = vi.fn()
    act(() => root.render(<Harness cache={{ 'student-a': overview() }} ensure={ensure} />))

    expect(host.querySelectorAll('.tracking-card')).toHaveLength(8)
    expect([...host.querySelectorAll('.tracking-card-head h2')].map((node) => node.textContent)).toEqual([
      'e1RM over time', 'Volume over time', 'Avg RPE over time', 'Intensity over time',
      'Intensity distribution', 'Rep distribution', 'Volume share by lift', 'Bodyweight',
    ])
    expect(host.textContent).toContain('112.0 kg')
    expect(host.textContent).toContain('较起点 +12.0 kg')
    expect(host.textContent).toContain('6.0 吨')
    expect(host.textContent).toContain('暂无体态打卡数据')
    expect(host.querySelector('[data-family="squat"] polyline')?.getAttribute('stroke')).toBe('#276FBF')
    expect(host.querySelector('[data-family="bench"] polyline')?.getAttribute('stroke')).toBe('#18855B')
    expect(host.querySelector('[data-family="deadlift"] polyline')?.getAttribute('stroke')).toBe('#C43B35')
    expect(host.querySelector('[aria-label="深蹲强度分布柱状图"]')?.textContent).toContain('90%+')
    expect(host.querySelector('[aria-label="硬拉次数分布柱状图"]')?.textContent).toContain('8+')
    expect(host.querySelector('[aria-label="深蹲容量占比横条图"]')).not.toBeNull()
  })

  it('aligns weekly points on a card-wide shared week axis', () => {
    act(() => root.render(<Harness cache={{ 'student-a': overview() }} ensure={vi.fn()} />))

    // 共享轴 = 三 family week_start 并集(7/27, 8/3)→ 两个 slot。
    // bench 只有 8/3 一周,它唯一的柱子必须落在第 2 个 slot,与 squat 的第二根同 x,不独占全轴。
    const benchBar = host.querySelector<SVGRectElement>('[aria-label="卧推Volume over time柱状图"] rect[fill="#18855B"]')
    const squatBars = host.querySelectorAll<SVGRectElement>('[aria-label="深蹲Volume over time柱状图"] rect[fill="#276FBF"]')
    expect(squatBars).toHaveLength(2)
    expect(benchBar?.getAttribute('x')).toBe(squatBars[1]?.getAttribute('x'))

    // 折线同理:bench 单点落在共享轴末端(t=1 → x=284),不居中。
    const benchDot = host.querySelector<SVGCircleElement>('[aria-label="卧推Intensity over time折线图"] circle')
    expect(benchDot?.getAttribute('cx')).toBe('284')
    // 共享轴端点标签在单周 family 的图上也显示两端。
    expect(host.querySelector('[aria-label="卧推Avg RPE over time折线图"]')?.textContent).toContain('7/27 周')
  })

  it('uses the backend trend for single-point e1RM and never shows a zero delta', () => {
    act(() => root.render(<Harness cache={{ 'student-a': overview() }} ensure={vi.fn()} />))

    const deadliftHead = host.querySelector('[data-card-title="e1RM over time"] [data-family="deadlift"] .tracking-family-head')
    expect(deadliftHead?.textContent).toContain('140.0 kg')
    expect(deadliftHead?.textContent).not.toContain('较起点')
    expect(deadliftHead?.textContent).toContain('新数据')
    // 单点不把同一日期标在轴两端。
    const labels = [...host.querySelectorAll('[aria-label="硬拉 e1RM 折线图"] text')].map((node) => node.textContent)
    expect(labels.filter((text) => text === '8/3')).toHaveLength(1)
  })

  it('shows the empty state for an all-zero distribution instead of a blank chart', () => {
    act(() => root.render(<Harness cache={{ 'student-a': overview() }} ensure={vi.fn()} />))

    const deadliftIntensity = host.querySelector('[data-card-title="Intensity distribution"] [data-family="deadlift"]')
    expect(deadliftIntensity?.querySelector('svg')).toBeNull()
    expect(deadliftIntensity?.textContent).toContain('暂无数据')
  })

  it('shows a separate old-backend placeholder on every affected card', () => {
    act(() => root.render(<Harness cache={{ 'student-a': overview(false) }} ensure={vi.fn()} />))

    expect(host.querySelectorAll('.tracking-card')).toHaveLength(8)
    expect(host.querySelectorAll('.tracking-version-placeholder')).toHaveLength(7)
    expect([...host.querySelectorAll('.tracking-version-placeholder')].every((node) => node.textContent === '后端版本过旧')).toBe(true)
    expect(host.textContent).toContain('暂无体态打卡数据')
  })

  it('renders loading and failure states from the workspace cache entry', () => {
    const ensure = vi.fn()
    act(() => root.render(<Harness cache={{}} ensure={ensure} />))
    expect(host.textContent).toContain('加载追踪数据…')

    act(() => root.render(<Harness cache={{ 'student-a': null }} ensure={ensure} />))
    expect(host.textContent).toContain('追踪数据加载失败')
  })

  it('asks the workspace to ensure the overview once per student selection', () => {
    const ensure = vi.fn()
    act(() => root.render(<Harness cache={{ 'student-a': overview() }} ensure={ensure} />))
    act(() => root.render(<Harness cache={{ 'student-a': overview() }} ensure={ensure} />))
    expect(ensure).toHaveBeenCalledTimes(1)
    expect(ensure).toHaveBeenCalledWith('student-a')

    const select = host.querySelector<HTMLSelectElement>('.student-select')!
    act(() => {
      Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')?.set?.call(select, 'student-b')
      select.dispatchEvent(new Event('change', { bubbles: true }))
    })

    expect(ensure).toHaveBeenCalledTimes(2)
    expect(ensure).toHaveBeenLastCalledWith('student-b')
  })
})
