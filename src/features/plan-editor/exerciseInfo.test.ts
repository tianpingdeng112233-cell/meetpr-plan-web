import { describe, expect, it } from 'vitest'
import { buildExerciseInfoTokens, estimateE1rmAtRpe8, roundToHalfKg } from './exerciseInfo'
import type { ExerciseRow, Week } from './types'

function row(id: string, patch: Partial<ExerciseRow> = {}): ExerciseRow {
  return {
    id,
    serverRowId: null,
    serverSortOrder: null,
    hasLogs: false,
    conflictMessage: null,
    exerciseId: 'squat',
    name: '竞技深蹲',
    ku: true,
    custom: false,
    isMain: true,
    aux: false,
    reps: '3',
    mode: 'kg',
    boxes: Array.from({ length: 5 }, () => ({ val: '150', empty: false })),
    note: '',
    ...patch,
  }
}

function week(num: number, rows: ExerciseRow[]): Week {
  return {
    num,
    num2: String(num).padStart(2, '0'),
    range: '',
    isCurrent: num === 31,
    vol: '',
    days: [{ dow: 0, dowLabel: '周一', dateLabel: '', rest: rows.length === 0, rows }],
  }
}

describe('e1RM and exercise information tokens', () => {
  it('uses Epley with reps +2 for @RPE8 and rounds to 0.5 kg', () => {
    expect(estimateE1rmAtRpe8(150, 3)).toBe(175)
    expect(estimateE1rmAtRpe8(100, 2)).toBe(113.5)
    expect(roundToHalfKg(113.24)).toBe(113)
    expect(roundToHalfKg(113.25)).toBe(113.5)
  })

  it('rejects invalid boundaries instead of producing misleading tokens', () => {
    expect(estimateE1rmAtRpe8(0, 5)).toBeNull()
    expect(estimateE1rmAtRpe8(-100, 5)).toBeNull()
    expect(estimateE1rmAtRpe8(100, -1)).toBeNull()
    expect(estimateE1rmAtRpe8(Number.NaN, 5)).toBeNull()
    expect(roundToHalfKg(Number.POSITIVE_INFINITY)).toBeNull()
  })

  it('derives competition-lift 1RM/e1RM/last-week tokens without requests', () => {
    const weeks = [week(30, [row('previous')]), week(31, [row('current')])]
    expect(buildExerciseInfoTokens({
      weeks,
      weekIndex: 1,
      row: weeks[1].days[0].rows[0],
      metadata: { mainLiftFamily: 'squat', isCompetitionLift: true },
      onboarding: { deadlift_style: null, squat_1rm_kg: '175' },
    })).toEqual([
      '1RM 175',
      'e1RM 175',
      '上周 5 × 3 @150',
    ])
  })

  it('renders no empty shells when prior performance and 1RM are both missing', () => {
    const current = row('current')
    expect(buildExerciseInfoTokens({
      weeks: [week(31, [current])],
      weekIndex: 0,
      row: current,
      metadata: { mainLiftFamily: 'squat', isCompetitionLift: true },
      onboarding: null,
      statsOverview: null,
    })).toEqual([])
  })

  it('falls back to the cached exercise-stats 1RM when onboarding omitted it', () => {
    const weeks = [week(30, [row('previous')]), week(31, [row('current')])]
    const tokens = buildExerciseInfoTokens({
      weeks,
      weekIndex: 1,
      row: weeks[1].days[0].rows[0],
      metadata: { mainLiftFamily: 'squat', isCompetitionLift: true },
      onboarding: { deadlift_style: null, squat_1rm_kg: null },
      statsOverview: {
        exercises: [],
        one_rm: { squat: '172.5', bench: null, deadlift: null },
        last_trained_at: null,
        recent_4w: { trained_days: 0, total_planned_days: 0, completion_rate: 0 },
      },
    })
    expect(tokens[0]).toBe('1RM 172.5')
  })
})
