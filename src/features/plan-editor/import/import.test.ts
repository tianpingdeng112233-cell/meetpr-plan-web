import { describe, expect, it } from 'vitest'
import * as XLSX from 'xlsx'
import type { ExerciseResponse } from '../../../api/types'
import { ExerciseIndex } from '../exerciseIndex'
import type { Grid, ParsedWeek } from './index'
import {
  buildWeeks,
  detectDayOffset,
  parseDay,
  parseSetLine,
  readWorkbook,
  selectSheet,
  weekBlocks,
} from './index'

function grid(cells: Array<[number, number, string | number]>): Grid {
  const map = new Map<string, string>()
  const rows = new Set<number>()
  let maxRow = 0
  let maxCol = 0
  for (const [row, col, value] of cells) {
    const text = String(value).trim()
    if (!text) continue
    map.set(`${row}:${col}`, text)
    rows.add(row)
    maxRow = Math.max(maxRow, row)
    maxCol = Math.max(maxCol, col)
  }
  return {
    maxRow,
    maxCol,
    occupiedRows: [...rows].sort((a, b) => a - b),
    text: (row, col) => map.get(`${row}:${col}`) ?? '',
    numeric: (row, col) => {
      const n = Number(map.get(`${row}:${col}`))
      return Number.isFinite(n) ? n : null
    },
  }
}

function dayHeader(row: number, offset: number, firstSerial: number | string): Array<[number, number, string | number]> {
  return Array.from({ length: 7 }, (_, day) => [row, offset + day * 5, Number(firstSerial) + day])
}

function exercise(
  id: string,
  name: string,
  opts: Partial<ExerciseResponse> = {},
): ExerciseResponse {
  return {
    id,
    name,
    name_en: null,
    exercise_type: 'strength',
    main_lift_family: null,
    is_competition_lift: false,
    created_by_coach_id: null,
    created_at: '2026-01-01T00:00:00Z',
    ...opts,
  }
}

describe('readWorkbook', () => {
  it('reads SheetJS-written xlsx sheets into grids', () => {
    const wb = XLSX.utils.book_new()
    const ws = XLSX.utils.aoa_to_sheet([
      ['动作', '日期'],
      ['深蹲', 46020],
    ])
    XLSX.utils.book_append_sheet(wb, ws, '2026')

    const buf = XLSX.write(wb, { bookType: 'xlsx', type: 'array' }) as ArrayBuffer
    const sheets = readWorkbook(buf)

    expect(sheets).toHaveLength(1)
    expect(sheets[0].name).toBe('2026')
    expect(sheets[0].grid.text(2, 2)).toBe('46020')
    expect(sheets[0].grid.numeric(2, 2)).toBe(46020)
  })
})

describe('detectDayOffset', () => {
  it('chooses offset 2 when it has more date rows than offset 1', () => {
    const g = grid([
      ...dayHeader(1, 1, 46000),
      ...dayHeader(5, 2, 46010),
      ...dayHeader(10, 2, 46020),
    ])

    expect(detectDayOffset(g)).toBe(2)
  })

  it('accepts text date serials and does not treat small set numbers as dates', () => {
    const g = grid([
      [1, 1, '4'], [1, 6, '8'], [1, 11, '9'],
      [2, 2, '46020'], [2, 7, '46021'], [2, 12, '46022'],
    ])

    expect(detectDayOffset(g)).toBe(2)
  })

  it('defaults to offset 1 on an empty grid', () => {
    expect(detectDayOffset(grid([]))).toBe(1)
  })
})

describe('weekBlocks and selectSheet', () => {
  it('builds content rows between date headers', () => {
    const g = grid([
      ...dayHeader(1, 1, 46000),
      [2, 1, '深蹲'],
      [3, 20, '卧推'],
      ...dayHeader(5, 1, 46007),
      [6, 100, '表外说明'],
      [7, 6, '硬拉'],
    ])

    const blocks = weekBlocks(g, 1)

    expect(blocks).toHaveLength(2)
    expect(blocks[0].headerRow).toBe(1)
    expect(blocks[0].dateSerials.slice(0, 3)).toEqual([46000, 46001, 46002])
    expect(blocks[0].contentRows).toEqual([2, 3])
    expect(blocks[1].contentRows).toEqual([7])
  })

  it('selects the newest sheet with content and skips empty note sheets', () => {
    const notes = grid([...dayHeader(1, 1, '47000')])
    const oldPlan = grid([...dayHeader(1, 1, '45000'), [2, 1, '深蹲']])
    const newPlan = grid([...dayHeader(1, 1, '46020'), [2, 1, '卧推']])

    expect(selectSheet([
      { name: '注意事项', grid: notes },
      { name: '2025', grid: oldPlan },
      { name: '2026', grid: newPlan },
    ])).toBe(newPlan)
  })
})

describe('parseSetLine', () => {
  it('parses set and reps with broadcast kg values', () => {
    expect(parseSetLine('3*5', '100', '', '')).toMatchObject({
      reps: '5',
      mode: 'kg',
      values: ['100', '100', '100'],
      amrap: false,
      note: '',
    })
  })

  it('parses per-set kg values', () => {
    expect(parseSetLine('4*8', '110/115/120/120', '', '').values)
      .toEqual(['110', '115', '120', '120'])
  })

  it('parses compact RPE strings when an rpe marker is present', () => {
    expect(parseSetLine('4*12', '6788', 'rpe', '')).toMatchObject({
      reps: '12',
      mode: 'rpe',
      values: ['6', '7', '8', '8'],
    })
  })

  it('expands capped ramps into normalized string values', () => {
    expect(parseSetLine('4*5', '80→90 +5', '', '').values)
      .toEqual(['80', '85', '90', '90'])
  })

  it('only turns literal amrap into reps plus', () => {
    const amrap = parseSetLine('2*12 amrap', 'rpe9', '', '')
    const failure = parseSetLine('2*12 力竭', '9', 'rpe', '')

    expect(amrap.reps).toBe('12+')
    expect(amrap.amrap).toBe(true)
    expect(amrap.mode).toBe('rpe')
    expect(amrap.values).toEqual(['9', '9'])
    expect(failure.reps).toBe('12')
    expect(failure.amrap).toBe(false)
    expect(failure.note).toContain('力竭')
  })

  it('keeps failed, backoff, top-percent, tempo and unknown strings in row note', () => {
    const result = parseSetLine('3*3', '70%top', '长暂停2s', '降组')

    expect(result.values).toEqual([])
    expect(result.note).toContain('70%top')
    expect(result.note).toContain('长暂停2s')
    expect(result.note).toContain('降组')
  })
})

describe('parseDay', () => {
  it('recognizes rest days', () => {
    const g = grid([[2, 1, '休息']])

    expect(parseDay(g, [2], 0, 1)).toEqual({ dayOfWeek: 0, rest: true, exercises: [] })
  })

  it('splits multiline names and appends blank-name continuation rows', () => {
    const g = grid([
      [2, 1, '深蹲'],
      [2, 2, '2*5'],
      [2, 3, '100'],
      [3, 2, '2*5'],
      [3, 3, '105'],
      [4, 1, '卧推\n划船'],
      [4, 2, '3*8'],
      [4, 3, '80'],
    ])

    const parsed = parseDay(g, [2, 3, 4], 0, 1)

    expect(parsed.rest).toBe(false)
    expect(parsed.exercises).toHaveLength(3)
    expect(parsed.exercises[0]).toMatchObject({ rawName: '深蹲', reps: '5', values: ['100', '100', '105', '105'] })
    expect(parsed.exercises[1].rawName).toBe('卧推')
    expect(parsed.exercises[2].rawName).toBe('划船')
  })
})

describe('buildWeeks', () => {
  it('filters empty weeks, dates from the source sheet, keeps the content weeks and binds catalog hits', () => {
    const index = new ExerciseIndex([
      exercise('bench', '杠铃卧推', { is_competition_lift: true }),
      exercise('custom', '自定义动作', { created_by_coach_id: 'coach-1' }),
      exercise('lowbar', '低杠位深蹲', { main_lift_family: 'squat' }),
    ])
    const parsed: ParsedWeek[] = [
      { blockIndex: 0, dateSerials: [], days: [{ dayOfWeek: 0, rest: false, exercises: [] }] },
      {
        blockIndex: 1,
        dateSerials: [46020],
        days: [{
          dayOfWeek: 0,
          rest: false,
          exercises: [
            { rawName: '卧推', reps: '5', mode: 'kg', values: ['80'], note: '' },
            { rawName: '自定义动作', reps: '—', mode: 'kg', values: [], note: '4*12' },
            { rawName: '不存在', reps: '8', mode: 'rpe', values: ['7'], note: '' },
            { rawName: '低杆深蹲', reps: '3', mode: 'kg', values: ['120'], note: '' },
          ],
        }],
      },
      {
        blockIndex: 2,
        dateSerials: [46027],
        days: [{ dayOfWeek: 1, rest: false, exercises: [{ rawName: '卧推', reps: '3', mode: 'kg', values: ['90'], note: '' }] }],
      },
    ]

    const { weeks } = buildWeeks(parsed, index, '2026-06-01')

    expect(weeks).toHaveLength(2) // both content weeks kept (empty block filtered); no plan-size cap
    expect(weeks[0].num).toBe(1)
    expect(weeks[0].num2).toBe('01')
    expect(weeks[0].days[0].dateLabel).toBe('12/29') // dated from the sheet (serial 46020 = 2025-12-29), not the passed start
    expect(weeks[0].range).toBe('12/29 – 1/4')

    const [bench, custom, missing, lowbar] = weeks[0].days[0].rows
    expect(bench).toMatchObject({ exerciseId: 'bench', name: '杠铃卧推', ku: true, custom: false, isMain: true, aux: false })
    expect(custom).toMatchObject({ exerciseId: 'custom', ku: false, custom: true, isMain: false, aux: true })
    expect(missing).toMatchObject({ exerciseId: null, ku: false, custom: false, isMain: false, aux: false })
    expect(lowbar).toMatchObject({ exerciseId: 'lowbar', name: '低杠位深蹲', isMain: true })
  })

  it('does not resolve aliases whose canonical exercise is absent from the catalog', () => {
    const index = new ExerciseIndex([exercise('other', '杠铃卧推')])
    const { weeks } = buildWeeks([{
      blockIndex: 0,
      dateSerials: [],
      days: [{ dayOfWeek: 0, rest: false, exercises: [{ rawName: '低杆深蹲', reps: '5', mode: 'kg', values: ['100'], note: '' }] }],
    }], index, '2026-06-01')

    expect(weeks[0].days[0].rows[0]).toMatchObject({
      exerciseId: null,
      name: '低杆深蹲',
      ku: false,
      custom: false,
    })
  })
})
