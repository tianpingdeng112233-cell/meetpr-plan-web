import { describe, expect, it } from 'vitest'
import { countUnit } from './plural'

// row.reps/rawValue reach countUnit as strings — "1" must still pick the
// singular, and non-numeric ranges like "8-10" must stay plural.
describe('countUnit', () => {
  it('selects singular for numeric 1 and string "1"', () => {
    expect(countUnit(1, 'set', 'sets')).toBe('1 set')
    expect(countUnit('1', 'rep', 'reps')).toBe('1 rep')
  })
  it('selects plural for other counts and ranges', () => {
    expect(countUnit(2, 'set', 'sets')).toBe('2 sets')
    expect(countUnit('0', 'set', 'sets')).toBe('0 sets')
    expect(countUnit('8-10', 'rep', 'reps')).toBe('8-10 reps')
  })
})
