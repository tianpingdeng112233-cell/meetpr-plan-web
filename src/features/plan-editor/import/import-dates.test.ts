import { describe, it, expect } from 'vitest'
import { excelSerialToISODate, importStartDate, buildWeeks, type ParsedWeek } from './index'
import type { ExerciseIndex } from '../exerciseIndex'

const STUB = { resolve: () => null } as unknown as ExerciseIndex

function weekAt(serialBase: number): ParsedWeek {
  return {
    blockIndex: 0,
    dateSerials: Array.from({ length: 7 }, (_, d) => serialBase + d),
    days: [
      {
        dayOfWeek: 0,
        rest: false,
        exercises: [{ rawName: '深蹲', reps: '5', mode: 'kg', values: ['100'], note: '' }],
      },
    ],
  }
}

describe('import dates — keep the source plan dates (spec 002 option A)', () => {
  it('converts an Excel date serial to an ISO date', () => {
    expect(excelSerialToISODate(46020)).toBe('2025-12-29') // 许可 2026 sheet, week 1 Monday
  })

  it('derives the plan start from the first content week Monday', () => {
    expect(importStartDate([weekAt(46020)])).toBe('2025-12-29')
  })

  it('buildWeeks dates the plan from the sheet, ignoring the passed start_date', () => {
    const weeks = buildWeeks([weekAt(46020)], STUB, 14, '2099-01-01')
    expect(weeks[0].range).toBe('12/29 – 1/4') // from the xlsx serial, not 2099
  })

  it('imports only the latest 12 weeks of a long continuous plan', () => {
    // 27 consecutive weeks (吕子豪 2026 sheet); David: keep the latest 12 only.
    const weeks = Array.from({ length: 27 }, (_, i) => weekAt(46020 + i * 7))
    const built = buildWeeks(weeks, STUB, 52, '2099-01-01')
    expect(built).toHaveLength(12)
    expect(built[0].num).toBe(1) // re-numbered from 1
    expect(built[0].days[0].dateLabel).toBe('4/13') // original week 16 = 2026-04-13
  })
})
