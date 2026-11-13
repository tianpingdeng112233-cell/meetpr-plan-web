import { expect, it } from 'vitest'
import { blockWeeks } from './blockGridTestUtils'
import { buildBlockGrid, switchBlockDayType, fillBlockDays } from './blockGridModel'
import { isRestDay } from './types'

it('keeps all seven calendar positions and retained prescriptions while renumbering training days', () => {
  const weeks = blockWeeks([[0, 2, 4]])
  const before = structuredClone(weeks)
  const resting = switchBlockDayType(weeks, 1, 2, 'rest')
  expect(resting[0].days[2].rows).toEqual(before[0].days[2].rows)
  expect(isRestDay(resting[0].days[2])).toBe(true)
  const grid = buildBlockGrid(resting, '2026-10-19', [], [], true)
  expect(grid.columns.map(c => c.weekday)).toEqual([0, 1, 2, 3, 4, 5, 6])
  expect(grid.rows[0].cells.map(c => c.dayNumber)).toEqual([1, null, null, null, 2, null, null])
  expect(switchBlockDayType(resting, 1, 2, 'training')[0].days[2].rows).toEqual(before[0].days[2].rows)
  expect(weeks).toEqual(before)
})

it('fills retained rest content and refuses a type switch on a logged day', () => {
  let weeks = blockWeeks([[0], [0], [0]])
  weeks[2].days[0].rows[0].hasLogs = true
  weeks = switchBlockDayType(weeks, 1, 0, 'rest')
  const filled = fillBlockDays(weeks, { weekNumber: 1, dx: 0 }, 3, '2026-10-19', [], [], true)
  expect(filled[1].days[0].dayType).toBe('rest')
  expect(filled[1].days[0].rows[0].name).toBe(weeks[0].days[0].rows[0].name)
  expect(filled[2].days[0]).toEqual(weeks[2].days[0])
  expect(switchBlockDayType(filled, 3, 0, 'rest')).toBe(filled)
})

it('keeps seven fixed calendar columns when inserting outside an existing four-day pattern', () => {
  const weeks = switchBlockDayType(blockWeeks([[0, 2, 4, 5], [0, 2, 4, 5]]), 1, 1, 'training')
  const grid = buildBlockGrid(weeks, '2026-10-19', [0, 2, 4, 5], [], true)
  expect(grid.columns.map(column => column.weekday)).toEqual([0, 1, 2, 3, 4, 5, 6])
  expect(grid.rows[0].cells.filter(cell => cell.day).map(cell => cell.day!.dow)).toEqual([0, 1, 2, 4, 5])
})

it('refuses an insertion over retained rest content or its shifted storage address', async () => {
  const { insertBlockDay, blockInsertDates } = await import('./blockGridModel')
  const weeks = switchBlockDayType(blockWeeks([[0, 2]]), 1, 2, 'rest')
  expect(blockInsertDates(weeks[0], '2026-10-19', null, null)).not.toContain('2026-10-21')
  expect(insertBlockDay(weeks, 1, '2026-10-21', '2026-10-19')).toBe(weeks)
})
