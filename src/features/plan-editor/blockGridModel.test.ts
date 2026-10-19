import { describe, expect, it } from 'vitest'
import { buildBlockGrid, fillBlockDays, pasteBlockRows, changeBlockWeekday, changeBlockDate } from './blockGridModel'
import { relabelWeeksForStartDate } from './mapping'
import type { ExerciseRow, Week } from './types'

const row = (id: string, main = true, locked = false): ExerciseRow => ({
  id, serverRowId: locked ? id : null, serverSortOrder: null, hasLogs: locked, conflictMessage: null,
  exerciseId: id, name: id, ku: true, custom: false, isMain: main, aux: false,
  reps: '3', mode: 'kg', boxes: [{ val: '120', empty: false }], note: '保留备注',
})
function fixture(patterns: number[][]): Week[] {
  return relabelWeeksForStartDate(patterns.map((dows, i) => ({
    num: i + 1, num2: String(i + 1).padStart(2, '0'), range: '', isCurrent: false, vol: '',
    days: Array.from({ length: 7 }, (_, dow) => ({ dow, dowLabel: '', dateLabel: '', rest: !dows.includes(dow),
      rows: dows.includes(dow) ? [row(`w${i + 1}-${dow}`)] : [] })),
  })), '2026-10-19')
}

describe('block grid projection', () => {
  it('aligns date-ordered Dx across irregular weeks, uses modal weekdays, and never mutates the plan', () => {
    const weeks = fixture([[0, 2, 4], [1, 4], [0, 2, 4]])
    const before = JSON.stringify(weeks)
    const grid = buildBlockGrid(weeks, '2026-10-19')
    expect(grid.columns.map(column => column.weekday)).toEqual([0, 2, 4])
    expect(grid.rows.map(week => week.cells.map(cell => cell.day?.dow ?? null))).toEqual([[0, 2, 4], [1, null, 4], [0, 2, 4]])
    expect(JSON.stringify(weeks)).toBe(before)
  })
})

describe('block copy and dates', () => {
  it('fills one Dx, creates missing days, skips beyond the block, and preserves logged rows', () => {
    const weeks = fixture([[0, 2], [0], [0, 2]])
    weeks[2].days[2].rows = [row('locked', true, true), row('replace')]
    const result = fillBlockDays(weeks, { weekNumber: 1, dx: 1 }, 6, '2026-10-19')
    expect(result[1].days[2].rows.map(r => r.name)).toEqual(['w1-2'])
    expect(result[2].days[2].rows.map(r => r.name)).toEqual(['locked', 'w1-2'])
    result[1].days[2].rows[0].boxes[0].val = '99'
    expect(result[0].days[2].rows[0].boxes[0].val).toBe('120')
    expect(result[2].days[2].rows[1].boxes[0].val).toBe('120')
    expect(result).toHaveLength(3)
    expect(weeks[1].days[2].rows).toEqual([])
  })
  it('appends duplicate bricks to their section tails without changing existing rows', () => {
    const weeks = fixture([[0]])
    weeks[0].days[0].rows = [row('main'), row('aux', false)]
    const result = pasteBlockRows(weeks, { weekNumber: 1, dx: 0 }, [row('main'), row('aux', false)], '2026-10-19')
    expect(result[0].days[0].rows.map(r => r.name)).toEqual(['main', 'main', 'aux', 'aux'])
    expect(new Set(result[0].days[0].rows.map(r => r.id)).size).toBe(4)
  })
  it('changes a column weekday only on unlogged days and single-date edits affect only that cell', () => {
    const weeks = fixture([[0, 2], [0, 2], [0, 2]])
    weeks[1].days[2].rows[0].hasLogs = true
    const moved = changeBlockWeekday(weeks, 1, 3, '2026-10-19')
    expect(moved.map(w => w.days.find(d => d.rows.some(r => r.name.endsWith('-2')))?.dow)).toEqual([3, 2, 3])
    expect(moved[0].days[3].dateLabel).toBe('10/22')
    const single = changeBlockDate(weeks, { weekNumber: 1, dx: 1 }, '2026-10-23', '2026-10-19')
    expect(single.map(w => w.days.find(d => d.rows.some(r => r.name.endsWith('-2')))?.dow)).toEqual([4, 2, 2])
    expect(changeBlockDate(weeks, { weekNumber: 1, dx: 1 }, '2026-11-23', '2026-10-19')).toBe(weeks)
  })
})

it('keeps server day identities at their calendar coordinates when moving a prescription', () => {
  const weeks = fixture([[0]])
  weeks[0].days[0].serverDayId = 'original-day'
  const moved = changeBlockDate(weeks, { weekNumber: 1, dx: 0 }, '2026-10-21', '2026-10-19')
  expect(moved[0].days[0].serverDayId).toBe('original-day')
  expect(moved[0].days[2].serverDayId).toBeFalsy()
  expect(moved[0].days[2].rows[0].name).toBe('w1-0')
})


it('keeps Friday in D3 and leaves D2 empty when W4 omits Wednesday', () => {
  const weeks = fixture([[0, 2, 4, 5], [0, 2, 4, 5], [0, 2, 4, 5], [0, 4, 5]])
  const grid = buildBlockGrid(weeks, '2026-10-19')
  expect(grid.columns.map(column => column.weekday)).toEqual([0, 2, 4, 5])
  expect(grid.rows[3].cells.map(cell => cell.day?.dow ?? null)).toEqual([0, null, 4, 5])
  const filled = fillBlockDays(weeks, { weekNumber: 1, dx: 1 }, 4, '2026-10-19')
  expect(filled[3].days[2].rows[0].name).toBe('w1-2')
  expect(filled[3].days[4].rows[0].name).toBe('w4-4')
})
