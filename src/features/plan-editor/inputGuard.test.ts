import { describe, expect, it } from 'vitest'
import { findIssueRows } from './PlanEditor'
import {
  filterRepsInput,
  filterStrengthInput,
  getBoundRowInputIssue,
  INPUT_GUARD_REASONS,
  isValidReps,
  isValidStrengthValue,
} from './inputGuard'
import { isBoundNoSets, type DayCol, type ExerciseRow, type Week } from './types'

function row(partial: Partial<ExerciseRow> = {}): ExerciseRow {
  return {
    id: 'row', serverRowId: null, serverSortOrder: null, hasLogs: false, conflictMessage: null,
    exerciseId: 'exercise', name: '深蹲', ku: true, custom: false, isMain: false,
    aux: false, reps: '5', mode: 'kg', boxes: [{ val: '100', empty: false }], note: '',
    ...partial,
  }
}

function week(day: DayCol): Week {
  return { num: 1, num2: '01', range: '', isCurrent: true, vol: '', days: [day] }
}

describe('plan editor input character guards', () => {
  it('filters typed or pasted strength text to digits and one decimal point', () => {
    expect(filterStrengthInput('8你好.5kg')).toBe('8.5')
    expect(filterStrengthInput('1.2.3')).toBe('1.23')
    expect(filterStrengthInput('- 599.99 公斤')).toBe('599.99')
  })

  it('filters typed or pasted reps text to the supported range and plus notation', () => {
    expect(filterRepsInput('8 次 - 10次')).toBe('8-10')
    expect(filterRepsInput('8你好+')).toBe('8+')
    expect(filterRepsInput('8 到 10 / 至 12')).toBe('8到10至12')
  })
})

describe('plan editor input value guards', () => {
  it.each([
    ['0', false],
    ['0.01', true],
    ['999.99', true],
    ['1000', false],
    ['-1', false],
  ])('validates KG boundary %s', (value, valid) => {
    expect(isValidStrengthValue(value, 'kg')).toBe(valid)
  })

  it.each([
    ['7', true],
    ['7.5', true],
    ['7.3', false],
    ['10', true],
    ['10.5', false],
    ['0.5', false],
  ])('validates RPE boundary and half-step %s', (value, valid) => {
    expect(isValidStrengthValue(value, 'rpe')).toBe(valid)
  })

  it.each([
    ['0', false],
    ['1', true],
    ['50', true],
    ['99', false],
    ['8-10', true],
    ['8+', true],
  ])('validates reps domain %s', (value, valid) => {
    expect(isValidReps(value)).toBe(valid)
  })

  it('reports centralized reasons for invalid cells', () => {
    const issue = getBoundRowInputIssue(row({ reps: '99', mode: 'rpe', boxes: [{ val: '7.3', empty: false }] }))
    expect(issue).toMatchObject({
      hasIncomplete: false,
      invalidReps: true,
      invalidStrengthIndexes: [0],
      reasons: [INPUT_GUARD_REASONS.reps, INPUT_GUARD_REASONS.rpe],
    })
  })
})

describe('isBoundNoSets shared predicate regressions and exemptions', () => {
  it('keeps existing complete formats valid and incomplete prescriptions invalid', () => {
    expect(isBoundNoSets(row())).toBe(false)
    expect(isBoundNoSets(row({ reps: '8-10' }))).toBe(false)
    expect(isBoundNoSets(row({ reps: '8+' }))).toBe(false)
    expect(isBoundNoSets(row({ boxes: [{ val: '', empty: true }] }))).toBe(true)
    expect(isBoundNoSets(row({ reps: '—' }))).toBe(true)
  })

  it('tightens invalid filled values through the same predicate', () => {
    expect(isBoundNoSets(row({ boxes: [{ val: '0', empty: false }] }))).toBe(true)
    expect(isBoundNoSets(row({ boxes: [{ val: '1000', empty: false }] }))).toBe(true)
    expect(isBoundNoSets(row({ mode: 'rpe', boxes: [{ val: '7.3', empty: false }] }))).toBe(true)
    expect(isBoundNoSets(row({ reps: '99' }))).toBe(true)
  })

  it('preserves row-level exemptions and does not let a stale rest flag hide populated-day issues', () => {
    expect(isBoundNoSets(row({ hasLogs: true, reps: '99', boxes: [{ val: '1000', empty: false }] }))).toBe(false)
    expect(isBoundNoSets(row({ aux: true, reps: '99', boxes: [] }))).toBe(false)
    expect(isBoundNoSets(row({ mode: 'bodyweight', boxes: [{ val: '', empty: true }] }))).toBe(false)
    expect(isBoundNoSets(row({ exerciseId: null, reps: '99' }))).toBe(false)

    const invalidRestRow = row({ reps: '99' })
    expect(findIssueRows([week({
      dow: 0, dowLabel: '周一', dateLabel: '', rest: true, rows: [invalidRestRow],
    })])).toEqual([{ rowId: invalidRestRow.id, kind: 'noSets' }])
  })
})

describe('spec 034 dual intensity and weight guard', () => {
  it.each([
    ['pct', '72.5', ''],
    ['rpe', '8.5', ''],
    ['rir', '2', ''],
    ['weight_range', '165', '175'],
    ['rpe_range', '7', '8.5'],
  ] as const)('accepts a valid row-level %s with no concrete weight', (mode, value, high) => {
    expect(getBoundRowInputIssue(row({
      mode: 'kg',
      intensity: { mode, value, high },
      weightMode: 'uniform',
      boxes: [{ val: '', empty: true }, { val: '', empty: true }],
    }))).toBeNull()
  })

  it('accepts weight-only rows and requires every set without a completing intensity', () => {
    expect(getBoundRowInputIssue(row({
      intensity: null,
      boxes: [{ val: '170', empty: false }, { val: '172.5', empty: false }],
    }))).toBeNull()
    expect(getBoundRowInputIssue(row({
      intensity: null,
      boxes: [{ val: '170', empty: false }, { val: '', empty: true }],
    }))?.hasIncomplete).toBe(true)
  })

  it('completes and validates single-value intensity independently for each set', () => {
    expect(getBoundRowInputIssue(row({
      intensity: { mode: 'rpe', value: '8', high: '' },
      intensityMode: 'per_set',
      intensityBoxes: [{ val: '8', empty: false }, { val: '', empty: true }, { val: '7.5', empty: false }],
      boxes: [{ val: '', empty: true }, { val: '170', empty: false }, { val: '', empty: true }],
    }))).toBeNull()

    expect(getBoundRowInputIssue(row({
      intensity: { mode: 'rpe', value: '8', high: '' },
      intensityMode: 'per_set',
      intensityBoxes: [{ val: '8', empty: false }, { val: '', empty: true }],
      boxes: [{ val: '', empty: true }, { val: '', empty: true }],
    }))?.hasIncomplete).toBe(true)

    expect(getBoundRowInputIssue(row({
      intensity: { mode: 'rpe', value: '7.3', high: '' },
      intensityMode: 'per_set',
      intensityBoxes: [{ val: '7.3', empty: false }, { val: '8', empty: false }],
      boxes: [{ val: '', empty: true }, { val: '', empty: true }],
    }))?.invalidIntensityIndexes).toEqual([0])
  })

  it('enforces fixed-weight and weight-range matrix rules before API writes', () => {
    const fixed = getBoundRowInputIssue(row({
      intensity: { mode: 'fixed_weight', value: '', high: '' },
      boxes: [{ val: '', empty: true }],
    }))
    expect(fixed?.reasons).toContain(INPUT_GUARD_REASONS.fixedWeight)

    expect(getBoundRowInputIssue(row({
      intensity: { mode: 'fixed_weight', value: '', high: '' },
      boxes: [{ val: '170', empty: false }],
    }))).toBeNull()

    const conflict = getBoundRowInputIssue(row({
      intensity: { mode: 'weight_range', value: '165', high: '175' },
      boxes: [{ val: '170', empty: false }],
    }))
    expect(conflict?.reasons).toContain(INPUT_GUARD_REASONS.weightRangeConflict)
  })

  it.each([
    [{ mode: 'pct', value: '72.3', high: '' }, INPUT_GUARD_REASONS.pct],
    [{ mode: 'rir', value: '2.5', high: '' }, INPUT_GUARD_REASONS.rir],
    [{ mode: 'rpe_range', value: '8', high: '8' }, INPUT_GUARD_REASONS.rpeRange],
    [{ mode: 'weight_range', value: '175', high: '165' }, INPUT_GUARD_REASONS.weightRange],
  ] as const)('rejects invalid row-level values %#', (intensity, reason) => {
    expect(getBoundRowInputIssue(row({
      intensity: { ...intensity },
      boxes: [{ val: '', empty: true }],
    }))?.reasons).toContain(reason)
  })
})
