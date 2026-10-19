import { S } from '../../i18n/strings'
import type { ActualSet } from './actuals'
import type { ExerciseRow } from './types'

const compact = (values: string[]) => new Set(values).size === 1 ? values[0] : values.join('/')
const number = (value: string | null) => value == null || value.trim() === '' || !Number.isFinite(Number(value)) ? '—' : String(Number(value))

/** Render-only: all recorded attempts count, including failures and extra sets. */
export function actualShorthand(row: Pick<ExerciseRow, 'mode'> | null, actuals: readonly ActualSet[]): string {
  if (!actuals.length) return '—'
  const sets = [...actuals].sort((a, b) => a.set_index - b.set_index)
  const reps = compact(sets.map(set => String(set.reps)))
  const rpe = compact(sets.map(set => number(set.rpe)))
  const weight = row?.mode === 'bodyweight' && sets.every(set => number(set.weight_kg) === '0') ? S.common.bodyweight : compact(sets.map(set => number(set.weight_kg)))
  return `${sets.length}×${reps}${rpe === '—' ? '' : ` @${rpe}`}${weight === '—' ? '' : ` · ${weight}`}`
}
