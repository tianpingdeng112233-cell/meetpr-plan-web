import { describe, expect, it } from 'vitest'
import type { DayCol, ExerciseRow, Week } from './types'
import {
  alignWeeksByExercise,
  anchoredWeekday,
  closestWeekToViewportCenter,
  orderWeeksByWeekBand,
  reorderWeekBandSkeleton,
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

describe('week-band alignment', () => {
  it('uses first-appearing week order and maps missing exercises to empty slots', () => {
    const aligned = alignWeeksByExercise([
      week(1, [row('a1', 'squat'), row('b1', 'bench')]),
      week(2, [row('b2', 'bench'), row('c2', 'deadlift')]),
    ], (item) => item.isMain ? 'main' : 'aux')[0]
    expect(aligned.main.map((slot) => slot.exerciseId)).toEqual(['squat', 'bench', 'deadlift'])
    expect(aligned.rowsByWeek.get(1)?.get('deadlift:0')).toBeUndefined()
    expect(aligned.rowsByWeek.get(2)?.get('bench:0')?.id).toBe('b2')
  })

  it('keeps repeated exercises and unbound rows losslessly addressable', () => {
    const aligned = alignWeeksByExercise([
      week(1, [row('a', 'squat'), row('b', 'squat'), { ...row('free', ''), exerciseId: null }]),
    ], () => 'main')[0]
    expect(aligned.main.map((slot) => slot.key)).toEqual(['squat:0', 'squat:1', 'row:free:0'])
  })

  it('maps a storage order mismatch onto slot order for every interaction', () => {
    const weeks = [
      week(1, [row('a1', 'a'), row('b1', 'b'), row('c1', 'c')]),
      week(2, [row('a2', 'a'), row('c2', 'c'), row('b2', 'b')]),
    ]
    const alignments = alignWeeksByExercise(weeks, () => 'main')
    const interactionWeeks = orderWeeksByWeekBand(weeks, alignments)
    const visualRows = interactionWeeks[1].days[0].rows

    expect(weeks[1].days[0].rows.map((item) => item.id)).toEqual(['a2', 'c2', 'b2'])
    expect(visualRows.map((item) => item.id)).toEqual(['a2', 'b2', 'c2'])
  })

  it('moves the shared skeleton and rewrites every concrete week in slot order', () => {
    const weeks = [
      week(1, [row('a1', 'a'), row('b1', 'b'), row('c1', 'c')]),
      week(2, [row('a2', 'a'), row('c2', 'c'), row('b2', 'b')]),
    ]
    const reordered = reorderWeekBandSkeleton(weeks, () => 'main', 0, 2, 'a2', 'b2', 'after')!

    expect(reordered.map((item) => item.days[0].rows.map((entry) => entry.exerciseId))).toEqual([
      ['b', 'a', 'c'],
      ['b', 'a', 'c'],
    ])
    expect(alignWeeksByExercise(reordered, () => 'main')[0].main.map((slot) => slot.exerciseId))
      .toEqual(['b', 'a', 'c'])
  })

  it('moves a week-unique slot without writing a row into another week', () => {
    const weeks = [
      week(1, [row('a1', 'a'), row('c1', 'c')]),
      week(2, [row('b2', 'b'), row('c2', 'c')]),
    ]
    const alignment = alignWeeksByExercise(weeks, () => 'main')[0]
    expect(alignment.main.map((slot) => slot.exerciseId)).toEqual(['a', 'b', 'c'])

    const reordered = reorderWeekBandSkeleton(weeks, () => 'main', 0, 2, 'b2', 'c2', 'after')!
    expect(reordered[0].days[0]).toBe(weeks[0].days[0])
    expect(reordered[0].days[0].rows.map((item) => item.exerciseId)).toEqual(['a', 'c'])
    expect(reordered[1].days[0].rows.map((item) => item.exerciseId)).toEqual(['c', 'b'])
    expect(alignWeeksByExercise(reordered, () => 'main')[0].main.map((slot) => slot.exerciseId))
      .toEqual(['a', 'c', 'b'])
  })
})

describe('week-band scroll spy', () => {
  it('uses the nearest centre and breaks a wide-viewport tie by lower index', () => {
    expect(closestWeekToViewportCenter(0, 1840, [
      { weekNumber: 1, index: 0, left: 0, width: 920 },
      { weekNumber: 2, index: 1, left: 920, width: 920 },
      { weekNumber: 3, index: 2, left: 1840, width: 920 },
    ])).toBe(1)
  })
})

describe('D1 weekday anchor', () => {
  it('cycles past seven ordinal days and leaves unset anchors blank', () => {
    expect(anchoredWeekday(1, 1)).toBe('周一')
    expect(anchoredWeekday(7, 2)).toBe('周一')
    expect(anchoredWeekday(3, 10)).toBe('周五')
    expect(anchoredWeekday(null, 1)).toBeNull()
  })
  it('derives alignment and the logged-row lock from the weeks it is given (no stale snapshot)', () => {
    const stale = [
      week(1, [row('a1', 'a'), row('b1', 'b')]),
      week(2, [row('a2', 'a'), row('b2', 'b')]),
    ]
    // Simulate an autosave landing between drag-start and mouseup: same ids,
    // new row objects carrying fresh server fields.
    const fresh = stale.map((wk) => ({
      ...wk,
      days: wk.days.map((day) => ({
        ...day,
        rows: day.rows.map((item) => ({ ...item, serverRowId: `srv-${item.id}`, serverSortOrder: 9 })),
      })),
    }))
    const reordered = reorderWeekBandSkeleton(fresh, () => 'main', 0, 2, 'a2', 'b2', 'after')!
    const flat = reordered.flatMap((wk) => wk.days[0].rows)
    expect(flat.every((item) => item.serverRowId === `srv-${item.id}`)).toBe(true)
    expect(flat.every((item) => item.serverSortOrder === 9)).toBe(true)
  })

  it('refuses to reorder when any aligned week carries a logged row', () => {
    const locked = [
      week(1, [row('a1', 'a'), row('b1', 'b')]),
      week(2, [{ ...row('a2', 'a'), hasLogs: true }, row('b2', 'b')]),
    ]
    expect(reorderWeekBandSkeleton(locked, () => 'main', 0, 1, 'a1', 'b1', 'after')).toBeNull()
  })
  it('aligns unbound rows by trimmed display name across weeks (imported/sample plans)', () => {
    const unbound = (id: string, name: string): ExerciseRow => ({ ...row(id, ''), exerciseId: null, name })
    const aligned = alignWeeksByExercise([
      week(1, [unbound('w1a', '低杆深蹲'), unbound('w1b', '卧推')]),
      week(2, [unbound('w2a', ' 低杆深蹲 '), unbound('w2b', '卧推'), unbound('w2c', '')]),
    ], () => 'main')[0]
    expect(aligned.main.map((slot) => slot.key)).toEqual(['name:低杆深蹲:0', 'name:卧推:0', 'row:w2c:0'])
    expect(aligned.rowsByWeek.get(1)?.get('name:低杆深蹲:0')?.id).toBe('w1a')
    expect(aligned.rowsByWeek.get(2)?.get('name:低杆深蹲:0')?.id).toBe('w2a')
  })
})


