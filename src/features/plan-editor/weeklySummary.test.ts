import { describe, expect, it } from 'vitest'
import type { DayCol, ExerciseRow, Week } from './types'
import {
  compareWeekMetric, parseTargetReps, summarizeWeek, type CatalogClassification,
} from './weeklySummary'

function row(id: string, patch: Partial<ExerciseRow> = {}): ExerciseRow {
  return {
    id,
    serverRowId: null,
    serverSortOrder: null,
    hasLogs: false,
    conflictMessage: null,
    exerciseId: id,
    name: id,
    ku: true,
    custom: false,
    isMain: false,
    aux: false,
    reps: '5',
    mode: 'kg',
    boxes: [{ val: '100', empty: false }],
    note: '',
    ...patch,
  }
}

function week(rows: ExerciseRow[]): Week {
  const day: DayCol = { dow: 0, dowLabel: '周一', dateLabel: '7/1', rest: false, rows }
  return { num: 1, num2: '01', range: '', isCurrent: false, vol: 'FAKE', days: [day] }
}

describe('weekly summary', () => {
  it('parses the first reps integer and rejects targets without one', () => {
    expect(parseTargetReps('5')).toBe(5)
    expect(parseTargetReps('8+')).toBe(8)
    expect(parseTargetReps('6-8')).toBe(6)
    expect(parseTargetReps('—')).toBeNull()
    expect(parseTargetReps('')).toBeNull()
  })

  it('classifies bound main rows into SBD and keeps an unknown-family main row separate', () => {
    const catalog = new Map<string, CatalogClassification>([
      ['sq', { exerciseType: 'main_lift', mainLiftFamily: 'squat' }],
      ['bp', { exerciseType: 'main_lift_variation', mainLiftFamily: 'bench' }],
      ['dl', { exerciseType: 'main_lift_variation', mainLiftFamily: 'deadlift' }],
      ['unknown-main', { exerciseType: 'main_lift_variation', mainLiftFamily: null }],
      ['accessory', { exerciseType: 'accessory', mainLiftFamily: null }],
    ])
    const boxes = (count: number) => Array.from({ length: count }, () => ({ val: '', empty: true }))
    const summary = summarizeWeek(week([
      row('sq', { boxes: boxes(3) }),
      row('bp', { boxes: boxes(4) }),
      row('dl', { boxes: boxes(5) }),
      row('unknown-main', { boxes: boxes(2) }),
      row('accessory', { isMain: true, boxes: boxes(6) }),
      row('unbound-main', { exerciseId: null, isMain: true, boxes: boxes(1) }),
    ]), (id) => catalog.get(id) ?? null)

    expect(summary).toMatchObject({
      squatSets: 3,
      benchSets: 4,
      deadliftSets: 5,
      otherMainSets: 3,
      auxiliarySets: 6,
      totalSets: 21,
    })
  })

  it('counts every set slot but only totals filled, parseable kg-mode sets', () => {
    const summary = summarizeWeek(week([
      row('kg', {
        reps: '6-8',
        boxes: [
          { val: '100', empty: false },
          { val: '', empty: true },
          { val: '102.5', empty: false },
        ],
      }),
      row('amrap', { reps: '8+', boxes: [{ val: '50', empty: false }] }),
      row('no-reps', { reps: '—', boxes: [{ val: '200', empty: false }] }),
      row('rpe', { mode: 'rpe', reps: '5', boxes: [{ val: '9', empty: false }] }),
      row('bodyweight', { mode: 'bodyweight', reps: '10', boxes: [{ val: '', empty: true }] }),
      row('invalid-weight', { reps: '5', boxes: [{ val: '重', empty: false }] }),
    ]), () => ({ exerciseType: 'accessory', mainLiftFamily: null }))

    expect(summary.totalSets).toBe(8)
    expect(summary.auxiliarySets).toBe(8)
    expect(summary.tonnage).toBe(6 * (100 + 102.5) + 8 * 50)
  })

  it('falls back to the row isMain flag when a bound id is missing from the catalog', () => {
    const missing = summarizeWeek(
      week([row('ghost-main', { isMain: true }), row('ghost-aux', { isMain: false })]),
      () => null,
    )
    expect(missing.otherMainSets).toBe(1)
    expect(missing.auxiliarySets).toBe(1)
    expect(missing.squatSets + missing.benchSets + missing.deadliftSets).toBe(0)
  })

  it('derives week-over-week arrows with a ±2% flat band and no zero division', () => {
    expect(compareWeekMetric(103, 100)).toMatchObject({ direction: 'up', percent: 3 })
    expect(compareWeekMetric(97, 100)).toMatchObject({ direction: 'down', percent: -3 })
    expect(compareWeekMetric(102, 100)).toMatchObject({ direction: 'flat', percent: 2 })
    expect(compareWeekMetric(98, 100)).toMatchObject({ direction: 'flat', percent: -2 })
    expect(compareWeekMetric(99, 100)).toMatchObject({ direction: 'flat', percent: -1 })
    expect(compareWeekMetric(20, 0)).toEqual({ direction: 'new', percent: null })
    expect(compareWeekMetric(0, 0)).toEqual({ direction: 'flat', percent: 0 })
  })
})
