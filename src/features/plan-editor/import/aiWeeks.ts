import type { AIWeek } from '../../../api/planImports'
import type { ImportDoubt } from '../types'
import type { ParsedWeek } from './index'

export function aiWeeksToParsed(weeks: AIWeek[], newNames = new Set<string>(), emptyWeeks = new Set<number>()): ParsedWeek[] {
  return weeks.map(week => {
    const weekDoubts: ImportDoubt[] = []
    if (!week.start_date) weekDoubts.push('no_date')
    if (emptyWeeks.has(week.index)) weekDoubts.push('empty_week')
    const serial = week.start_date ? Date.parse(`${week.start_date}T00:00:00Z`) / 86400000 + 25569 : null
    return {
      blockIndex: week.index, importDoubts: weekDoubts,
      dateSerials: Array.from({ length: 7 }, (_, day) => serial == null ? null : serial + day),
      days: week.days.map(day => ({ dayOfWeek: day.weekday, rest: day.rest, exercises: day.exercises.map(exercise => ({
        rawName: exercise.name.trim(), setCount: exercise.sets, reps: exercise.reps,
        mode: exercise.mode === 'none' ? 'kg' : exercise.mode,
        values: exercise.values, note: exercise.note,
        importDoubts: [
          ...(newNames.has(exercise.name.trim()) ? ['new_exercise' as const] : []),
          ...exercise.flags, ...weekDoubts,
        ],
      })) })),
    }
  })
}
