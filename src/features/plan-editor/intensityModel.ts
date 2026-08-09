import type { ExerciseRow, RowIntensity, SetBox, WeightMode } from './types'

export function isLegacyRpeRow(row: ExerciseRow): boolean {
  return row.mode === 'rpe' && row.intensity === undefined
}

/** Present old pure-RPE rows through the new row-level selector without
 * reinterpreting their boxes as weights. Until edited, reconcile can still
 * preserve every old per-set RPE value losslessly. */
export function rowIntensity(row: ExerciseRow): RowIntensity | null {
  if (row.mode === 'bodyweight') return null
  if (row.intensity !== undefined) return row.intensity
  // A legacy per-set RPE row has no honest row-level value. In particular, do
  // not synthesize one from the first set: 7.5/8 must remain two prescriptions.
  return null
}

export function rowWeightBoxes(row: ExerciseRow): SetBox[] {
  if (row.mode === 'bodyweight' || isLegacyRpeRow(row)) {
    return row.boxes.map(() => ({ val: '', empty: true }))
  }
  return row.boxes
}

export function inferredWeightMode(row: ExerciseRow): WeightMode {
  if (isLegacyRpeRow(row)) return 'per_set'
  if (row.weightMode) return row.weightMode
  const values = rowWeightBoxes(row).map((box) => box.empty || box.val.trim() === '' ? '<empty>' : box.val.trim())
  return new Set(values).size > 1 ? 'per_set' : 'uniform'
}

/** Convert a legacy row to the new orthogonal shape before any intensity/weight
 * edit. Old RPE boxes become a row-level RPE and fresh empty weight slots. */
export function materializeIntensityRow(row: ExerciseRow): ExerciseRow {
  if (row.mode === 'bodyweight') return row
  if (row.mode !== 'rpe' && row.intensity !== undefined && row.weightMode !== undefined) return row
  return {
    ...row,
    mode: 'kg',
    intensity: rowIntensity(row),
    weightMode: inferredWeightMode(row),
    boxes: rowWeightBoxes(row).map((box) => ({ ...box })),
  }
}
