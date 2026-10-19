import { expect, it } from 'vitest'
import { orderedWeekdays, defaultFirstDate } from './blockPlanSettings'
import { planEndISO } from '../plan-editor/components/PlanCalendarControls'

it('orders Dx cyclically from the chosen D1 and finds the next matching first date', () => {
  expect(orderedWeekdays([1, 3, 4, 6], 6)).toEqual([6, 1, 3, 4])
  expect(defaultFirstDate(0, '2026-10-19')).toBe('2026-10-19')
  expect(defaultFirstDate(6, '2026-10-19')).toBe('2026-10-25')
  expect(planEndISO('2026-10-25', 4)).toBe('2026-11-21')
})
