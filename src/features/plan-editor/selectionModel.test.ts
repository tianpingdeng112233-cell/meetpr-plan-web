import { describe, expect, it } from 'vitest'
import { resolvePlanCell } from './selectionModel'
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
  const rowsByDay = [[row('a1', '深蹲'), row('a2', '卧推')], [row('b1', '硬拉')]]
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
  it('formats A1 · W31 and keeps row numbers continuous across week-local day columns', () => {
    const weeks = [week31()]
    expect(resolvePlanCell(weeks, {
      weekNumber: 31, dow: 0, rowId: 'a1', field: 'name',
    })?.reference).toBe('A1 · W31')
    expect(resolvePlanCell(weeks, {
      weekNumber: 31, dow: 1, rowId: 'b1', field: 'weight', setIndex: 0,
    })).toMatchObject({
      reference: 'B3 · W31',
      label: '周2 · 统一重量 · 硬拉',
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
