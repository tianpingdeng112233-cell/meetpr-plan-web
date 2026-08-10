import type { LoadModeWire } from '../../api/types'

export type IntensityMode = 'kg' | 'rpe' | 'bodyweight'

/** Backend spec 034 v2 prescription form. `null` means a weight-only row. */
export type LoadMode = LoadModeWire
export type WeightMode = 'uniform' | 'per_set'
export type IntensityValueMode = 'uniform' | 'per_set'

/** Row-level intensity. Single-value modes use `value`; ranges use both fields. */
export interface RowIntensity {
  mode: LoadMode
  value: string
  high: string
}

/** One per-set strength box: a value or an empty slot. */
export interface SetBox {
  val: string
  empty: boolean
}

/** One exercise line inside a day. */
export interface ExerciseRow {
  id: string
  /** Persisted plan_exercise identity. UI-only/new/imported rows have no server identity yet. */
  serverRowId: string | null
  /** Original backend slot, retained so a failed delete+recreate can converge on retry. */
  serverSortOrder: number | null
  /** Server-authoritative exercise history lock. Missing wire fields map to false. */
  hasLogs: boolean
  /** Scoped 409 feedback shown on the affected row. */
  conflictMessage: string | null
  exerciseId: string | null   // bound catalog exercise id; null = unbound (not yet saveable)
  name: string
  ku: boolean        // matched the exercise catalog
  custom: boolean    // coach-created custom exercise
  isMain: boolean    // backend is_main_lift flag (independent of aux)
  aux: boolean       // accessory with no structured intensity
  reps: string       // target reps, e.g. "5" / "8+" / "—"
  /**
   * Legacy source mode. New non-bodyweight rows use `kg`; an omitted `intensity`
   * on an `rpe` row is a lossless compatibility shape for old per-set RPE data.
   */
  mode: IntensityMode
  /** Row-level spec-034 intensity. Omitted only for legacy rows/mirrors. */
  intensity?: RowIntensity | null
  /** Presentation for pct/rpe/rir values; ranges and fixed_weight stay row-level. */
  intensityMode?: IntensityValueMode
  /** One independent intensity-value slot per set for pct/rpe/rir. */
  intensityBoxes?: SetBox[]
  /** Weight presentation. Omitted legacy rows infer it from their values. */
  weightMode?: WeightMode
  /** One slot per set. In the new model these are concrete target weights. */
  boxes: SetBox[]
  note: string
}

export interface DayCol {
  dow: number          // 0=Mon … 6=Sun
  dowLabel: string
  dateLabel: string
  /** Server shift snapshot, present only when it differs from the ordinal plan date. */
  shiftedToDate?: string | null
  /** Tooltip details for a genuinely shifted day. */
  shiftBadge?: { originalDate: string; days: number } | null
  rest: boolean
  rows: ExerciseRow[]
  /** Unsaved mixed-day deletions whose sort slots may be reused immediately by new rows. */
  releasedSortOrders?: number[]
}

export interface Week {
  num: number
  num2: string         // zero-padded, e.g. "03"
  range: string
  isCurrent: boolean
  vol: string
  days: DayCol[]
}

export type ColKey = 'name' | 'sets' | 'reps' | 'int' | 'weight' | 'note'
export type ColWidths = Record<ColKey, number>

export const COLS: ColKey[] = ['name', 'sets', 'reps', 'int', 'weight', 'note']
/** Focused week-band defaults: one prescription spans the available canvas. */
export const COL_DEFAULTS: ColWidths = { name: 156, sets: 40, reps: 48, int: 170, weight: 150, note: 80 }
export const COL_MIN: ColWidths = { name: 92, sets: 28, reps: 32, int: 112, weight: 82, note: 48 }

/** Derived: number of working sets shown in the 组 column. */
export function setCount(row: ExerciseRow): string {
  if (row.aux || row.boxes.length === 0) return '—'
  return String(row.boxes.length)
}

/** True when a row carries real content — an exercise name or any filled set —
 *  yet isn't bound to a catalog exercise. Save reconciliation drops such rows
 *  (and delete+recreate can erase them from a day that changed), so they are a
 *  data-loss risk the coach must be warned about. Empty placeholder rows return
 *  false: skipping them loses nothing. */
export function isContentfulUnbound(row: ExerciseRow): boolean {
  if (row.exerciseId) return false
  return row.name.trim() !== ''
    || row.boxes.some((b) => !b.empty && b.val !== '')
    || row.intensityBoxes?.some((b) => !b.empty && b.val !== '') === true
    || !!row.intensity
}

/** Compatibility export used by issue discovery and reconciliation. */
export { isBoundNoSets } from './inputGuard'
