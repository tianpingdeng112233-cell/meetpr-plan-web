import { describe, expect, it } from 'vitest'
import {
  absoluteDayIndex,
  applyPlanDayPlacements,
  planDayFromAbsoluteIndex,
  planDayKey,
  planDaysInRange,
  placePlanDayOffsets,
  resolvePlanCell,
} from './selectionModel'
import type { DayCol, ExerciseRow, Week } from './types'

function row(id: string, name: string): ExerciseRow {
  return {
    id,
    serverRowId: null,
    serverSortOrder: null,
    hasLogs: false,
    conflictMessage: null,
    exerciseId: id,
    name,
    ku: true,
    custom: false,
    isMain: true,

    aux: false,
    reps: '3',
    mode: 'kg',
    boxes: [{ val: '150', empty: false }],
    note: '',
  }
}

function week31(): Week {
  const rowsByDay = [[row('a1', '深蹲'), row('a2', '卧推')], [], [row('b1', '硬拉')]]
  const days: DayCol[] = Array.from({ length: 7 }, (_, dow) => ({
    dow,
    dowLabel: `周${dow + 1}`,
    dateLabel: `7/${27 + dow}`,
    rest: rowsByDay[dow] == null,
    rows: rowsByDay[dow] ?? [],
  }))
  return { num: 31, num2: '31', range: '7/27–8/2', isCurrent: true, vol: '', days }
}

describe('plan cell selection model', () => {
  it('keeps cell references positional while labels use continuous training-day ordinals', () => {
    const weeks = [week31()]
    expect(resolvePlanCell(weeks, {
      weekNumber: 31, dow: 0, rowId: 'a1', field: 'name',
    })?.reference).toBe('A1 · W31')
    expect(resolvePlanCell(weeks, {
      weekNumber: 31, dow: 2, rowId: 'b1', field: 'weight', setIndex: 0,
    })).toMatchObject({
      reference: 'C3 · W31',
      label: 'D2 · 周3 · 固定重量 · 硬拉',
      value: '150 kg',
    })
  })

  it('returns null for deleted rows and out-of-range set cells', () => {
    const weeks = [week31()]
    expect(resolvePlanCell(weeks, {
      weekNumber: 31, dow: 0, rowId: 'missing', field: 'name',
    })).toBeNull()
    expect(resolvePlanCell(weeks, {
      weekNumber: 31, dow: 0, rowId: 'a1', field: 'weight', setIndex: 4,
    })).toBeNull()
  })

  it('reports BW for bodyweight intensity cells backed by empty boxes', () => {
    const weeks = [week31()]
    const bodyweight = weeks[0].days[0].rows[0]
    bodyweight.mode = 'bodyweight'
    bodyweight.boxes = [{ val: '', empty: true }]

    expect(resolvePlanCell(weeks, {
      weekNumber: 31, dow: 0, rowId: 'a1', field: 'intensity', setIndex: 0,
    })?.value).toBe('BW')
  })
})

describe('plan day absolute order', () => {
  it('uses Monday as zero and crosses week boundaries without a gap', () => {
    expect(absoluteDayIndex({ wnum: 1, dow: 0 })).toBe(0)
    expect(absoluteDayIndex({ wnum: 1, dow: 6 })).toBe(6)
    expect(absoluteDayIndex({ wnum: 2, dow: 0 })).toBe(7)
    expect(planDayFromAbsoluteIndex(9)).toEqual({ wnum: 2, dow: 2 })
  })

  it('keeps a negative absolute index outside W1 instead of wrapping into it', () => {
    expect(planDayFromAbsoluteIndex(-1)).toEqual({ wnum: 0, dow: 6 })
    expect(planDayKey(planDayFromAbsoluteIndex(-8))).toBe('-1:6')
  })

  it('skips negative targets and preserves state when every placement is out of range', () => {
    const plan = week31()
    plan.num = 1
    plan.num2 = '01'

    expect(placePlanDayOffsets([{ offset: -1 }, { offset: 0 }], { wnum: 1, dow: 0 }, [plan]))
      .toMatchObject({
        inRange: [{ source: { offset: 0 }, target: { wnum: 1, dow: 0 } }],
        skipped: 1,
      })
    const allOut = placePlanDayOffsets([{ offset: -8 }, { offset: -1 }], { wnum: 1, dow: 0 }, [plan])
    expect(allOut).toEqual({ inRange: [], skipped: 2 })
    const weeks = [plan]
    expect(applyPlanDayPlacements(weeks, allOut.inRange, () => {
      throw new Error('an out-of-range placement must not update a day')
    })).toBe(weeks)
  })

  it('returns an inclusive Shift range across weeks in absolute order', () => {
    const first = week31()
    first.num = 1
    first.num2 = '01'
    const second = week31()
    second.num = 2
    second.num2 = '02'

    expect(planDaysInRange([first, second], { wnum: 1, dow: 5 }, { wnum: 2, dow: 1 })
      .map(planDayKey)).toEqual(['1:5', '1:6', '2:0', '2:1'])
  })
})
