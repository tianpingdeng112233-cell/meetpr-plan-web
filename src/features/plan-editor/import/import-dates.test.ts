import { describe, it, expect } from 'vitest'
import { excelSerialToISODate, importStartDate, buildWeeks, type ParsedWeek } from './index'
import { planDayDowLabel, relabelWeeksForStartDate, shiftISODate } from '../mapping'
import { ExerciseIndex } from '../exerciseIndex'
import { aiWeeksToParsed } from './aiWeeks'
import type { Week } from '../types'

const STUB = { resolve: () => null } as unknown as ExerciseIndex

function weekAt(serialBase: number): ParsedWeek {
  return aiWeeksToParsed([{ index: 0, start_date: excelSerialToISODate(serialBase), days: [{ weekday: 0, day_index: 1, rest: false, exercises: [{ name: 'Synthetic squat', sets: 1, reps: '5', intensity_kind: null, source_cells: [], intensity_values: [], weight_values: ['100'], note: '', family_guess: null, flags: [] }] }] }])[0]
}
function emptyWeekAt(serialBase: number): ParsedWeek {
  return aiWeeksToParsed([{ index: 0, start_date: excelSerialToISODate(serialBase), days: [] }])[0]
}

describe('import dates — keep the source plan dates (spec 002 option A)', () => {
  it('regroups six AI source weeks from the first prescribed Saturday without dropping content', () => {
    const source = ['2026-10-26', '2026-11-02', '2026-11-09', '2026-11-16', '2026-11-23', '2026-11-30'].map((start_date, index) => ({
      index, start_date,
      days: (index === 0 ? [5, 6] : [1, 2]).map((weekday, day) => ({
        weekday, day_index: day + 1, rest: false,
        exercises: [{ name: 'Synthetic squat', sets: 1, reps: '5', intensity_kind: null, source_cells: [], intensity_values: [], weight_values: [String(100 + index * 10 + day)], note: `source ${index}/${day}`, family_guess: null, flags: [] }],
      })),
    }))
    const built = buildWeeks(aiWeeksToParsed(source), new ExerciseIndex([]), '2099-01-01')

    expect(built.startDate).toBe('2026-10-31')
    expect(built.weeks).toHaveLength(5)
    expect(built).toMatchObject({ droppedSourceWeeks: 0 })
    expect(built.weeks[0].days.filter(day => !day.rest).map(day => day.dowLabel)).toEqual(['周六', '周日', '周二', '周三'])
    expect(built.weeks.flatMap(week => week.days.filter(day => !day.rest).map(day => day.dateLabel)))
      .toEqual(['10/31', '11/1', '11/3', '11/4', '11/10', '11/11', '11/17', '11/18', '11/24', '11/25', '12/1', '12/2'])
    expect(built.weeks.flatMap(week => week.days.flatMap(day => day.rows.map(row => [row.name, row.reps, row.boxes[0].val, row.note]))))
      .toEqual(source.flatMap(week => week.days.flatMap(day => day.exercises.map(exercise => [exercise.name, exercise.reps, exercise.weight_values[0], exercise.note]))))
    expect(built.weeks.every(week => week.days.length === 7)).toBe(true)
  })

  it('converts an Excel date serial to an ISO date', () => {
    expect(excelSerialToISODate(46020)).toBe('2025-12-29') // Synthetic week 1 Monday
  })

  it('keeps the review reminder for a leading empty week when starting at the first prescription', () => {
    const empty = { ...emptyWeekAt(46321), importDoubts: ['empty_week' as const] }
    const built = buildWeeks([empty, weekAt(46328)], new ExerciseIndex([]), '2099-01-01')
    expect(built.startDate).toBe('2026-11-02')
    expect(built.weeks).toHaveLength(1)
    expect(built.weeks[0].importDoubts).toEqual(['empty_week'])
    expect(built.weeks[0].days[0].dateLabel).toBe('11/2')
    expect(built.weeks[0].days[0].rows).toHaveLength(1)
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
    // Selection UI has already chosen the latest 12 of 27 synthetic weeks.
    const weeks = Array.from({ length: 27 }, (_, i) => weekAt(46020 + i * 7))
    const { weeks: built } = buildWeeks(weeks.slice(-12), STUB, '2099-01-01')
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

    const { weeks: built, startDate } = buildWeeks(weeks.slice(-12), STUB, '2099-01-01')

    expect(startDate).toBe('2026-05-11')
    expect(built).toHaveLength(12)
    expect(built[6].range).toBe('6/22 – 6/28')
    expect(built[11].range).toBe('7/27 – 8/2')
    expect(built[11].days[0].rows).toHaveLength(1)
  })
})
