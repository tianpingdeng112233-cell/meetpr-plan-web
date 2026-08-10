import { describe, it, expect } from 'vitest'
import { excelSerialToISODate, importStartDate, buildWeeks, type ParsedWeek } from './index'
import { planDayDowLabel, relabelWeeksForStartDate, shiftISODate } from '../mapping'
import type { ExerciseIndex } from '../exerciseIndex'
import type { Week } from '../types'

const STUB = { resolve: () => null } as unknown as ExerciseIndex

function weekAt(serialBase: number): ParsedWeek {
  return {
    blockIndex: 0,
    dateSerials: Array.from({ length: 7 }, (_, d) => serialBase + d),
    days: [
      {
        dayOfWeek: 0,
        rest: false,
        exercises: [{ rawName: '深蹲', setCount: 1, reps: '5', mode: 'kg', values: ['100'], note: '' }],
      },
    ],
  }
}

function emptyWeekAt(serialBase: number): ParsedWeek {
  return {
    blockIndex: 0,
    dateSerials: Array.from({ length: 7 }, (_, d) => serialBase + d),
    days: Array.from({ length: 7 }, (_, dayOfWeek) => ({ dayOfWeek, rest: false, exercises: [] })),
  }
}

describe('import dates — keep the source plan dates (spec 002 option A)', () => {
  it('converts an Excel date serial to an ISO date', () => {
    expect(excelSerialToISODate(46020)).toBe('2025-12-29') // 许可 2026 sheet, week 1 Monday
  })

  it('derives the plan start from the first selected week-column anchor', () => {
    expect(importStartDate([weekAt(46020)])).toBe('2025-12-29')
  })

  it('buildWeeks dates the plan from the sheet, ignoring the passed start_date', () => {
    const { weeks, startDate } = buildWeeks([weekAt(46020)], STUB, '2099-01-01')
    expect(startDate).toBe('2025-12-29') // derived from the xlsx, returned for the save PATCH
    expect(weeks[0].range).toBe('12/29 – 1/4') // from the xlsx serial, not 2099
  })

  it('labels weekdays from the actual date when a plan starts mid-week', () => {
    expect(planDayDowLabel('2026-07-08', 1, 3)).toBe('周六')
    expect(planDayDowLabel('2026-07-08', 1, 4)).toBe('周日')
  })

  it('shifts the whole plan by relabeling dates while preserving day contents', () => {
    const weeks: Week[] = [{
      num: 1,
      num2: '01',
      range: '7/8 – 7/14',
      isCurrent: false,
      vol: '',
      days: Array.from({ length: 7 }, (_, dow) => ({
        dow,
        dowLabel: '',
        dateLabel: '',
        rest: dow !== 3,
        rows: dow === 3 ? [{
          id: 'r1',
          serverRowId: null,
          serverSortOrder: null,
          hasLogs: false,
          conflictMessage: null,
          exerciseId: 'squat',
          name: '低杠位深蹲',
          ku: true,
          custom: false,
          isMain: true,
          target: null,
          aux: false,
          reps: '5',
          mode: 'kg',
          boxes: [{ empty: false, val: '100' }],
          note: '',
        }] : [],
      })),
    }]

    const nextStart = shiftISODate('2026-07-08', 1)
    const shifted = relabelWeeksForStartDate(weeks, nextStart)

    expect(nextStart).toBe('2026-07-09')
    expect(shifted[0].range).toBe('7/9 – 7/15')
    expect(shifted[0].days[3].dowLabel).toBe('周日')
    expect(shifted[0].days[3].dateLabel).toBe('7/12')
    expect(shifted[0].days[3].rows[0].name).toBe('低杠位深蹲')
  })

  it('imports only the latest 12 weeks of a long continuous plan', () => {
    // 27 consecutive weeks (吕子豪 2026 sheet); David: keep the latest 12 only.
    const weeks = Array.from({ length: 27 }, (_, i) => weekAt(46020 + i * 7))
    const { weeks: built } = buildWeeks(weeks, STUB, '2099-01-01')
    expect(built).toHaveLength(12)
    expect(built[0].num).toBe(1) // re-numbered from 1
    expect(built[0].days[0].dateLabel).toBe('4/13') // original week 16 = 2026-04-13
  })

  it('keeps blank calendar weeks inside the latest import window so late rows keep their dates', () => {
    // Real coach sheets can contain an older block, several blank template weeks,
    // then a newer block ending in July. Those blank weeks must not be filtered out
    // or the July sessions get relabeled as June in the editor and after save.
    const may11 = 46153
    const weeks: ParsedWeek[] = [
      weekAt(may11),
      ...Array.from({ length: 5 }, (_, i) => emptyWeekAt(may11 + (i + 1) * 7)),
      ...Array.from({ length: 6 }, (_, i) => weekAt(may11 + (i + 6) * 7)),
    ]

    const { weeks: built, startDate } = buildWeeks(weeks, STUB, '2099-01-01')

    expect(startDate).toBe('2026-05-11')
    expect(built).toHaveLength(12)
    expect(built[6].range).toBe('6/22 – 6/28')
    expect(built[11].range).toBe('7/27 – 8/2')
    expect(built[11].days[0].rows).toHaveLength(1)
  })
})
