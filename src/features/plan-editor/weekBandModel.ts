import type { ExerciseRow, Week } from './types'

export type WeekBandTier = 'main' | 'aux'

/**
 * Reorder one concrete week's day in its rendered tier order. The current day
 * is resolved from the functional-update snapshot so a save/reconcile landing
 * between drag start and drop cannot be overwritten with stale row objects.
 */
export function reorderRowsInWeek(
  weeks: readonly Week[],
  resolveTier: (row: ExerciseRow) => WeekBandTier,
  weekNumber: number,
  dow: number,
  dragRowId: string,
  targetRowId: string,
  position: 'before' | 'after',
): Week[] | null {
  if (dragRowId === targetRowId) return null
  const sourceWeek = weeks.find((week) => week.num === weekNumber)
  const sourceDay = sourceWeek?.days.find((day) => day.dow === dow)
  if (!sourceDay || sourceDay.rows.some((row) => row.hasLogs)) return null
  const dragRow = sourceDay.rows.find((row) => row.id === dragRowId)
  const targetRow = sourceDay.rows.find((row) => row.id === targetRowId)
  if (!dragRow || !targetRow || resolveTier(dragRow) !== resolveTier(targetRow)) return null

  const main = sourceDay.rows.filter((row) => resolveTier(row) === 'main')
  const aux = sourceDay.rows.filter((row) => resolveTier(row) === 'aux')
  const tierRows = resolveTier(dragRow) === 'main' ? main : aux
  const sourceIndex = tierRows.findIndex((row) => row.id === dragRowId)
  const originalTargetIndex = tierRows.findIndex((row) => row.id === targetRowId)
  if (sourceIndex < 0 || originalTargetIndex < 0) return null
  const [moving] = tierRows.splice(sourceIndex, 1)
  const targetIndex = tierRows.findIndex((row) => row.id === targetRowId)
  tierRows.splice(position === 'after' ? targetIndex + 1 : targetIndex, 0, moving)
  const reordered = resolveTier(dragRow) === 'main' ? [...tierRows, ...aux] : [...main, ...tierRows]
  if (reordered.every((row, index) => row === sourceDay.rows[index])) return null

  const nextWeeks = weeks.map((week) => {
    if (week.num !== weekNumber) return week
    return {
      ...week,
      days: week.days.map((day) => {
        return day.dow === dow ? { ...day, rows: reordered } : day
      }),
    }
  })
  return nextWeeks
}

export interface WeekCenterCandidate {
  weekNumber: number
  index: number
  left: number
  width: number
}

/** Single scroll-spy rule: nearest band centre, then lower week index on ties. */
export function closestWeekToViewportCenter(
  viewportLeft: number,
  viewportWidth: number,
  candidates: readonly WeekCenterCandidate[],
): number | null {
  const viewportCenter = viewportLeft + viewportWidth / 2
  let best: WeekCenterCandidate | null = null
  let bestDistance = Number.POSITIVE_INFINITY
  for (const candidate of candidates) {
    const distance = Math.abs(candidate.left + candidate.width / 2 - viewportCenter)
    if (distance < bestDistance || (distance === bestDistance && candidate.index < (best?.index ?? Infinity))) {
      best = candidate
      bestDistance = distance
    }
  }
  return best?.weekNumber ?? null
}

/**
 * Display-only training-day ordinal within one week. Empty/rest positions do
 * not consume a D number; storage and all day_of_week semantics stay intact.
 */
export function trainingDayOrdinal(week: Pick<Week, 'days'>, dow: number): number | null {
  let ordinal = 0
  for (const day of week.days) {
    const hasActions = day.rows.length > 0
    if (hasActions) ordinal += 1
    if (day.dow === dow) return hasActions ? ordinal : null
  }
  return null
}
