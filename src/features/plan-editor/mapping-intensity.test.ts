import { describe, expect, it } from 'vitest'
import type { PlanExerciseResponse, PlanSetResponse, PlanWithChildren } from '../../api/types'
import { mapPlanToWeeks, type Catalog } from './mapping'
import { rowIntensity } from './intensityModel'

function set(id: string, patch: Partial<PlanSetResponse>): PlanSetResponse {
  return {
    id,
    plan_exercise_id: 'pe',
    set_number: 1,
    target_reps: 5,
    target_reps_max: null,
    intensity_mode: 'weight',
    target_value: '100',
    set_type: 'working',
    rest_seconds: null,
    coach_note: null,
    created_at: '',
    ...patch,
  }
}

function exercise(id: string, sets: PlanSetResponse[]): PlanExerciseResponse {
  return {
    id: `pe-${id}`,
    plan_day_id: 'day',
    exercise_id: id,
    is_main_lift: false,
    sort_order: 0,
    notes: null,
    sets: sets.map((item, index) => ({ ...item, plan_exercise_id: `pe-${id}`, set_number: index + 1 })),
  }
}

function plan(exercises: PlanExerciseResponse[]): PlanWithChildren {
  return {
    id: 'plan', coach_id: 'coach', trainee_id: 'student', name: '计划',
    start_date: '2026-08-03', end_date: '2026-08-09', plan_weeks: 1,
    source: 'coach', source_template_id: null, status: 'draft', kind: 'regular',
    created_at: '', updated_at: '', total_shift_days: 0, latest_shift_created_at: null,
    days: [{
      id: 'day', plan_id: 'plan', day_of_week: 1, week_number: 1, sort_order: 0,
      shifted_to_date: null, exercises,
    }],
  }
}

describe('spec 034 plan read reconstruction', () => {
  it('rebuilds row-level intensity and infers uniform versus per-set weights', () => {
    const exercises = [
      exercise('dual', [
        set('dual-1', { load_mode: 'rpe', target_rpe: '8.0', target_weight: '170', target_value: '170' }),
        set('dual-2', { load_mode: 'rpe', target_rpe: '8.5', target_weight: '172.5', target_value: '172.5' }),
      ]),
      exercise('range', [
        set('range-1', { load_mode: 'weight_range', weight_low: '165', weight_high: '175', target_weight: null, target_value: '165' }),
        set('range-2', { load_mode: 'weight_range', weight_low: '165', weight_high: '175', target_weight: null, target_value: '165' }),
      ]),
      exercise('weight', [
        set('weight-1', { load_mode: null, target_weight: '100.0', target_value: '100' }),
        set('weight-2', { load_mode: null, target_weight: '100.0', target_value: '100' }),
      ]),
    ]
    const catalog: Catalog = new Map(exercises.map((item) => [item.exercise_id, { name: item.exercise_id, custom: false }]))

    const rows = mapPlanToWeeks(plan(exercises), catalog)[0].days[0].rows
    expect(rows[0]).toMatchObject({
      mode: 'kg', intensity: { mode: 'rpe', value: '8', high: '' }, weightMode: 'per_set',
      intensityMode: 'per_set',
      intensityBoxes: [{ val: '8', empty: false }, { val: '8.5', empty: false }],
      boxes: [{ val: '170', empty: false }, { val: '172.5', empty: false }],
    })
    expect(rows[1]).toMatchObject({
      intensity: { mode: 'weight_range', value: '165', high: '175' }, weightMode: 'uniform',
      boxes: [{ val: '', empty: true }, { val: '', empty: true }],
    })
    expect(rows[2]).toMatchObject({
      intensity: null, weightMode: 'uniform',
      boxes: [{ val: '100', empty: false }, { val: '100', empty: false }],
    })
  })

  it('keeps old load_mode-null RPE sets in the lossless compatibility shape', () => {
    const legacy = exercise('legacy-rpe', [
      set('legacy-1', { load_mode: null, intensity_mode: 'rpe', target_value: '7.5', target_weight: null }),
      set('legacy-2', { load_mode: null, intensity_mode: 'rpe', target_value: '8', target_weight: null }),
    ])
    const rows = mapPlanToWeeks(
      plan([legacy]),
      new Map([['legacy-rpe', { name: '旧 RPE', custom: false }]]),
    )[0].days[0].rows

    expect(rows[0]).toMatchObject({
      mode: 'rpe',
      intensityMode: 'per_set',
      intensityBoxes: [{ val: '7.5', empty: false }, { val: '8', empty: false }],
      boxes: [{ val: '', empty: true }, { val: '', empty: true }],
    })
    expect(rows[0].intensity).toBeUndefined()
    expect(rowIntensity(rows[0])).toEqual({ mode: 'rpe', value: '7.5', high: '' })
  })

  it('aggregates a uniform legacy RPE row without losing its legacy wire provenance', () => {
    const legacy = exercise('uniform-legacy-rpe', [
      set('legacy-1', { load_mode: null, intensity_mode: 'rpe', target_value: '8', target_weight: null }),
      set('legacy-2', { load_mode: null, intensity_mode: 'rpe', target_value: '8.0', target_weight: null }),
    ])
    const row = mapPlanToWeeks(
      plan([legacy]),
      new Map([['uniform-legacy-rpe', { name: '旧统一 RPE', custom: false }]]),
    )[0].days[0].rows[0]

    expect(row).toMatchObject({
      mode: 'rpe',
      intensityMode: 'uniform',
      intensityBoxes: [{ val: '8', empty: false }, { val: '8', empty: false }],
      boxes: [{ val: '', empty: true }, { val: '', empty: true }],
    })
    expect(row.intensity).toBeUndefined()
    expect(rowIntensity(row)).toEqual({ mode: 'rpe', value: '8', high: '' })
  })
})
