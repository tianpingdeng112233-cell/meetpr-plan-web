import type { ExerciseRow, IntensityValueMode, RowIntensity, SetBox, WeightMode } from './types'

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

export function rowWeightBoxes(row: ExerciseRow): SetBox[] {
  if (row.mode === 'bodyweight' || isLegacyRpeRow(row)) {
    return row.boxes.map(() => ({ val: '', empty: true }))
  }
  return row.boxes
}

export function inferredWeightMode(row: ExerciseRow): WeightMode {
  if (row.weightMode) return row.weightMode
  const values = rowWeightBoxes(row).map((box) => box.empty || box.val.trim() === '' ? '<empty>' : box.val.trim())
  return new Set(values).size > 1 ? 'per_set' : 'uniform'
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
  if (row.mode !== 'rpe' && row.intensity !== undefined && row.weightMode !== undefined) return row
  const intensity = rowIntensity(row)
  const intensityBoxes = rowIntensityBoxes(row).map((box) => ({ ...box }))
  return {
    ...row,
    mode: 'kg',
    intensity,
    intensityMode: inferredIntensityMode(row),
    intensityBoxes,
    weightMode: inferredWeightMode(row),
    boxes: rowWeightBoxes(row).map((box) => ({ ...box })),
  }
}
