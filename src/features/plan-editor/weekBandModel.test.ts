import { describe, expect, it } from 'vitest'
import type { DayCol, ExerciseRow, Week } from './types'
import {
  closestWeekToViewportCenter,
  reorderRowsInWeek,
  trainingDayOrdinal,
} from './weekBandModel'

function row(id: string, exerciseId: string, isMain = true): ExerciseRow {
  return {
    id, serverRowId: null, serverSortOrder: null, hasLogs: false, conflictMessage: null,
    exerciseId, name: exerciseId, ku: true, custom: false, isMain, aux: !isMain,
    reps: '5', mode: 'kg', boxes: [], note: '',
  }
}
function week(num: number, rows: ExerciseRow[]): Week {
  const day: DayCol = { dow: 0, dowLabel: '周一', dateLabel: '1/1', rest: false, rows }
  return { num, num2: String(num).padStart(2, '0'), range: '', isCurrent: false, vol: '', days: [day] }
}

describe('week-band scroll spy', () => {
  it('uses the nearest centre and breaks a wide-viewport tie by lower index', () => {
    expect(closestWeekToViewportCenter(0, 1840, [
      { weekNumber: 1, index: 0, left: 0, width: 920 },
      { weekNumber: 2, index: 1, left: 920, width: 920 },
      { weekNumber: 3, index: 2, left: 1840, width: 920 },
    ])).toBe(1)
  })
})

describe('week-local row mutations', () => {
  it('reorders only the requested week and preserves current row objects', () => {
    const stale = [
      week(1, [row('a1', 'a'), row('b1', 'b')]),
      week(2, [row('a2', 'a'), row('c2', 'c'), row('b2', 'b')]),
    ]
    const fresh = stale.map((item) => ({
      ...item,
      days: item.days.map((day) => ({
        ...day,
        rows: day.rows.map((entry) => ({ ...entry, serverRowId: `srv-${entry.id}` })),
      })),
    }))

    const reordered = reorderRowsInWeek(fresh, () => 'main', 2, 0, 'a2', 'b2', 'after')!

    expect(reordered[0]).toBe(fresh[0])
    expect(reordered[0].days[0].rows.map((entry) => entry.exerciseId)).toEqual(['a', 'b'])
    expect(reordered[1].days[0].rows.map((entry) => entry.exerciseId)).toEqual(['c', 'b', 'a'])
    expect(reordered[1].days[0].rows.every((entry) => entry.serverRowId === `srv-${entry.id}`)).toBe(true)
  })

  it('locks only the target day and does not inherit a logged-row lock from another week', () => {
    const weeks = [
      week(1, [{ ...row('a1', 'a'), hasLogs: true }, row('b1', 'b')]),
      week(2, [row('a2', 'a'), row('b2', 'b')]),
    ]

    expect(reorderRowsInWeek(weeks, () => 'main', 1, 0, 'a1', 'b1', 'after')).toBeNull()
    expect(reorderRowsInWeek(weeks, () => 'main', 2, 0, 'a2', 'b2', 'after')?.[1]
      .days[0].rows.map((entry) => entry.exerciseId)).toEqual(['b', 'a'])
  })

  it('rejects cross-section reorder attempts', () => {
    const weeks = [week(1, [row('main', 'a'), row('aux', 'b', false)])]
    expect(reorderRowsInWeek(
      weeks,
      (entry) => entry.isMain ? 'main' : 'aux',
      1,
      0,
      'main',
      'aux',
      'after',
    )).toBeNull()
  })
})

describe('training-day display ordinal', () => {
  it('skips rest positions without changing their stored dow values', () => {
    const sparse = week(1, [])
    sparse.days = Array.from({ length: 7 }, (_, dow): DayCol => ({
      dow,
      dowLabel: `周${dow + 1}`,
      dateLabel: `1/${dow + 1}`,
      rest: dow !== 1 && dow !== 5,
      rows: dow === 1 ? [row('a', 'squat')] : dow === 5 ? [row('b', 'bench')] : [],
    }))

    expect(trainingDayOrdinal(sparse, 0)).toBeNull()
    expect(trainingDayOrdinal(sparse, 1)).toBe(1)
    expect(trainingDayOrdinal(sparse, 4)).toBeNull()
    expect(trainingDayOrdinal(sparse, 5)).toBe(2)
    expect(sparse.days.map((day) => day.dow)).toEqual([0, 1, 2, 3, 4, 5, 6])
  })
})
