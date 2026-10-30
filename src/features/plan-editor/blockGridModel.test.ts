import { describe, expect, it } from 'vitest'
import { blockFillTargets, blockEditColumns, projectBlockGrid, insertBlockDay, blockInsertDates, deleteBlockDay, changeBlockPattern, buildBlockGrid, fillBlockDays, pasteBlockRows, changeBlockWeekday, changeBlockDate } from './blockGridModel'
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

it('changes the whole weekday pattern atomically without exchanging Dx prescriptions', () => {
  const weeks = fixture([[0, 2, 4], [0, 2, 4]])
  const result = changeBlockPattern(weeks, [0, 4, 6], '2026-10-19', [0, 2, 4])!
  expect(result[0].days[4].rows[0].id).toBe('w1-2')
  expect(result[0].days[6].rows[0].id).toBe('w1-4')
  expect(result[0].days[2].rows).toHaveLength(0)
  expect(weeks[0].days[2].rows[0].id).toBe('w1-2')
  weeks[1].days[4].rows[0].hasLogs = true
  expect(changeBlockPattern(weeks, [0, 4, 6], '2026-10-19', [0, 2, 4])).toBeNull()
  const safe = changeBlockPattern(weeks, [0, 1, 6], '2026-10-19', [0, 2, 4])!
  expect(safe[1].days[4].rows[0].id).toBe('w2-4')
  expect(safe[1].days[1].rows[0].id).toBe('w2-2')
})

it('preserves a single-day exception when another Dx weekday changes', () => {
  const weeks = fixture([[0, 3, 4]]) // D2 was moved from Wednesday to Thursday.
  const result = changeBlockPattern(weeks, [0, 2, 6], '2026-10-19', [0, 2, 4])!
  expect(result[0].days[3].rows[0]?.id).toBe('w1-3')
  expect(result[0].days[2].rows).toHaveLength(0)
  expect(result[0].days[6].rows[0]?.id).toBe('w1-4')
})


it('numbers each week by its dates rather than its weekday column, including shifted dates', () => {
  const weeks = fixture([[0, 2, 4, 5], [0, 4, 5]])
  weeks[0].days[0].shiftedToDate = '2026-10-22'
  const grid = buildBlockGrid(weeks, '2026-10-19', [0, 2, 4, 5])
  expect(grid.rows[1].cells.filter(cell => cell.day).map(cell => cell.dayNumber)).toEqual([1, 2, 3])
  expect(grid.rows[0].cells.find(cell => cell.day?.dow === 0)?.dayNumber).toBe(2)
})


it('inserts an empty day only in W2 and adds a weekday column without changing its pattern', () => {
  const weeks = fixture([[0,2,4,5], [0,2,4,5], [0,2,4,5], [0,2,4,5]])
  expect(blockInsertDates(weeks[1], '2026-10-19', 2, 4)).toEqual(['2026-10-29'])
  expect(blockInsertDates(weeks[1], '2026-10-19', 4, 5)).toEqual([])
  expect(blockInsertDates(weeks[1], '2026-10-19', null, 0)).toEqual([])
  expect(blockInsertDates(weeks[1], '2026-10-19', 5, null)).toEqual(['2026-11-01'])
  const next = insertBlockDay(weeks, 2, '2026-10-29', '2026-10-19')
  expect(next[0]).toBe(weeks[0]); expect(next[2]).toBe(weeks[2]); expect(next[3]).toBe(weeks[3])
  expect(next[1].days[3]).toMatchObject({ rest: false, rows: [], dateLabel: '10/29' })
  const grid = buildBlockGrid(next, '2026-10-19', [0,2,4,5], [3])
  expect(grid.columns.map(c => c.weekday)).toEqual([0,2,3,4,5])
  expect(grid.rows.map(r => r.cells[2].day?.dow ?? null)).toEqual([null,3,null,null])
  expect(grid.rows[1].cells.map(c => c.dayNumber)).toEqual([1,2,3,4,5])
  expect(grid.rows[0].cells.map(c => c.dayNumber)).toEqual([1,2,null,3,4])
  expect(insertBlockDay(next, 2, '2026-10-29', '2026-10-19')).toBe(next)
  expect(insertBlockDay(next, 2, '2026-11-02', '2026-10-19')).toBe(next)
})


it('deletes unlocked days, collapses empty extra columns, retains pattern slots, and rejects logged days', () => {
  let weeks = fixture([[0,2,4,5], [0,2,4,5]])
  weeks = insertBlockDay(weeks, 2, '2026-10-29', '2026-10-19')
  weeks[1].days[3].rows = [row('extra')]
  let next = deleteBlockDay(weeks, 2, 3)
  expect(next[1].days[3]).toMatchObject({ rest: true, rows: [] })
  expect(buildBlockGrid(next, '2026-10-19', [0,2,4,5], [3]).columns.map(c => c.weekday)).toEqual([0,2,4,5])
  next = deleteBlockDay(next, 2, 4)
  next = deleteBlockDay(next, 1, 4)
  const grid = buildBlockGrid(next, '2026-10-19', [0,2,4,5], [3])
  expect(grid.columns.map(c => c.weekday)).toEqual([0,2,4,5])
  expect(grid.rows.map(r => r.cells[2].day)).toEqual([null,null])
  expect(grid.rows[1].cells[3].dayNumber).toBe(3)
  weeks[0].days[0].rows[0].hasLogs = true
  expect(deleteBlockDay(weeks, 1, 0)).toBe(weeks)
  weeks[0].days[2].completedAt = '2026-10-21'
  expect(deleteBlockDay(weeks, 1, 2)).toBe(weeks)
})

it('fills an inserted column into blank weeks and edits its date without touching the adjacent pattern day', () => {
  let weeks = fixture([[0,2,4,5], [0,2,4,5], [0,2,4,5]])
  weeks = insertBlockDay(weeks, 1, '2026-10-22', '2026-10-19')
  weeks[0].days[3].rows = [row('extra')]
  const filled = fillBlockDays(weeks, {weekNumber: 1, dx: 2}, 3, '2026-10-19', [0,2,4,5], [3])
  expect(filled[1].days[3].rows.map(r => r.name)).toEqual(['extra'])
  expect(filled[1].days[4].rows.map(r => r.name)).toEqual(['w2-4'])
  const moved = changeBlockDate(filled, {weekNumber: 2, dx: 2}, '2026-11-01', '2026-10-19', [0,2,4,5], [3])
  expect(moved[1].days[6].rows.map(r => r.name)).toEqual(['extra'])
  expect(moved[1].days[4].rows.map(r => r.name)).toEqual(['w2-4'])
})

it('reserves an inserted empty date against single-day and whole-pattern edits', () => {
  const weeks = insertBlockDay(fixture([[0,2,4,5]]), 1, '2026-10-22', '2026-10-19')
  expect(changeBlockDate(weeks, { weekNumber: 1, dx: 1 }, '2026-10-22', '2026-10-19', [0,2,4,5], [3])).toBe(weeks)
  expect(changeBlockPattern(weeks, [0,3,4,5], '2026-10-19', [0,2,4,5], [3])).toBeNull()
  const changed = changeBlockPattern(weeks, [0,2,4,6], '2026-10-19', [0,2,4,5], [3])!
  expect(changed).not.toBeNull()
  expect(changed[0].days[3]).toMatchObject({ rest: false, rows: [] })
  expect(changed[0].days[6].rows[0].name).toBe('w1-5')
})

it('reconstructs the extra Thursday column on a fresh load without local view metadata', () => {
  const weeks = fixture([[0,2,4,5], [0,2,3,4,5], [0,2,4,5], [0,2,4,5]])
  const grid = buildBlockGrid(weeks, '2026-10-19')
  expect(grid.columns.map(c => c.weekday)).toEqual([0,2,3,4,5])
  expect(grid.columns[2].patternIndex).toBeNull()
  expect(grid.rows.map(r => r.cells[2].day?.dow ?? null)).toEqual([null,3,null,null])
})


it('projects weekday rows and week columns without changing single-week inserted slots', () => {
  const weeks = insertBlockDay(fixture([[0,2,4,5], [0,2,4,5], [0,2,4,5], [0,2,4,5]]), 2, '2026-10-29', '2026-10-19')
  const grid = buildBlockGrid(weeks, '2026-10-19', [0,2,4,5], [3])
  const view = projectBlockGrid(grid, 'by-day')
  expect(view.rowHeaders).toEqual(grid.columns)
  expect(view.columnHeaders).toEqual(weeks)
  expect(view.rows.map(cells => cells.map(cell => cell.day?.dow ?? null))).toEqual([
    [0,0,0,0], [2,2,2,2], [null,3,null,null], [4,4,4,4], [5,5,5,5],
  ])
  expect(view.rows[2][1]).toBe(grid.rows[1].cells[2])
  const original = projectBlockGrid(grid, 'by-week')
  expect(original.rowHeaders).toEqual(weeks)
  expect(original.columnHeaders).toEqual(grid.columns)
  expect(original.rows).toEqual(grid.rows.map(row => row.cells))
})


it.each([
  [0, 0, 3, 0], [1, 1, 4, 0], [2, 2, 5, 1], [3, 3, 6, 2],
])('opens by-day W%s to the right and adds only the required columns', (column, start, end, extra) => {
  expect(blockEditColumns('by-day', column, 4)).toEqual({ start, end, extra })
})
it.each([[0,0], [1,1], [2,1], [3,1]])('keeps by-week column %s left borrowing unchanged', (column, start) => {
  expect(blockEditColumns('by-week', column, 4)).toEqual({ start, end: 4, extra: 0 })
})


it.each(['by-week', 'by-day'] as const)('uses the same cross-week fill addresses in %s', layout => {
  const grid = buildBlockGrid(fixture([[0,2], [0], [0,2], [0,2]]), '2026-10-19')
  const view = projectBlockGrid(grid, layout)
  const source = layout === 'by-day' ? view.rows[1][0] : view.rows[0][1]
  expect(blockFillTargets(grid, source, 3)).toEqual([{ weekNumber: 2, dx: 1 }, { weekNumber: 3, dx: 1 }])
  expect(blockFillTargets(grid, source, 99)).toHaveLength(3)
  expect(blockFillTargets(grid, source, 1)).toEqual([])
})

it('orders the reported October block columns and every week by calendar date', () => {
  const weeks = relabelWeeksForStartDate(fixture([[5, 6], [1, 2, 5, 6], [1, 2, 5, 6]]), '2026-10-26')
  const grid = buildBlockGrid(weeks, '2026-10-26', [5, 6, 1, 2])
  expect.soft(grid.columns.map(column => column.weekday)).toEqual([1, 2, 5, 6])
  expect.soft(grid.rows.map(week => week.cells.map(cell => cell.day?.dateLabel ?? null))).toEqual([
    [null, null, '10/31', '11/1'], ['11/3', '11/4', '11/7', '11/8'], ['11/10', '11/11', '11/14', '11/15'],
  ])
  expect.soft(grid.rows.map(week => week.cells.map(cell => cell.dayNumber))).toEqual([
    [null, null, 1, 2], [1, 2, 3, 4], [1, 2, 3, 4],
  ])
})

it('orders columns relative to a Friday start without changing offsets or pattern edit identities', () => {
  const weeks = relabelWeeksForStartDate(fixture([[0, 3, 6], [0, 3, 6]]), '2026-10-30')
  const previous = [3, 4, 0] // Thursday, Friday, Monday: saved slot order, not display order.
  const before = JSON.stringify(weeks)
  const grid = buildBlockGrid(weeks, '2026-10-30', previous)
  expect.soft(grid.columns.map(c => c.weekday)).toEqual([4, 0, 3])
  expect.soft(grid.rows[0].cells.map(c => c.day?.dateLabel)).toEqual(['10/30', '11/2', '11/5'])
  expect(JSON.stringify(weeks)).toBe(before)
  expect(previous).toEqual([3, 4, 0])
  // Editing the original Thursday slot must still move Thursday, not Friday.
  const changed = changeBlockPattern(weeks, [2, 4, 0], '2026-10-30', previous)!
  expect(changed[0].days[5].rows[0].id).toBe('w1-6')
  expect(changed[0].days[0].rows[0].id).toBe('w1-0')
  expect(changed[0].days[3].rows[0].id).toBe('w1-3')
})

it('merges extra weekdays into an out-of-order saved pattern without moving prescriptions', () => {
  const weeks = fixture([[1, 2, 5, 6], [1, 5, 6]])
  const before = JSON.stringify(weeks)
  const grid = buildBlockGrid(weeks, '2026-10-19', [5, 6, 1], [2])
  expect.soft(grid.columns.map(c => c.weekday)).toEqual([1, 2, 5, 6])
  expect.soft(grid.rows.map(w => w.cells.map(c => c.day?.dow ?? null))).toEqual([[1, 2, 5, 6], [1, null, 5, 6]])
  expect(JSON.stringify(weeks)).toBe(before)
})
