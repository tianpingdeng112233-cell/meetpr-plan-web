export type MetricTone = 'ok' | 'warn' | 'bad' | 'neutral'

export const COMPLETION_RATE_OK_MIN = 85
export const COMPLETION_RATE_WARN_MIN = 65

/** Shared completion-rate thresholds. Input is a display percentage (0–100). */
export function completionRateTone(percent: number | null | undefined): MetricTone {
  if (percent == null || !Number.isFinite(percent)) return 'neutral'
  if (percent >= COMPLETION_RATE_OK_MIN) return 'ok'
  if (percent >= COMPLETION_RATE_WARN_MIN) return 'warn'
  return 'bad'
}

/** Shared RPE thresholds for future overview/editor/context consumers. */
export function rpeTone(rpe: number | null | undefined): MetricTone {
  if (rpe == null || !Number.isFinite(rpe)) return 'neutral'
  if (rpe >= 8.4) return 'bad'
  if (rpe >= 8.0) return 'warn'
  return 'neutral'
}
