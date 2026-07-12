import { describe, expect, it } from 'vitest'
import { mmdd, nearestWeekdayISO, planEndISO, weekdayIndex } from './components/PlanCalendarControls'
import { resizeWeeksForCount } from './mapping'

describe('plan calendar controls', () => {
  it('chooses the nearest requested weekday from today, including today', () => {
    expect(nearestWeekdayISO(2, '2026-07-12')).toBe('2026-07-15') // Sunday -> Wednesday
    expect(nearestWeekdayISO(6, '2026-07-12')).toBe('2026-07-12')
  })

  it('derives weekday and preview end date from the selected date', () => {
    expect(weekdayIndex('2026-07-15')).toBe(2)
    expect(mmdd('2026-07-15')).toBe('07-15')
    expect(planEndISO('2026-07-15', 3)).toBe('2026-08-04')
  })

  it('creates empty added weeks with Day 1 position labelled from start_date', () => {
    const weeks = resizeWeeksForCount([], 3, '2026-07-15')
    expect(weeks).toHaveLength(3)
    expect(weeks[0].days[0]).toMatchObject({ dow: 0, dowLabel: '周三', dateLabel: '7/15', rest: true })
    expect(weeks[2].days[6]).toMatchObject({ dow: 6, dowLabel: '周二', dateLabel: '8/4' })
  })
})
