import { describe, it, expect } from 'vitest'
import { excelSerialToISODate, importStartDate, buildWeeks, type ParsedWeek } from './index'
import { planDayDowLabel, relabelWeeksForStartDate, shiftISODate } from '../mapping'
import { ExerciseIndex } from '../exerciseIndex'
import type { Week } from '../types'

const STUB = new ExerciseIndex([])

// Source calendar: Monday 10/26, a Saturday start, then Tue/Wed/Sat/Sun.
// The final source row ends on Wednesday, completing the preceding training week.
function saturdayStartSheet(count: number): ParsedWeek[] {
  return Array.from({ length: count }, (_, w) => ({
    blockIndex: w,
    dateSerials: Array.from({ length: 7 }, (_, d) => 46321 + w * 7 + d),
    days: Array.from({ length: 7 }, (_, dayOfWeek) => ({
      dayOfWeek,
      rest: false,
      exercises: (w === 0 ? [5, 6] : w === count - 1 ? [1, 2] : [1, 2, 5, 6]).includes(dayOfWeek)
        ? ['深蹲', '卧推'].map((rawName, i) => ({
          rawName, setCount: 2, reps: '5', mode: 'kg' as const,
          values: [String(80 + w * 10 + i), String(85 + w * 10 + i)],
          note: `source-${w}-${dayOfWeek}-${i}`,
        }))
        : [],
    })),
  }))
}

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
  it.each([
    [3, 2, ['10/31', '11/1', '11/3', '11/4', '11/7', '11/8', '11/10', '11/11']],
    [4, 3, ['10/31', '11/1', '11/3', '11/4', '11/7', '11/8', '11/10', '11/11', '11/14', '11/15', '11/17', '11/18']],
    [5, 4, ['10/31', '11/1', '11/3', '11/4', '11/7', '11/8', '11/10', '11/11', '11/14', '11/15', '11/17', '11/18', '11/21', '11/22', '11/24', '11/25']],
    [6, 5, ['10/31', '11/1', '11/3', '11/4', '11/7', '11/8', '11/10', '11/11', '11/14', '11/15', '11/17', '11/18', '11/21', '11/22', '11/24', '11/25', '11/28', '11/29', '12/1', '12/2']],
  ] as const)('regroups %i source rows into %i training weeks without moving prescriptions', (count, expectedWeeks, dates) => {
    const source = saturdayStartSheet(count)
    const { weeks, startDate, droppedSourceWeeks } = buildWeeks(source, STUB, '2099-01-01')

    expect(startDate).toBe('2026-10-31')
    expect(droppedSourceWeeks).toBe(0)
    expect(importStartDate(source)).toBe('2026-10-31')
    expect(weeks).toHaveLength(expectedWeeks)
    expect(weeks[0].days.filter(day => !day.rest).map(day => day.dowLabel))
      .toEqual(['周六', '周日', '周二', '周三'])
    expect(weeks[0].days.map(day => day.dateLabel))
      .toEqual(['10/31', '11/1', '11/2', '11/3', '11/4', '11/5', '11/6'])
    const trainingDays = weeks.flatMap(week => week.days.filter(day => !day.rest))
    expect(trainingDays.map(day => day.dateLabel)).toEqual(dates)
    expect(trainingDays.flatMap(day => day.rows.map(row => ({
      name: row.name, reps: row.reps, mode: row.mode,
      values: row.boxes.map(box => box.val), note: row.note,
    })))).toEqual(source.flatMap(week => week.days.flatMap(day => day.exercises.map(exercise => ({
      name: exercise.rawName, reps: exercise.reps, mode: exercise.mode,
      values: exercise.values, note: exercise.note,
    })))))
  })

  it('converts an Excel date serial to an ISO date', () => {
    expect(excelSerialToISODate(46020)).toBe('2025-12-29') // 许可 2026 sheet, week 1 Monday
  })

  it('keeps a Monday start when the first prescription is already on Monday', () => {
    expect(importStartDate([weekAt(46020)])).toBe('2025-12-29')
    const { weeks, startDate } = buildWeeks([weekAt(46020), weekAt(46027)], STUB, '2099-01-01')
    expect(startDate).toBe('2025-12-29')
    expect(weeks).toHaveLength(2)
    expect(weeks.map(week => week.days[0].dateLabel)).toEqual(['12/29', '1/5'])
    expect(weeks.map(week => week.days[0].rows[0].boxes[0].val)).toEqual(['100', '100'])
  })

  it('keeps the manually chosen start and original slots when dates are absent', () => {
    const source = saturdayStartSheet(3).map(week => ({ ...week, dateSerials: [] }))
    const { weeks, startDate } = buildWeeks(source, STUB, '2026-10-26')
    expect(importStartDate(source)).toBeNull()
    expect(startDate).toBe('2026-10-26')
    expect(weeks).toHaveLength(3)
    expect(weeks[0].days.slice(0, 5).every(day => day.rest && day.rows.length === 0)).toBe(true)
    expect(weeks[0].days.filter(day => !day.rest).map(day => day.dateLabel)).toEqual(['10/31', '11/1'])
    expect(weeks[1].days.filter(day => !day.rest).map(day => day.dowLabel)).toEqual(['周二', '周三', '周六', '周日'])
  })

  it('retains the final training week when the last source row also has weekend prescriptions', () => {
    const source = saturdayStartSheet(6)
    source[5].days = source[4].days
    const { weeks } = buildWeeks(source, STUB, '2099-01-01')
    expect(weeks).toHaveLength(6)
    expect(weeks[5].days.filter(day => !day.rest).map(day => day.dateLabel)).toEqual(['12/5', '12/6'])
  })

  it('skips leading empty weeks and explicit rest days but keeps later empty calendar days', () => {
    const source = saturdayStartSheet(3)
    source[0].days[0].rest = true
    const { weeks, startDate } = buildWeeks([emptyWeekAt(46314), ...source], STUB, '2099-01-01')
    expect(startDate).toBe('2026-10-31')
    expect(weeks).toHaveLength(2)
    expect(weeks[0].days[0].rows).toHaveLength(2)
    expect(weeks[0].days[2]).toMatchObject({ dateLabel: '11/2', rest: true, rows: [] })
    expect(weeks[1].days[6]).toMatchObject({ dateLabel: '11/13', rest: true, rows: [] })
  })

  it('infers a missing first-training-day header from the other dated columns', () => {
    const source = saturdayStartSheet(3)
    source[0].dateSerials[5] = null
    const { weeks, startDate } = buildWeeks(source, STUB, '2099-01-01')
    expect(startDate).toBe('2026-10-31')
    expect(weeks[0].days.filter(day => !day.rest).map(day => day.dateLabel))
      .toEqual(['10/31', '11/1', '11/3', '11/4'])
  })

  it('keeps every prescription when Excel date headers contain different times of day', () => {
    const source = saturdayStartSheet(3)
    source[0].dateSerials[5] = 46326.5 // 10/31 noon, followed by 11/1 midnight
    const { weeks, startDate } = buildWeeks(source, STUB, '2099-01-01')
    expect(startDate).toBe('2026-10-31')
    expect(weeks.flatMap(week => week.days.filter(day => !day.rest).map(day => day.dateLabel)))
      .toEqual(['10/31', '11/1', '11/3', '11/4', '11/7', '11/8', '11/10', '11/11'])
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
    const { weeks: built, droppedSourceWeeks } = buildWeeks(weeks, STUB, '2099-01-01')
    expect(built).toHaveLength(12)
    expect(droppedSourceWeeks).toBe(15)
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
