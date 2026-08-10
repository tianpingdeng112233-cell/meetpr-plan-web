import type { ExerciseRow, Week } from './types'

export type WeekBandTier = 'main' | 'aux'

export interface WeekBandSlot {
  /** exercise_id is the identity; duplicate occurrences get a stable suffix. */
  key: string
  exerciseId: string | null
  exemplar: ExerciseRow
  tier: WeekBandTier
}

export interface DayBandAlignment {
  dow: number
  main: WeekBandSlot[]
  aux: WeekBandSlot[]
  /** Slot key → concrete row in this week/day. */
  rowsByWeek: Map<number, Map<string, ExerciseRow>>
}

/** Concrete rows in the same slot order the week band renders. */
export function rowsInWeekBandOrder(
  alignment: DayBandAlignment,
  weekNumber: number,
): ExerciseRow[] {
  const rows = alignment.rowsByWeek.get(weekNumber)
  if (!rows) return []
  return [...alignment.main, ...alignment.aux].flatMap((slot) => {
    const row = rows.get(slot.key)
    return row ? [row] : []
  })
}

/**
 * Project the stored plan onto the shared slot order without mutating it. This
 * is the interaction model: selection, keyboard navigation and row dragging
 * must see the exact row sequence rendered by DayColumn.
 */
export function orderWeeksByWeekBand(
  weeks: readonly Week[],
  alignments: readonly DayBandAlignment[],
): Week[] {
  const byDow = new Map(alignments.map((alignment) => [alignment.dow, alignment]))
  return weeks.map((week) => ({
    ...week,
    days: week.days.map((day) => {
      const alignment = byDow.get(day.dow)
      return alignment ? { ...day, rows: rowsInWeekBandOrder(alignment, week.num) } : day
    }),
  }))
}

/**
 * Move a shared skeleton slot and project that visual order back into every
 * concrete week/day. Missing slots stay missing: only weeks that actually
 * contain an exercise get a reordered row (and therefore a rewritten
 * sort_order when the plan is reconciled).
 */
export function reorderWeekBandSkeleton(
  weeks: readonly Week[],
  resolveTier: (row: ExerciseRow) => WeekBandTier,
  dow: number,
  sourceWeekNumber: number,
  dragRowId: string,
  targetRowId: string,
  position: 'before' | 'after',
): Week[] | null {
  if (dragRowId === targetRowId) return null
  // Alignment and the logged-row lock are derived from the weeks passed in —
  // callers hand us the functional-update `prev`, so a concurrent autosave or
  // reconcile can never be clobbered by a stale event-closure snapshot.
  const alignment = alignWeeksByExercise(weeks, resolveTier).find(
    (candidate) => candidate.dow === dow,
  )
  if (!alignment) return null
  if (
    [...alignment.rowsByWeek.values()].some((rows) =>
      [...rows.values()].some((row) => row.hasLogs),
    )
  ) return null
  const sourceRows = alignment.rowsByWeek.get(sourceWeekNumber)
  if (!sourceRows) return null

  let dragKey: string | null = null
  let targetKey: string | null = null
  for (const [key, row] of sourceRows) {
    if (row.id === dragRowId) dragKey = key
    if (row.id === targetRowId) targetKey = key
  }
  if (!dragKey || !targetKey) return null

  const tier = alignment.main.some((slot) => slot.key === dragKey) ? 'main'
    : alignment.aux.some((slot) => slot.key === dragKey) ? 'aux'
      : null
  if (!tier) return null
  const slots = [...alignment[tier]]
  const sourceIndex = slots.findIndex((slot) => slot.key === dragKey)
  const originalTargetIndex = slots.findIndex((slot) => slot.key === targetKey)
  if (sourceIndex < 0 || originalTargetIndex < 0) return null
  const [moving] = slots.splice(sourceIndex, 1)
  const targetIndex = slots.findIndex((slot) => slot.key === targetKey)
  slots.splice(position === 'after' ? targetIndex + 1 : targetIndex, 0, moving)

  const orderedSlots = tier === 'main'
    ? [...slots, ...alignment.aux]
    : [...alignment.main, ...slots]
  let changed = false
  const nextWeeks = weeks.map((week) => {
    const concreteBySlot = alignment.rowsByWeek.get(week.num)
    if (!concreteBySlot) return week
    return {
      ...week,
      days: week.days.map((day) => {
        if (day.dow !== alignment.dow) return day
        const reordered = orderedSlots.flatMap((slot) => {
          const row = concreteBySlot.get(slot.key)
          return row ? [row] : []
        })
        const included = new Set(reordered.map((row) => row.id))
        reordered.push(...day.rows.filter((row) => !included.has(row.id)))
        if (reordered.every((row, index) => row === day.rows[index])) return day
        changed = true
        return { ...day, rows: reordered }
      }),
    }
  })
  return changed ? nextWeeks : null
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

function keyedRows(
  rows: readonly ExerciseRow[],
  tier: WeekBandTier,
  resolveTier: (row: ExerciseRow) => WeekBandTier,
): Array<{ key: string; row: ExerciseRow }> {
  const occurrences = new Map<string, number>()
  return rows.flatMap((row) => {
    if (resolveTier(row) !== tier) return []
    // Unbound rows align by their (trimmed) display name so imported/sample
    // plans without catalog bindings still form one skeleton per exercise;
    // only nameless rows fall back to per-row identity.
    const trimmedName = row.name.trim()
    const identity = row.exerciseId ?? (trimmedName ? `name:${trimmedName}` : `row:${row.id}`)
    const occurrence = occurrences.get(identity) ?? 0
    occurrences.set(identity, occurrence + 1)
    return [{ key: `${identity}:${occurrence}`, row }]
  })
}

/**
 * Build the display-only exercise union for every ordinal day. Week order, then
 * the source row order inside a week, determines the stable skeleton order.
 * No plan row is cloned or mutated here.
 */
export function alignWeeksByExercise(
  weeks: readonly Week[],
  resolveTier: (row: ExerciseRow) => WeekBandTier,
): DayBandAlignment[] {
  const dows = [...new Set(weeks.flatMap((week) => week.days.map((day) => day.dow)))].sort((a, b) => a - b)
  return dows.map((dow) => {
    const rowsByWeek = new Map<number, Map<string, ExerciseRow>>()
    const slots: Record<WeekBandTier, WeekBandSlot[]> = { main: [], aux: [] }
    const seen: Record<WeekBandTier, Set<string>> = { main: new Set(), aux: new Set() }

    for (const week of weeks) {
      const day = week.days.find((candidate) => candidate.dow === dow)
      const weekRows = new Map<string, ExerciseRow>()
      rowsByWeek.set(week.num, weekRows)
      if (!day) continue
      for (const tier of ['main', 'aux'] as const) {
        const keyedForWeek = keyedRows(day.rows, tier, resolveTier)
        for (const keyed of keyedForWeek) {
          weekRows.set(keyed.key, keyed.row)
          if (seen[tier].has(keyed.key)) continue
          const keyedIndex = keyedForWeek.indexOf(keyed)
          const nextKnown = keyedForWeek.slice(keyedIndex + 1).find((candidate) => seen[tier].has(candidate.key))
          const previousKnown = [...keyedForWeek.slice(0, keyedIndex)].reverse()
            .find((candidate) => seen[tier].has(candidate.key))
          seen[tier].add(keyed.key)
          const slot = {
            key: keyed.key,
            exerciseId: keyed.row.exerciseId,
            exemplar: keyed.row,
            tier,
          }
          if (nextKnown) {
            const insertAt = slots[tier].findIndex((candidate) => candidate.key === nextKnown.key)
            slots[tier].splice(insertAt, 0, slot)
          } else if (previousKnown) {
            const insertAt = slots[tier].findIndex((candidate) => candidate.key === previousKnown.key)
            slots[tier].splice(insertAt + 1, 0, slot)
          } else {
            slots[tier].push(slot)
          }
        }
      }
    }
    return { dow, main: slots.main, aux: slots.aux, rowsByWeek }
  })
}

export const WEEKDAY_LABELS = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'] as const

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

export function anchoredWeekday(anchorWeekday: number | null | undefined, dayOrdinal: number): string | null {
  if (anchorWeekday == null || anchorWeekday < 1 || anchorWeekday > 7) return null
  const weekday = ((anchorWeekday - 1 + dayOrdinal - 1) % 7 + 7) % 7
  return WEEKDAY_LABELS[weekday]
}
