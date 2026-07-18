import type { LiftFamily } from '../../api/types'

export type JtsPhase = 'hypertrophy' | 'strength' | 'peaking'
export type JtsPhaseSelection = JtsPhase | 'off'
export type JtsSetClassification = 'below_mev' | 'mev_band' | 'between' | 'mrv_band' | 'above_mrv'

export interface JtsVolumeBand {
  mev: readonly [min: number, max: number]
  mrv: readonly [min: number, max: number]
}

/**
 * Source: JTS, The Powerlifting Program Design Manual.
 * Phase × competition-lift-family weekly working-set reference grid.
 * These source values are transcribed verbatim; keep all consumers on this table.
 */
export const JTS_VOLUME_BANDS = {
  hypertrophy: {
    squat: { mev: [5, 10], mrv: [10, 16] },
    bench: { mev: [6, 12], mrv: [14, 20] },
    deadlift: { mev: [4, 7], mrv: [8, 14] },
  },
  strength: {
    squat: { mev: [3, 8], mrv: [6, 12] },
    bench: { mev: [5, 11], mrv: [8, 16] },
    deadlift: { mev: [3, 6], mrv: [4, 10] },
  },
  peaking: {
    squat: { mev: [2, 7], mrv: [3, 9] },
    bench: { mev: [4, 9], mrv: [5, 12] },
    deadlift: { mev: [1, 4], mrv: [2, 7] },
  },
} as const satisfies Record<JtsPhase, Record<LiftFamily, JtsVolumeBand>>

export const JTS_PHASE_LABELS: Record<JtsPhaseSelection, string> = {
  off: '不提示',
  hypertrophy: '增肌期',
  strength: '增力期',
  peaking: '峰值期',
}

export const JTS_CLASSIFICATION_LABELS: Record<JtsSetClassification, string> = {
  below_mev: '低于 MEV 参考带',
  mev_band: 'MEV 参考带内',
  between: 'MEV 与 MRV 参考带之间',
  mrv_band: 'MRV 参考带内',
  above_mrv: '高于 MRV 参考带上限',
}

const JTS_PHASE_STORAGE_PREFIX = 'meetpr.planEditor.jtsVolumePhase.'

function isLiftFamily(value: unknown): value is LiftFamily {
  return value === 'squat' || value === 'bench' || value === 'deadlift'
}

export function isJtsPhaseSelection(value: unknown): value is JtsPhaseSelection {
  return value === 'off' || value === 'hypertrophy' || value === 'strength' || value === 'peaking'
}

/**
 * Bands can overlap in the source grid. In an overlap, the MRV band wins so the
 * single result remains conservative; this does not turn the hint into a gate.
 */
export function classifySets(
  family: LiftFamily | string | null | undefined,
  phase: JtsPhase,
  sets: number,
): JtsSetClassification | null {
  if (!isLiftFamily(family) || !Number.isFinite(sets) || sets <= 0) return null
  const { mev, mrv } = JTS_VOLUME_BANDS[phase][family]
  if (sets < mev[0]) return 'below_mev'
  if (sets > mrv[1]) return 'above_mrv'
  if (sets >= mrv[0]) return 'mrv_band'
  if (sets <= mev[1]) return 'mev_band'
  return 'between'
}

function browserStorage(): Pick<Storage, 'getItem' | 'setItem'> | null {
  if (typeof window === 'undefined') return null
  try {
    return window.localStorage
  } catch {
    return null
  }
}

export function jtsPhaseStorageKey(planId: string): string {
  return `${JTS_PHASE_STORAGE_PREFIX}${planId}`
}

export function loadJtsPhase(
  planId: string | null | undefined,
  storage: Pick<Storage, 'getItem'> | null = browserStorage(),
): JtsPhaseSelection {
  if (!planId || !storage) return 'off'
  try {
    const stored = storage.getItem(jtsPhaseStorageKey(planId))
    return isJtsPhaseSelection(stored) ? stored : 'off'
  } catch {
    return 'off'
  }
}

export function saveJtsPhase(
  planId: string | null | undefined,
  phase: JtsPhaseSelection,
  storage: Pick<Storage, 'setItem'> | null = browserStorage(),
): void {
  if (!planId || !storage) return
  try {
    storage.setItem(jtsPhaseStorageKey(planId), phase)
  } catch {
    // A disabled/full localStorage must not affect plan editing.
  }
}
