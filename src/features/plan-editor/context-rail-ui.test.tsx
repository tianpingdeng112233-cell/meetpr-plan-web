import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ExerciseStatsDetail, StudentOnboardingProfile } from '../../api/types'
import { PlanEditor } from './PlanEditor'
import type { DayCol, ExerciseRow, Week } from './types'

const api = vi.hoisted(() => ({ getExerciseStats: vi.fn() }))

vi.mock('../../api/coach', () => ({ getExerciseStats: api.getExerciseStats }))

;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

// Weight left blank by default: an in-progress row keeps the exercise context in
// the header, while a filled row (see the completion test) hands it back to the
// student profile.
function row(id = 'squat', name = '竞技深蹲', isMain = true, weight = ''): ExerciseRow {
  return {
    id, serverRowId: null, serverSortOrder: null, hasLogs: false, conflictMessage: null,
    exerciseId: id, name, ku: true, custom: false, isMain, aux: false,
    reps: '5', mode: 'kg', boxes: [{ val: weight, empty: false }], note: '',
  }
}

function week(rows: ExerciseRow[] = [row(), row('bench', '竞技卧推', false)]): Week {
  const days: DayCol[] = [{
    dow: 0, dowLabel: '周一', dateLabel: '7/27', rest: false, rows,
  }]
  return { num: 1, num2: '01', range: '7/27–8/2', isCurrent: false, vol: '', days }
}

const profile = {
  gender: 'male', training_years: 7, training_days: [1, 2, 3],
  squat_1rm_kg: '240', bench_1rm_kg: '100', deadlift_1rm_kg: '270',
  squat_stance: 'high_bar', deadlift_style: 'sumo', bench_grip: 'standard',
  injury_areas: [], injury_notes: '', is_competing: false,
  competition_date: null, target_weight_class: null, note_to_coach: '',
} as unknown as StudentOnboardingProfile

function detail(recent = true): ExerciseStatsDetail {
  return {
    one_rm_reference: '240',
    e1rm: recent ? { value: '221.5', computed_at: '2026-07-27' } : null,
    rep_prs: [], by_set_count: {},
    recent_sessions: recent ? [{
      date: '2026-07-27',
      sets: [
        { set_index: 1, weight_kg: '185', reps: 5, rpe: '8', completed: true, failed: false, assumed: false, has_video: false },
        { set_index: 2, weight_kg: '185', reps: 5, rpe: '8.5', completed: true, failed: false, assumed: false, has_video: false },
        { set_index: 3, weight_kg: '185', reps: 5, rpe: '9', completed: true, failed: false, assumed: false, has_video: false },
      ],
    }] : [],
  }
}

// v1.3 页眉集成试验：原 rail 交互测试改为生产入口与页眉上下文口径；
// ContextRail 的纯视图/定位测试保留，方便试验回滚。
describe('plan editor day-header context experiment', () => {
  let host: HTMLDivElement
  let root: Root

  beforeEach(() => {
    api.getExerciseStats.mockReset()
    api.getExerciseStats.mockResolvedValue(detail())
    host = document.createElement('div')
    document.body.appendChild(host)
    root = createRoot(host)
    Object.defineProperty(Element.prototype, 'scrollIntoView', { value: vi.fn(), configurable: true })
  })

  afterEach(() => {
    act(() => root.unmount())
    host.remove()
    vi.restoreAllMocks()
  })

  function renderEditor(weeks: Week[] = [week()]) {
    act(() => root.render(
      <PlanEditor initialWeeks={weeks} weeksCount={1} studentId="student-1" studentName="吕子豪"
        planName="Monster" onboardingProfile={profile} />,
    ))
  }

  function selectDay() {
    const day = host.querySelector<HTMLElement>('.day[data-dow]')!
    act(() => day.dispatchEvent(new MouseEvent('click', { bubbles: true })))
  }

  async function selectRow(id = 'squat') {
    const exerciseRow = host.querySelector<HTMLElement>(`[data-rowid="${id}"]`)!
    await act(async () => {
      exerciseRow.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 }))
      await Promise.resolve()
    })
  }

  it('shows the full student profile inline in the day header when no row is selected', () => {
    renderEditor()
    expect(host.querySelector('[data-dayhead-context]')).toBeNull()

    selectDay()

    const context = host.querySelector<HTMLElement>('[data-dayhead-context]')!
    expect(context.dataset.contextState).toBe('student')

    const inline = context.querySelector<HTMLElement>('.dayhead-profile-inline')!
    expect(inline.textContent).toContain('吕子豪')
    expect(inline.textContent).toContain('S 240 / B 100 / D 270')
    expect(inline.textContent).toContain('7 年 · 每周 3 天')
    expect(inline.textContent).toContain('暂不备赛')

    // The popover <details> fallback stays mounted for rest-day headers.
    expect(context.querySelector('details.dayhead-profile')).not.toBeNull()
  })

  it('returns the header to the student profile once the selected row is complete', async () => {
    renderEditor([week([row('squat', '竞技深蹲', true, '100')])])
    selectDay()
    await selectRow()

    const context = host.querySelector<HTMLElement>('[data-dayhead-context]')!
    expect(context.dataset.contextState).toBe('student')
    expect(context.querySelector('.dayhead-profile-inline')?.textContent).toContain('S 240 / B 100 / D 270')
    expect(api.getExerciseStats).not.toHaveBeenCalled()
  })

  it('shows the selected exercise recent-session summary and e1RM in the day header', async () => {
    renderEditor()
    selectDay()
    await selectRow()

    const context = host.querySelector<HTMLElement>('[data-dayhead-context]')!
    expect(context.dataset.contextState).toBe('exercise')
    expect(context.textContent).toContain('竞技深蹲')
    expect(context.textContent).toContain('上次 07/27 · 3×5 @ 185kg / RPE 9')
    expect(context.textContent).toContain('e1RM 221.5kg')
    expect(api.getExerciseStats).toHaveBeenCalledWith('student-1', 'squat')
  })

  it('shows the no-history empty state for an exercise without records', async () => {
    api.getExerciseStats.mockResolvedValue(detail(false))
    renderEditor()
    selectDay()
    await selectRow()

    const context = host.querySelector<HTMLElement>('[data-dayhead-context]')!
    expect(context.textContent).toContain('竞技深蹲')
    expect(context.textContent).toContain('暂无训练记录')
    expect(context.textContent).not.toContain('e1RM')
  })

  it('does not render the retired rail or its recall/placement controls', async () => {
    renderEditor()
    selectDay()
    await selectRow()

    expect(host.querySelector('[data-context-rail]')).toBeNull()
    expect(host.querySelector('.context-recall')).toBeNull()
    expect(host.querySelector('.plan-with-rail.rail-open')).toBeNull()
    expect(host.textContent).not.toContain('显示撰写上下文')
  })
})
