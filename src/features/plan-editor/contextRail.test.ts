import { describe, expect, it } from 'vitest'
import {
  RAIL_MODE_KEY,
  RAIL_WIDTH,
  contextRailLevel,
  isMainLiftDetail,
  isRowComplete,
  metricCells,
  railPlacement,
  topSetWeight,
} from './components/ContextRail'
import type { ExerciseRow } from './types'
import type { ExerciseStatsDetail, StudentOnboardingProfile } from '../../api/types'

function row(patch: Partial<ExerciseRow> = {}): ExerciseRow {
  return {
    id: 'r1',
    serverRowId: null,
    serverSortOrder: null,
    hasLogs: false,
    conflictMessage: null,
    exerciseId: 'sumo-dl',
    name: '相扑硬拉',
    ku: true,
    custom: false,
    isMain: true,
    aux: false,
    reps: '3',
    mode: 'kg',
    boxes: [{ val: '215', empty: false }],
    note: '',
    ...patch,
  }
}

const profile = {
  squat_1rm_kg: '240', bench_1rm_kg: '100', deadlift_1rm_kg: '270',
} as unknown as StudentOnboardingProfile

function detail(patch: Partial<ExerciseStatsDetail> = {}): ExerciseStatsDetail {
  return {
    rep_prs: [{ reps: 3, weight_kg: '215', logged_at: '2026-07-14', source: 'logged' }],
    recent_sessions: [{ date: '2026-07-14', sets: [
      { set_index: 1, weight_kg: '215', reps: 3, rpe: '8.5', completed: true, failed: false, assumed: false, has_video: false },
    ] }],
    by_set_count: {},
    e1rm: { value: '228.5', computed_at: '2026-07-27' },
    one_rm_reference: '270',
    ...patch,
  }
}

describe('contextRailLevel', () => {
  it('stays at the day level until the row binds to a catalog exercise', () => {
    expect(contextRailLevel(null)).toBe(1)
    expect(contextRailLevel(row({ exerciseId: null }))).toBe(1)
  })

  it('climbs through sets and reps as the coach fills the row in', () => {
    expect(contextRailLevel(row({ reps: '', boxes: [] }))).toBe(2)
    expect(contextRailLevel(row({ reps: '', boxes: [{ val: '', empty: false }] }))).toBe(3)
    expect(contextRailLevel(row())).toBe(4)
  })
})

describe('isRowComplete', () => {
  it('needs an exercise, sets, reps and a value in every live box', () => {
    expect(isRowComplete(row())).toBe(true)
    expect(isRowComplete(row({ exerciseId: null }))).toBe(false)
    expect(isRowComplete(row({ reps: '' }))).toBe(false)
    expect(isRowComplete(row({ boxes: [] }))).toBe(false)
    expect(isRowComplete(row({ boxes: [{ val: '215', empty: false }, { val: '', empty: false }] }))).toBe(false)
  })

  it('ignores skipped slots and treats bodyweight rows as complete without a load', () => {
    expect(isRowComplete(row({ boxes: [{ val: '215', empty: false }, { val: '', empty: true }] }))).toBe(true)
    expect(isRowComplete(row({ mode: 'bodyweight', boxes: [{ val: '', empty: false }] }))).toBe(true)
  })
})

describe('railPlacement', () => {
  const container = 1440

  it('parks the rail just right of the selected day', () => {
    expect(railPlacement({ left: 0, right: 320 }, container)).toEqual({ left: 328 })
  })

  it('flips to the left when the day sits too close to the right edge', () => {
    expect(railPlacement({ left: 1100, right: 1400 }, container)).toEqual({ left: 832 })
  })

  it('clamps inside the editor when neither side fits', () => {
    const placement = railPlacement({ left: 0, right: 1430 }, container)
    expect(placement.left).toBe(container - RAIL_WIDTH)
  })
})

describe('metricCells', () => {
  it('shows the three onboarding 1RMs while only a day is selected', () => {
    const cells = metricCells({ level: 1, profile, detail: null, reps: 0, weight: null })
    expect(cells.map((c) => c.label)).toEqual(['深蹲 1RM', '卧推 1RM', '硬拉 1RM'])
    expect(cells.map((c) => c.value)).toEqual(['240', '100', '270'])
  })

  it('leads with 1RM and e1RM for a main lift', () => {
    const cells = metricCells({ level: 2, profile, detail: detail(), reps: 0, weight: null })
    expect(cells.map((c) => c.label)).toEqual(['登记 1RM', 'e1RM · 滚动'])
  })

  it('adds the intensity percentage once a weight is typed', () => {
    const cells = metricCells({ level: 4, profile, detail: detail(), reps: 3, weight: 215 })
    expect(cells[2]).toEqual({ value: '94%', label: '本次 ÷ e1RM', tone: 'accent' })
  })

  it('omits 1RM and e1RM for accessories', () => {
    const accessory = detail({ one_rm_reference: null, e1rm: null, rep_prs: [
      { reps: 10, weight_kg: '55', logged_at: '2026-07-24', source: 'logged' },
    ] })
    const cells = metricCells({ level: 4, profile, detail: accessory, reps: 10, weight: 55 })
    expect(cells.map((c) => c.label)).toEqual(['10 次最好', '最近一次顶组'])
    expect(isMainLiftDetail(accessory)).toBe(false)
  })
})

describe('topSetWeight', () => {
  it('reads the heaviest filled box, and nothing for non-kg rows', () => {
    expect(topSetWeight(row({ boxes: [{ val: '180', empty: false }, { val: '215', empty: false }] }))).toBe(215)
    expect(topSetWeight(row({ mode: 'rpe' }))).toBeNull()
    expect(topSetWeight(null)).toBeNull()
  })
})

describe('rail mode storage key', () => {
  it('is namespaced so it cannot collide with other editor preferences', () => {
    expect(RAIL_MODE_KEY).toBe('meetpr.plan-editor.rail-mode')
  })
})
