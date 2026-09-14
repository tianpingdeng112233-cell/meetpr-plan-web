import type { IntensityModeWire, LoadModeWire, PctAnchorWire, SetType } from '../../api/types'

export type IntensityMode = 'kg' | 'rpe' | 'bodyweight'

/** Backend spec 034 v2 prescription form. `null` means a weight-only row. */
export type LoadMode = LoadModeWire
export type PctAnchor = PctAnchorWire
export type WeightMode = 'uniform' | 'per_set'
export type DisplayWeightMode = 'fixed_weight' | 'per_set' | 'weight_range' | 'bodyweight'
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

/** Lossless server-set provenance for fields the row grid cannot display. */
export interface OpaqueSetSpec {
  set_number: number
  target_reps: number
  target_reps_max: number | null
  intensity_mode?: IntensityModeWire
  target_value?: string
  load_mode?: LoadModeWire | null
  target_pct?: string | null
  pct_anchor?: PctAnchorWire | null
  target_rpe?: string | null
  rir_target?: string | number | null
  rpe_low?: string | null
  rpe_high?: string | null
  weight_low?: string | null
  weight_high?: string | null
  target_weight?: string | null
  set_type: SetType
  rest_seconds: number | null
  coach_note: string | null
}

/** Strip response identity fields while retaining every writable set field. */
export function snapshotOpaqueSets(sets: readonly OpaqueSetSpec[]): OpaqueSetSpec[] {
  return [...sets].sort((a, b) => a.set_number - b.set_number).map((set) => ({
    set_number: set.set_number,
    target_reps: set.target_reps,
    target_reps_max: set.target_reps_max,
    intensity_mode: set.intensity_mode,
    target_value: set.target_value,
    load_mode: set.load_mode,
    target_pct: set.target_pct,
    pct_anchor: set.pct_anchor,
    target_rpe: set.target_rpe,
    rir_target: set.rir_target,
    rpe_low: set.rpe_low,
    rpe_high: set.rpe_high,
    weight_low: set.weight_low,
    weight_high: set.weight_high,
    target_weight: set.target_weight,
    set_type: set.set_type,
    rest_seconds: set.rest_seconds,
    coach_note: set.coach_note,
  }))
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
  /** English display name only; canonical binding and write paths always use `name`. */
  nameEn?: string | null
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
  /**
   * Read provenance for old `load_mode=null + intensity_mode=weight` sets.
   * Their kg values stay in `boxes`; the weight selector presents them as fixed
   * weight until an explicit edit materializes the new wire shape.
   */
  legacyWeightSource?: boolean
  /** Row-level spec-034 intensity. Omitted only for legacy rows/mirrors. */
  intensity?: RowIntensity | null
  /** Percentage reference. Missing on legacy rows means the default 1RM anchor. */
  pctAnchor?: PctAnchor
  /** Presentation for pct/rpe/rir values; wire-only ranges stay row-level. */
  intensityMode?: IntensityValueMode
  /** One independent intensity-value slot per set for pct/rpe/rir. */
  intensityBoxes?: SetBox[]
  /** Weight presentation. Omitted legacy rows infer it from their values. */
  weightMode?: WeightMode
  /** One slot per set. In the new model these are concrete target weights. */
  boxes: SetBox[]
  /** Original per-set wire data, retained so unsupported fields round-trip losslessly. */
  opaqueSets?: OpaqueSetSpec[]
  /** Grid-owned set fields at the time `opaqueSets` were captured. */
  opaqueSetBaseline?: string
  note: string
}

/** Stable comparison of the set fields the grid can actually edit. */
export function rowSetGridSignature(row: Pick<
  ExerciseRow,
  'reps' | 'mode' | 'legacyWeightSource' | 'intensity' | 'pctAnchor'
  | 'intensityMode' | 'intensityBoxes' | 'weightMode' | 'boxes'
>): string {
  return JSON.stringify({
    reps: row.reps,
    mode: row.mode,
    legacyWeightSource: row.legacyWeightSource ?? false,
    intensity: row.intensity ?? null,
    pctAnchor: row.pctAnchor ?? null,
    intensityMode: row.intensityMode ?? null,
    intensityBoxes: row.intensityBoxes ?? null,
    weightMode: row.weightMode ?? null,
    boxes: row.boxes,
  })
}

/** Whether the retained server provenance contains settings hidden by the grid. */
export function hasOpaqueSetSettings(row: ExerciseRow): boolean {
  const sets = row.opaqueSets
  if (!sets?.length) return false
  const first = sets[0]
  const lastIndex = sets.length - 1
  return sets.some((set, index) => (
    set.target_reps !== first.target_reps
    || set.target_reps_max !== first.target_reps_max
    || set.rest_seconds != null
    || (row.mode !== 'bodyweight' && set.coach_note != null)
    || set.set_type !== (row.reps.includes('+') && index === lastIndex ? 'amrap' : 'working')
  ))
}

export interface DayCol {
  dow: number          // 0=Mon … 6=Sun
  dowLabel: string
  dateLabel: string
  /** Persisted plan-day identity. Null/absent calendar columns are not training days. */
  serverDayId?: string | null
  /** Backend-authoritative completion marker used by plan-shift eligibility. */
  completedAt?: string | null
  /** Server shift snapshot, present only when it differs from the ordinal plan date. */
  shiftedToDate?: string | null
  /** Tooltip details for a genuinely shifted day. */
  shiftBadge?: {
    originalDate: string
    days: number
  } | null
  /** Legacy compatibility marker. Never use as the source of truth; derive rest from rows. */
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

/** The only authoritative rest-day rule across rendering and data paths. */
export function isRestDay(day: Pick<DayCol, 'rows'>): boolean {
  return day.rows.length === 0
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
