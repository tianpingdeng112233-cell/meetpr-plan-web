import type { ExerciseType, LiftFamily } from '../../api/types'
import type { ExerciseRow, Week } from './types'
import { rowWeightBoxes } from './intensityModel'

export interface CatalogClassification {
  exerciseType: ExerciseType
  mainLiftFamily: LiftFamily | null
}

export type CatalogClassifier = (exerciseId: string) => CatalogClassification | null

export interface WeekSummary {
  squatSets: number
  benchSets: number
  deadliftSets: number
  otherMainSets: number
  auxiliarySets: number
  totalSets: number
  /** Planned volume in kg. Only parseable kg-mode set boxes contribute. */
  tonnage: number
}

export interface DaySectionSummary {
  sets: number
  tonnage: number
}

export type TrendDirection = 'up' | 'down' | 'flat' | 'new'

export interface WeekTrend {
  direction: TrendDirection
  /** Signed percentage change. Null is the zero-baseline "new" case. */
  percent: number | null
}

/** Parse the first integer from a reps target: 8+ -> 8, 6-8 -> 6. */
export function parseTargetReps(reps: string): number | null {
  const match = reps.match(/\d+/)
  if (!match) return null
  const parsed = Number.parseInt(match[0], 10)
  return Number.isFinite(parsed) ? parsed : null
}

/** Single source for the set-count rule: every set slot counts (empty-kg, RPE
 *  and bodyweight sets included) — week, day-section and any future consumer
 *  must go through this, never `boxes.length` inline. */
export function rowSetCount(row: ExerciseRow): number {
  return row.boxes.length
}

export function rowTonnage(row: ExerciseRow): number {
  if (row.mode === 'bodyweight') return 0
  const reps = parseTargetReps(row.reps)
  if (reps == null) return 0

  return rowWeightBoxes(row).reduce((total, box) => {
    if (box.val.trim() === '') return total
    const weight = Number(box.val)
    return Number.isFinite(weight) ? total + weight * reps : total
  }, 0)
}

/** Summarize an already-classified day section using the weekly set/tonnage rules. */
export function summarizeDaySection(rows: readonly ExerciseRow[]): DaySectionSummary {
  return rows.reduce<DaySectionSummary>((summary, row) => ({
    sets: summary.sets + rowSetCount(row),
    tonnage: summary.tonnage + rowTonnage(row),
  }), { sets: 0, tonnage: 0 })
}

/** Coaches think in kg (David 2026-07-18): always kg, never tons. */
export function compactTonnage(kg: number): string {
  return `${kg.toLocaleString('zh-CN', { maximumFractionDigits: 1 })} kg`
}

/**
 * Derive one week's planned set distribution and tonnage without mutating it.
 * Bound catalog metadata is authoritative. Unknown/unbound main rows are kept
 * visible as "other main" rather than guessed into an S/B/D family.
 */
export function summarizeWeek(week: Week, classifyCatalog: CatalogClassifier): WeekSummary {
  const summary: WeekSummary = {
    squatSets: 0,
    benchSets: 0,
    deadliftSets: 0,
    otherMainSets: 0,
    auxiliarySets: 0,
    totalSets: 0,
    tonnage: 0,
  }

  for (const day of week.days) for (const row of day.rows) {
    const sets = rowSetCount(row)
    const catalog = row.exerciseId ? classifyCatalog(row.exerciseId) : null
    const isMain = catalog ? catalog.exerciseType !== 'accessory' : row.isMain

    summary.totalSets += sets
    summary.tonnage += rowTonnage(row)

    if (!isMain) {
      summary.auxiliarySets += sets
      continue
    }

    switch (catalog?.mainLiftFamily) {
      case 'squat': summary.squatSets += sets; break
      case 'bench': summary.benchSets += sets; break
      case 'deadlift': summary.deadliftSets += sets; break
      default: summary.otherMainSets += sets
    }
  }

  return summary
}

/** Compare a current metric with the previous week using a ±2% flat band. */
export function compareWeekMetric(current: number, previous: number): WeekTrend {
  if (previous === 0) {
    return current > 0
      ? { direction: 'new', percent: null }
      : { direction: 'flat', percent: 0 }
  }

  const percent = ((current - previous) / previous) * 100
  if (Math.abs(percent) <= 2) return { direction: 'flat', percent }
  return { direction: percent > 0 ? 'up' : 'down', percent }
}
