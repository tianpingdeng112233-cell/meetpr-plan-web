export const VIDEO_SPEEDS = [0.25, 0.5, 1, 1.5, 2] as const

export const FRAME_SECONDS = 1 / 30

export function frameStepTime(
  currentTime: number,
  direction: -1 | 1,
  duration: number,
): number | null {
  if (!Number.isFinite(duration) || duration <= 0) return null
  const current = Number.isFinite(currentTime) ? currentTime : 0
  return Math.max(0, Math.min(duration, current + direction * FRAME_SECONDS))
}

/**
 * Vertical distance (px) from the progress bar's nearest edge beyond which
 * a drag switches into frame-precision mode.
 */
export const PRECISION_SCRUB_THRESHOLD_PX = 48

/**
 * Frame-precision scrubbing: once the pointer leaves the bar vertically,
 * horizontal movement maps 1px → 1 frame instead of the absolute position.
 */
export function precisionScrubTime(
  anchorTime: number,
  anchorX: number,
  clientX: number,
  duration: number,
): number | null {
  if (!Number.isFinite(duration) || duration <= 0) return null
  const base = Number.isFinite(anchorTime) ? anchorTime : 0
  return Math.max(0, Math.min(duration, base + (clientX - anchorX) * FRAME_SECONDS))
}
