import type { DisplayWeightMode, ExerciseRow, IntensityValueMode, PctAnchor, RowIntensity, SetBox, WeightMode } from './types'

export function isSingleValueIntensity(
  intensity: RowIntensity | null,
): intensity is RowIntensity & { mode: 'pct' | 'rpe' | 'rir' } {
  return intensity?.mode === 'pct' || intensity?.mode === 'rpe' || intensity?.mode === 'rir'
}

export function isLegacyRpeRow(row: ExerciseRow): boolean {
  return row.mode === 'rpe' && row.intensity === undefined
}

/** Present old pure-RPE rows through the new row-level selector without
 * reinterpreting their boxes as weights. Until edited, reconcile can still
 * preserve every old per-set RPE value losslessly. */
export function rowIntensity(row: ExerciseRow): RowIntensity | null {
  if (row.mode === 'bodyweight') return null
  if (row.intensity !== undefined) return row.intensity
  if (isLegacyRpeRow(row)) {
    const first = (row.intensityBoxes ?? row.boxes).find((box) => !box.empty && box.val.trim() !== '')
    return { mode: 'rpe', value: first?.val ?? '', high: '' }
  }
  return null
}

/** Strength-column projection. Weight-only wire modes deliberately render as
 * "no intensity" while persistence keeps using `rowIntensity` unchanged. */
export function displayedRowIntensity(row: ExerciseRow): RowIntensity | null {
  const intensity = rowIntensity(row)
  return intensity?.mode === 'weight_range' || intensity?.mode === 'fixed_weight' ? null : intensity
}

/** Legacy/missing pct anchors have always meant 1RM. */
export function rowPctAnchor(row: ExerciseRow): PctAnchor {
  return rowIntensity(row)?.mode === 'pct' ? row.pctAnchor ?? 'one_rm' : 'one_rm'
}

/** Return a copy with no percentage-anchor own-property. */
export function clearPctAnchor(row: ExerciseRow): ExerciseRow {
  const next = { ...row }
  delete next.pctAnchor
  return next
}

export function rowWeightBoxes(row: ExerciseRow): SetBox[] {
  if (row.mode === 'bodyweight' || isLegacyRpeRow(row)) {
    return row.boxes.map(() => ({ val: '', empty: true }))
  }
  return row.boxes
}

function weightModeForBoxes(row: ExerciseRow): WeightMode {
  const values = rowWeightBoxes(row).map((box) => box.empty || box.val.trim() === '' ? '<empty>' : box.val.trim())
  return new Set(values).size > 1 ? 'per_set' : 'uniform'
}

export function inferredWeightMode(row: ExerciseRow): WeightMode {
  if (row.weightMode) return row.weightMode
  return weightModeForBoxes(row)
}

/** Four weight-column modes. The backend's weight_range/fixed_weight values
 * remain in row.intensity for wire compatibility, but their UI belongs here. */
export function displayedWeightMode(row: ExerciseRow): DisplayWeightMode {
  if (row.mode === 'bodyweight') return 'bodyweight'
  const intensity = rowIntensity(row)
  if (intensity?.mode === 'weight_range') return 'weight_range'
  // Stored fixed_weight and old pure-kg rows predate the UI's explicit
  // uniform/per-set choice. Their wire values are authoritative: a differing
  // set must stay individually visible and editable instead of being folded
  // into the first set by the fixed-weight presentation.
  if (intensity?.mode === 'fixed_weight' || row.legacyWeightSource) {
    return weightModeForBoxes(row) === 'per_set' ? 'per_set' : 'fixed_weight'
  }
  return inferredWeightMode(row) === 'per_set' ? 'per_set' : 'fixed_weight'
}

/** Concrete pct/rpe/rir values, one slot per set. Older row-level shapes are
 * expanded on read so callers can always reason at set granularity. */
export function rowIntensityBoxes(row: ExerciseRow): SetBox[] {
  if (isLegacyRpeRow(row)) {
    const source = row.intensityBoxes ?? row.boxes
    return row.boxes.map((_, index) => source[index] ?? { val: '', empty: true })
  }
  const intensity = rowIntensity(row)
  if (!isSingleValueIntensity(intensity)) return row.boxes.map(() => ({ val: '', empty: true }))
  if (row.intensityBoxes) {
    return row.boxes.map((_, index) => row.intensityBoxes?.[index] ?? { val: '', empty: true })
  }
  const value = intensity.value.trim()
  return row.boxes.map(() => ({ val: intensity.value, empty: value === '' }))
}

export function inferredIntensityMode(row: ExerciseRow): IntensityValueMode {
  if (row.intensityMode) return row.intensityMode
  const values = rowIntensityBoxes(row).map((box) => box.empty || box.val.trim() === '' ? '<empty>' : box.val.trim())
  return new Set(values).size > 1 ? 'per_set' : 'uniform'
}

/** Convert a legacy row to the new orthogonal shape before any intensity/weight
 * edit. Its RPE slots already live independently from the empty weight slots. */
export function materializeIntensityRow(row: ExerciseRow): ExerciseRow {
  if (row.mode === 'bodyweight') return row
  if (!row.legacyWeightSource && row.mode !== 'rpe' && row.intensity !== undefined && row.weightMode !== undefined) return row
  const intensity = rowIntensity(row)
  const intensityBoxes = rowIntensityBoxes(row).map((box) => ({ ...box }))
  return {
    ...row,
    legacyWeightSource: undefined,
    mode: 'kg',
    intensity,
    intensityMode: inferredIntensityMode(row),
    intensityBoxes,
    weightMode: inferredWeightMode(row),
    boxes: rowWeightBoxes(row).map((box) => ({ ...box })),
  }
}
