import { STABLE_ZH } from '../../i18n/stable-zh'
import type { OpaqueSetSpec } from './types'

/** The backend's legacy bodyweight projection; a note alone never changes load. */
export function isLegacyBodyweightSet(
  set: Partial<Pick<OpaqueSetSpec, 'load_mode' | 'intensity_mode' | 'target_value' | 'coach_note'>>,
): boolean {
  return set.load_mode == null
    && set.intensity_mode === 'rpe'
    && Number(set.target_value) === 10
    && STABLE_ZH.patterns.bodyweight.test(set.coach_note ?? '')
}
