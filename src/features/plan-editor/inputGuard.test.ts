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
    ['599.99', true],
    ['600', false],
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
    expect(isBoundNoSets(row({ boxes: [{ val: '600', empty: false }] }))).toBe(true)
    expect(isBoundNoSets(row({ mode: 'rpe', boxes: [{ val: '7.3', empty: false }] }))).toBe(true)
    expect(isBoundNoSets(row({ reps: '99' }))).toBe(true)
  })

  it('preserves hasLogs, aux, bodyweight-strength, unbound, and rest-day exemptions', () => {
    expect(isBoundNoSets(row({ hasLogs: true, reps: '99', boxes: [{ val: '600', empty: false }] }))).toBe(false)
    expect(isBoundNoSets(row({ aux: true, reps: '99', boxes: [] }))).toBe(false)
    expect(isBoundNoSets(row({ mode: 'bodyweight', boxes: [{ val: '', empty: true }] }))).toBe(false)
    expect(isBoundNoSets(row({ exerciseId: null, reps: '99' }))).toBe(false)

    const invalidRestRow = row({ reps: '99' })
    expect(findIssueRows([week({
      dow: 0, dowLabel: '周一', dateLabel: '', rest: true, rows: [invalidRestRow],
    })])).toEqual([])
  })
})
