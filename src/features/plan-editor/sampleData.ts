import type { Week, DayCol, ExerciseRow, SetBox, IntensityMode } from './types'

// Ported from the design bundle's buildWeeks() — xty 吕子豪 12-week sample.
// Used until the backend plan API is wired in.

const DOW = ['周一', '周二', '周三', '周四', '周五', '周六', '周日']

const r2 = (n: number) => Math.round(n / 2.5) * 2.5
const ramp = (s: number, inc: number, n: number) =>
  Array.from({ length: n }, (_, i) => s + inc * i)
const fill = (v: number, n: number) => Array<number>(n).fill(v)

function dlabel(w: number, d: number): string {
  const dt = new Date(2026, 5, 2 + (w - 1) * 7 + d)
  return `${dt.getMonth() + 1}/${dt.getDate()}`
}

interface RowOpt {
  reps?: number | string
  mode?: IntensityMode
  vals?: (number | null)[]
  note?: string
  aux?: boolean
  custom?: boolean
  ku?: boolean
  /** Explicit tier override; default treats structured rows as main lifts. */
  main?: boolean
}

let rid = 0
function mkRow(name: string, opt: RowOpt = {}): ExerciseRow {
  const aux = !!opt.aux
  const vals = opt.vals ?? []
  const valueBoxes: SetBox[] = vals.map((v) =>
    v === null ? { empty: true, val: '' } : { empty: false, val: String(v) },
  )
  const hasInt = valueBoxes.length > 0 && !aux
  const rpe = hasInt && opt.mode === 'rpe'
  const boxes = rpe ? valueBoxes.map(() => ({ empty: true, val: '' })) : valueBoxes
  return {
    id: `r${rid++}`,
    serverRowId: null,
    serverSortOrder: null,
    hasLogs: false,
    conflictMessage: null,
    exerciseId: null,
    name,
    ku: opt.ku !== false && !aux && !opt.custom,
    custom: !!opt.custom,
    isMain: opt.main ?? !aux,
    aux,
    reps: opt.reps != null ? String(opt.reps) : '—',
    mode: 'kg',
    ...(rpe ? {
      intensity: { mode: 'rpe' as const, value: valueBoxes[0]?.val ?? '', high: '' },
      intensityMode: new Set(valueBoxes.map((box) => box.empty ? '<empty>' : box.val)).size > 1
        ? 'per_set' as const
        : 'uniform' as const,
      intensityBoxes: valueBoxes,
      weightMode: 'uniform' as const,
    } : { intensity: null, weightMode: 'per_set' as const }),
    boxes,
    note: opt.note ?? '',
  }
}

export function buildWeeks(): Week[] {
  rid = 0
  const weeks: Week[] = []
  for (let w = 1; w <= 5; w++) {
    const sq = 80 + (w - 1) * 5
    const bp = 62.5 + (w - 1) * 2.5
    const dl = 105 + (w - 1) * 5
    const tempo = r2(sq * 0.8)
    const isCur = w === 3
    const dlCount = isCur ? 6 : 5
    const amrap: (number | null)[] = isCur ? [9, null] : [9, 9]

    const day = (dow: number, rows: ExerciseRow[] | null): DayCol => ({
      dow,
      dowLabel: DOW[dow],
      dateLabel: dlabel(w, dow),
      shiftedToDate: null,
      shiftBadge: null,
      rest: rows === null,
      rows: rows ?? [],
    })

    const days: DayCol[] = [
      day(0, [
        mkRow('低杆深蹲', { reps: 5, mode: 'kg', vals: ramp(sq, 5, 4) }),
        mkRow('节奏深蹲', { reps: 3, mode: 'kg', vals: fill(tempo, 3), note: '3秒离心' }),
        mkRow('卧推', { reps: 5, mode: 'kg', vals: ramp(bp, 2.5, 4) }),
        mkRow('无腿卧推', { reps: '8+', mode: 'rpe', vals: amrap, note: 'AMRAP', custom: isCur }),
      ]),
      day(1, [
        mkRow('传统硬拉', { reps: 3, mode: 'kg', vals: ramp(dl, 5, dlCount) }),
        mkRow('海豹划船', { reps: 12, mode: 'rpe', vals: [6, 7, 8, 8], main: false }),
        mkRow('安全杆深蹲', { reps: 8, mode: 'rpe', vals: [6, 7, 8, 9] }),
      ]),
      day(2, [
        mkRow('单腿罗马尼亚硬拉', { aux: true, note: '4×12' }),
        mkRow('保加利亚分腿蹲', { aux: true, note: '4×12' }),
        mkRow('腹肌塑形', { aux: true, custom: true, note: '3×15 塑形' }),
      ]),
      day(3, null),
      day(4, [
        mkRow('低杆深蹲', { reps: 5, mode: 'kg', vals: ramp(sq + 5, 5, 4) }),
        mkRow('节奏深蹲', { reps: 3, mode: 'kg', vals: fill(tempo + 2.5, 3), note: '3秒离心' }),
        mkRow('卧推', { reps: 5, mode: 'kg', vals: ramp(bp + 5, 2.5, 4) }),
      ]),
      day(5, [
        mkRow('传统硬拉', { reps: 5, mode: 'kg', vals: ramp(dl + 5, 5, 4) }),
        mkRow('海豹划船', { reps: 12, mode: 'rpe', vals: [6, 7, 8, 8], main: false }),
      ]),
      day(6, null),
    ]

    weeks.push({
      num: w,
      num2: String(w).padStart(2, '0'),
      range: `${dlabel(w, 0)} – ${dlabel(w, 6)}`,
      isCurrent: isCur,
      vol: `SQ ${sq} / BP ${bp} / DL ${dl} KG`,
      days,
    })
  }
  return weeks
}
