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
