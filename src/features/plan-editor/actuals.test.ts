import { describe, expect, it } from 'vitest'
import type { StudentSetLog } from '../../api/types'
import type { ExerciseRow, RowIntensity } from './types'
import {
  actualIntensityChip,
  actualRpe,
  actualWeightTone,
  formatActualWeight,
  groupActualsByExercise,
  splitActualSets,
  groupStudentAddedByDay,
  type ActualSet,
} from './actuals'

function row(overrides: Partial<ExerciseRow> = {}): ExerciseRow {
  return {
    id: 'r1', serverRowId: 'pe-1', serverSortOrder: null, hasLogs: true, conflictMessage: null,
    exerciseId: 'squat', name: '低杠深蹲', ku: true, custom: false, isMain: true, aux: false,
    reps: '5', mode: 'kg', intensity: null, weightMode: 'per_set',
    boxes: [{ val: '90', empty: false }, { val: '95', empty: false }, { val: '100', empty: false }],
    note: '',
    ...overrides,
  }
}

function set(overrides: Partial<ActualSet> = {}): ActualSet {
  return {
    set_index: 0, weight_kg: '90.00', reps: 5, rpe: '8.0', coach_rpe: null,
    completed: true, failed: false,
    ...overrides,
  }
}

function log(overrides: Partial<StudentSetLog> = {}): StudentSetLog {
  return {
    id: 'l1', student_id: 's1', plan_exercise_id: 'pe-1', exercise_id: 'squat',
    set_index: 0, weight_kg: '90.00', reps: 5, rpe: '8.0', coach_rpe: null,
    completed: true, failed: false, assumed: false, adhoc: false,
    logged_date: '2026-08-10', logged_at: '2026-08-10T10:00:00Z',
    ...overrides,
  }
}

describe('groupActualsByExercise', () => {
  it('groups by plan_exercise_id sorted by set_index, dropping adhoc rows', () => {
    const grouped = groupActualsByExercise([
      log({ id: 'a', set_index: 1, weight_kg: '95.00' }),
      log({ id: 'b', set_index: 0 }),
      log({ id: 'c', plan_exercise_id: null }),
      log({ id: 'd', plan_exercise_id: 'pe-2', set_index: 0 }),
    ])
    expect([...grouped.keys()].sort()).toEqual(['pe-1', 'pe-2'])
    expect(grouped.get('pe-1')!.map((s) => s.set_index)).toEqual([0, 1])
  })

  it('keeps only the latest log per set_index (re-log replaces)', () => {
    const grouped = groupActualsByExercise([
      log({ id: 'old', set_index: 0, weight_kg: '80.00', logged_at: '2026-08-10T10:00:00Z' }),
      log({ id: 'new', set_index: 0, weight_kg: '92.50', logged_at: '2026-08-10T11:00:00Z' }),
    ])
    expect(grouped.get('pe-1')).toHaveLength(1)
    expect(grouped.get('pe-1')![0]!.weight_kg).toBe('92.50')
  })
})

describe('actualWeightTone (±5kg)', () => {
  it('per-set target: within tolerance is ok, beyond is off', () => {
    expect(actualWeightTone(row(), 0, set({ weight_kg: '94.00' }))).toBe('ok')
    expect(actualWeightTone(row(), 0, set({ weight_kg: '95.50' }))).toBe('off')
    expect(actualWeightTone(row(), 2, set({ weight_kg: '96.00' }))).toBe('ok')
  })

  it('weight_range target flags only outside boundary ± 5kg', () => {
    const intensity: RowIntensity = { mode: 'weight_range', value: '100', high: '110' }
    const r = row({ intensity })
    expect(actualWeightTone(r, 0, set({ weight_kg: '96.00' }))).toBe('ok')
    expect(actualWeightTone(r, 0, set({ weight_kg: '94.00' }))).toBe('off')
    expect(actualWeightTone(r, 0, set({ weight_kg: '115.00' }))).toBe('ok')
    expect(actualWeightTone(r, 0, set({ weight_kg: '116.00' }))).toBe('off')
  })

  it('is na without a comparable target', () => {
    expect(actualWeightTone(row({ boxes: [{ val: '', empty: true }] }), 0, set())).toBe('na')
    expect(actualWeightTone(row({ mode: 'bodyweight', intensity: null }), 0, set())).toBe('na')
  })
})

describe('actualIntensityChip', () => {
  const rpeRow = (value: string) => row({
    intensity: { mode: 'rpe', value, high: '' },
    intensityMode: 'uniform',
    intensityBoxes: [{ val: value, empty: false }, { val: value, empty: false }, { val: value, empty: false }],
  })

  it('rpe: ±1 is ok, beyond is off, missing target is na', () => {
    expect(actualIntensityChip(rpeRow('8'), 0, set({ rpe: '9.0' }), null)).toEqual({ text: '@9', tone: 'ok' })
    expect(actualIntensityChip(rpeRow('8'), 0, set({ rpe: '9.5' }), null)).toEqual({ text: '@9.5', tone: 'off' })
    expect(actualIntensityChip(row(), 0, set({ rpe: '9.0' }), null).tone).toBe('na')
  })

  it('falls back to coach_rpe when the student left rpe empty', () => {
    expect(actualRpe(set({ rpe: null, coach_rpe: '7.5' }))).toBe(7.5)
    expect(actualIntensityChip(rpeRow('8'), 0, set({ rpe: null, coach_rpe: '7.5' }), null))
      .toEqual({ text: '@7.5', tone: 'ok' })
  })

  it('rpe_range: boundary ± 1 is ok, beyond is off', () => {
    const r = row({ intensity: { mode: 'rpe_range', value: '7', high: '8' } })
    expect(actualIntensityChip(r, 0, set({ rpe: '9.0' }), null).tone).toBe('ok')
    expect(actualIntensityChip(r, 0, set({ rpe: '9.5' }), null).tone).toBe('off')
    expect(actualIntensityChip(r, 0, set({ rpe: '5.5' }), null).tone).toBe('off')
  })

  it('pct with an e1RM converts the actual weight and compares ± 5pp', () => {
    const r = row({
      intensity: { mode: 'pct', value: '70', high: '' },
      intensityMode: 'uniform',
      intensityBoxes: [{ val: '70', empty: false }, { val: '70', empty: false }, { val: '70', empty: false }],
    })
    // 145 / 200 = 72.5% → within 5pp of 70
    expect(actualIntensityChip(r, 0, set({ weight_kg: '145.00' }), 200)).toEqual({ text: '73%', tone: 'ok' })
    // 165 / 200 = 82.5% → off
    expect(actualIntensityChip(r, 0, set({ weight_kg: '165.00' }), 200)).toEqual({ text: '83%', tone: 'off' })
  })

  it('pct without an e1RM shows the actual rpe unjudged', () => {
    const r = row({ intensity: { mode: 'pct', value: '70', high: '' } })
    expect(actualIntensityChip(r, 0, set({ rpe: '8.0' }), null)).toEqual({ text: '@8', tone: 'na' })
  })
})

describe('formatActualWeight', () => {
  it('trims trailing zeros and joins reps', () => {
    expect(formatActualWeight(set({ weight_kg: '92.50', reps: 5 }))).toBe('92.5×5')
    expect(formatActualWeight(set({ weight_kg: '100.00', reps: 3 }))).toBe('100×3')
  })
})


describe('student-added actuals (010)', () => {
  it('splits by server prescription count and set_index, not log position', () => {
    const prescribed = set({ set_index: 3 })
    const extra = set({ set_index: 4 })
    expect(splitActualSets([extra, prescribed], 4)).toEqual({ prescribed: [prescribed], extra: [extra] })
    expect(splitActualSets([extra], 0)).toEqual({ prescribed: [], extra: [extra] })
  })
})


it('groups only linked adhoc logs by day and exercise, sorting sets and taking the latest re-log', () => {
  const added = (overrides: Partial<StudentSetLog>) => log({ adhoc: true, plan_exercise_id: null, plan_day_id: 'day-1', ...overrides })
  const grouped = groupStudentAddedByDay([
    added({ set_index: 1 }),
    added({ set_index: 0, weight_kg: '95', logged_at: '2026-08-10T12:00:00Z' }),
    added({ set_index: 0, weight_kg: '80' }),
    added({ exercise_id: 'curl', set_index: 0 }),
    added({ plan_day_id: 'day-2', weight_kg: '40' }),
    added({ plan_day_id: undefined }), added({ plan_day_id: null }),
    added({ plan_day_id: '' }), added({ adhoc: false }),
  ])
  expect([...grouped.keys()]).toEqual(['day-1', 'day-2'])
  expect(grouped.get('day-1')?.map((exercise) => exercise.exerciseId)).toEqual(['squat', 'curl'])
  expect(grouped.get('day-1')?.[0].sets.map((s) => [s.set_index, s.weight_kg])).toEqual([[0, '95'], [1, '90.00']])
  expect(grouped.get('day-2')?.[0].sets.map((s) => s.weight_kg)).toEqual(['40'])
  expect(groupStudentAddedByDay([log({}), added({ plan_day_id: undefined })]).size).toBe(0)
  expect(groupActualsByExercise([added({})]).size).toBe(0)
})

it('keeps actual RIR in history grouping and labels it without RPE conversion', () => {
  const actual = { ...log({ rpe: null }), actual_rir: 2 }
  const grouped = groupActualsByExercise([actual]).get('pe-1')![0]
  expect(actualIntensityChip(row(), 0, grouped, null)).toEqual({ text: 'RIR 2', tone: 'na' })
})
