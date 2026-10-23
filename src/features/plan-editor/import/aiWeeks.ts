import { orderedWeekdays } from '../../workspace/blockPlanSettings'
import type { AIWeek } from '../../../api/planImports'
import type { ImportDoubt } from '../types'
import type { ParsedWeek } from './index'

export function defaultImportWeekdays(count: number): number[] {
  const spreads: Record<number, number[]> = {
    1: [0], 2: [0, 3], 3: [0, 2, 4], 4: [0, 2, 4, 5],
    5: [0, 1, 3, 4, 5], 6: [0, 1, 2, 3, 4, 5], 7: [0, 1, 2, 3, 4, 5, 6],
  }
  return spreads[count] ?? []
}

// Resolve only ordinal-only weeks; dated/weekday-known days retain their positions.
export function placeAIWeekdays(weeks: AIWeek[], weekdays: readonly number[], first: number): AIWeek[] {
  const ordered = orderedWeekdays(weekdays, first)
  return weeks.map(week => {
    if (!week.days.some(day => day.weekday === null)) return week
    const training = week.days.filter(day => !day.rest).sort((a, b) => a.day_index - b.day_index)
    if (training.length !== ordered.length) throw new Error('IMPORT_WEEKDAY_COUNT')
    // buildWeeks fills the remaining dates with rest days.
    return { ...week, days: training.map((day, index) => ({ ...day, weekday: ordered[index] })) }
  })
}

export function aiWeeksToParsed(weeks: AIWeek[], emptyWeeks = new Set<number>(), inferredConfirmed = false): ParsedWeek[] {
  return weeks.map(week => {
    const weekDoubts: ImportDoubt[] = []
    if (emptyWeeks.has(week.index)) weekDoubts.push('empty_week')
    const serial = week.start_date ? Date.parse(`${week.start_date}T00:00:00Z`) / 86400000 + 25569 : null
    return {
      blockIndex: week.index, importDoubts: weekDoubts,
      dateSerials: Array.from({ length: 7 }, (_, day) => serial == null ? null : serial + day),
      days: week.days.map(day => {
        if (day.weekday === null) throw new Error('IMPORT_WEEKDAYS_REQUIRED')
        return { dayOfWeek: day.weekday, rest: day.rest, exercises: day.exercises.map(exercise => ({
          rawName: exercise.name.trim(), setCount: exercise.sets, reps: exercise.reps,
          intensityKind: exercise.intensity_kind,
          intensityValues: exercise.intensity_values,
          weightValues: exercise.weight_values, note: exercise.note,
          importDoubts: [
            ...exercise.flags.filter(flag => flag === 'inferred' && !inferredConfirmed), ...weekDoubts,
          ],
        })) }
      }),
    }
  })
}
