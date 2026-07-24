import { describe, expect, it } from 'vitest'
import { dayMoveDisabledReason, moveDayInWeek } from './dayMove'
import type { DayCol, ExerciseRow, Week } from './types'

function row(id: string, hasLogs = false): ExerciseRow {
  return {
    id, serverRowId: id, serverSortOrder: 0, hasLogs, conflictMessage: null,
    exerciseId: id, name: id, ku: true, custom: false, isMain: false,
    aux: false, reps: '5', mode: 'kg', boxes: [{ val: '100', empty: false }], note: '',
  }
}

function day(dow: number, rows: ExerciseRow[], rest = rows.length === 0): DayCol {
  return {
    dow, dowLabel: `周${dow + 1}`, dateLabel: `7/${20 + dow}`, rest, rows,
    releasedSortOrders: rows.length ? [3] : undefined,
  }
}

function week(days: DayCol[]): Week {
  return { num: 1, num2: '01', range: '', isCurrent: false, vol: '', days }
}

describe('moveDayInWeek', () => {
  it('moves training content into a rest day while weekday/date anchors stay canonical', () => {
    const monday = day(0, [row('squat')], false)
    const wednesday = day(2, [], true)
    const original = week([monday, day(1, []), wednesday])

    const moved = moveDayInWeek(original, 0, 2)

    expect(moved).not.toBe(original)
    expect(moved.days[0]).toMatchObject({ dow: 0, dowLabel: '周1', dateLabel: '7/20', rest: true, rows: [] })
    expect(moved.days[2]).toMatchObject({ dow: 2, dowLabel: '周3', dateLabel: '7/22', rest: false })
    expect(moved.days[2].rows).toBe(monday.rows)
    expect(moved.days[1]).toBe(original.days[1])
    expect(moved.days[0].releasedSortOrders).toEqual([])
    expect(moved.days[2].releasedSortOrders).toEqual([])
  })

  it('treats a non-rest day with no rows as empty and moves directly', () => {
    const original = week([day(0, [row('bench')], false), day(1, [], false)])
    const moved = moveDayInWeek(original, 0, 1)

    expect(moved.days[0]).toMatchObject({ rest: true, rows: [] })
    expect(moved.days[1]).toMatchObject({ rest: false, rows: original.days[0].rows })
  })

  it('swaps two populated training days without changing day order or anchors', () => {
    const monday = day(0, [row('squat')], false)
    const friday = day(4, [row('deadlift')], false)
    const original = week([monday, friday])

    const moved = moveDayInWeek(original, 0, 4)

    expect(moved.days.map((item) => item.dow)).toEqual([0, 4])
    expect(moved.days[0]).toMatchObject({ dowLabel: '周1', dateLabel: '7/20', rows: friday.rows })
    expect(moved.days[1]).toMatchObject({ dowLabel: '周5', dateLabel: '7/24', rows: monday.rows })
  })

  it('clears the shift snapshot and restores ordinal labels on a moved shifted day', () => {
    const shiftedMonday: DayCol = {
      ...day(0, [row('squat')], false),
      dowLabel: '周三', dateLabel: '7/22',
      shiftedToDate: '2026-07-22',
      shiftBadge: { originalDate: '2026-07-20', days: 2 },
    }
    const original = week([shiftedMonday, day(1, []), day(2, [], true)])

    const moved = moveDayInWeek(original, 0, 2)

    expect(moved.days[0]).toMatchObject({
      dowLabel: '周一', dateLabel: '7/20', shiftedToDate: null, shiftBadge: null, rest: true,
    })
    // undo replays history snapshots, so the pre-move week must keep its shift state
    expect(original.days[0].shiftBadge).toEqual({ originalDate: '2026-07-20', days: 2 })
    expect(original.days[0].dateLabel).toBe('7/22')
  })

  it('clears the target-side snapshot when swapping onto a shifted day', () => {
    const monday = day(0, [row('squat')], false)
    const shiftedFriday: DayCol = {
      ...day(4, [row('deadlift')], false),
      dowLabel: '周六', dateLabel: '7/25',
      shiftedToDate: '2026-07-25',
      shiftBadge: { originalDate: '2026-07-24', days: 1 },
    }
    const original = week([monday, shiftedFriday])

    const moved = moveDayInWeek(original, 0, 4)

    expect(moved.days[1]).toMatchObject({
      dowLabel: '周五', dateLabel: '7/24', shiftedToDate: null, shiftBadge: null, rows: monday.rows,
    })
    expect(moved.days[0]).toMatchObject({ dowLabel: '周1', dateLabel: '7/20', rows: shiftedFriday.rows })
  })

  it('is a no-op for the same/missing weekday and for either logged day', () => {
    const logged = day(0, [row('logged', true)], false)
    const editable = day(1, [row('editable')], false)
    const original = week([logged, editable])

    expect(moveDayInWeek(original, 0, 0)).toBe(original)
    expect(moveDayInWeek(original, 0, 1)).toBe(original)
    expect(moveDayInWeek(original, 1, 0)).toBe(original)
    expect(moveDayInWeek(original, 1, 6)).toBe(original)
    const empty = week([day(0, []), day(1, [], false)])
    expect(moveDayInWeek(empty, 0, 1)).toBe(empty)
  })
})

describe('dayMoveDisabledReason', () => {
  it('uses the draft-calendar status lock before row history locks', () => {
    expect(dayMoveDisabledReason(day(0, [row('logged', true)], false), true)).toBe('已完成/已停用的计划不可移动训练日')
  })

  it('blocks a day containing any logged row and allows an editable day', () => {
    expect(dayMoveDisabledReason(day(0, [row('editable'), row('logged', true)], false), false))
      .toBe('该日含学员已打卡动作，不可移动或交换')
    expect(dayMoveDisabledReason(day(0, [row('editable')], false), false)).toBeNull()
  })
})
