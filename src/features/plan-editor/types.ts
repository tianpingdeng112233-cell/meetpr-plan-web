export type IntensityMode = 'kg' | 'rpe'

/** One per-set strength box: a value or an empty slot. */
export interface SetBox {
  val: string
  empty: boolean
}

/** One exercise line inside a day. */
export interface ExerciseRow {
  id: string
  exerciseId: string | null   // bound catalog exercise id; null = unbound (not yet saveable)
  name: string
  ku: boolean        // matched the exercise catalog
  custom: boolean    // coach-created custom exercise
  isMain: boolean    // backend is_main_lift flag (independent of aux)
  aux: boolean       // accessory with no structured intensity
  reps: string       // target reps, e.g. "5" / "8+" / "—"
  mode: IntensityMode
  boxes: SetBox[]     // per-set strength
  note: string
}

export interface DayCol {
  dow: number          // 0=Mon … 6=Sun
  dowLabel: string
  dateLabel: string
  rest: boolean
  rows: ExerciseRow[]
}

export interface Week {
  num: number
  num2: string         // zero-padded, e.g. "03"
  range: string
  isCurrent: boolean
  vol: string
  days: DayCol[]
}

export type ColKey = 'name' | 'sets' | 'reps' | 'int' | 'note'
export type ColWidths = Record<ColKey, number>

export const COLS: ColKey[] = ['name', 'sets', 'reps', 'int', 'note']
export const COL_DEFAULTS: ColWidths = { name: 92, sets: 26, reps: 26, int: 110, note: 36 }
export const COL_MIN: ColWidths = { name: 60, sets: 22, reps: 22, int: 62, note: 28 }

/** Derived: number of working sets shown in the 组 column. */
export function setCount(row: ExerciseRow): string {
  if (row.aux || row.boxes.length === 0) return '—'
  return String(row.boxes.length)
}
