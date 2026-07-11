export type IntensityMode = 'kg' | 'rpe' | 'bodyweight'

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

/** True when a row carries real content — an exercise name or any filled set —
 *  yet isn't bound to a catalog exercise. Save reconciliation drops such rows
 *  (and delete+recreate can erase them from a day that changed), so they are a
 *  data-loss risk the coach must be warned about. Empty placeholder rows return
 *  false: skipping them loses nothing. */
export function isContentfulUnbound(row: ExerciseRow): boolean {
  if (row.exerciseId) return false
  return row.name.trim() !== '' || row.boxes.some((b) => !b.empty && b.val !== '')
}

/** True when a row IS bound but has no filled set — reconcile persists it as an
 *  exercise with zero sets, which the backend's publish completeness gate rejects
 *  (PLAN_PUBLISH_INCOMPLETE). Common after xlsx import when the source row had a
 *  name but no 组×次 data. The coach must fill sets or delete the row to publish. */
export function isBoundNoSets(row: ExerciseRow): boolean {
  if (!row.exerciseId) return false
  if (row.aux) return false
  const reps = row.reps.trim()
  if (!/^\d{1,2}(?:\s*(?:-|–|—|~|到|至)\s*\d{1,2}|\+)?$/.test(reps)) return true
  if (row.boxes.length === 0) return true
  if (row.mode === 'bodyweight') return false
  return row.boxes.some((box) => {
    if (box.empty || box.val.trim() === '') return true
    const value = Number(box.val)
    if (!Number.isFinite(value) || value < 0) return true
    return row.mode === 'rpe' && (value < 1 || value > 10)
  })
}
