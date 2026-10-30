import type { AIExercise, AIWeek } from '../../../api/planImports'
import { STABLE_ZH } from '../../../i18n/stable-zh'
import { isValidIntensityValue, isValidReps, isValidWeight } from '../inputGuard'

type Unparsed = NonNullable<AIExercise['unparsed']>[number]
export type TextGroup = Unparsed & { key: string; count: number }
export type TextFix =
  | { field: 'reps'; value: string }
  | { field: 'intensity'; kind: AIExercise['intensity_kind']; value: string }
  | { field: 'weight'; value: string | null }
export type TextFixes = Record<string, TextFix>

function groupKey(item: Unparsed): string { return JSON.stringify([item.field, item.text]) }

export function groupUnparsed(weeks: AIWeek[]): TextGroup[] {
  const groups = new Map<string, TextGroup>()
  for (const week of weeks) for (const day of week.days) for (const exercise of day.exercises) {
    const seen = new Set<string>()
    for (const item of exercise.unparsed ?? []) {
      const key = groupKey(item)
      if (seen.has(key)) continue
      seen.add(key)
      const group = groups.get(key)
      if (group) group.count++
      else groups.set(key, { ...item, key, count: 1 })
    }
  }
  return [...groups.values()]
}

export function validTextFix(fix: TextFix | undefined): boolean {
  if (!fix) return false
  switch (fix.field) {
    case 'reps': return fix.value === STABLE_ZH.failureReps || /^\d+$/.test(fix.value) && isValidReps(fix.value)
    case 'intensity': return fix.kind === null || isValidIntensityValue(fix.kind, fix.value)
    case 'weight': return fix.value === null || isValidWeight(fix.value)
  }
}

/** Apply to copies before buildWeeks; source text and recognition results stay intact. */
export function applyTextFixes(weeks: AIWeek[], fixes: TextFixes): AIWeek[] {
  return weeks.map(week => ({ ...week, days: week.days.map(day => ({ ...day, exercises: day.exercises.map(exercise => {
    const next = { ...exercise }
    for (const item of exercise.unparsed ?? []) {
      const fix = fixes[groupKey(item)]
      if (!validTextFix(fix) || fix.field !== item.field) throw new Error('IMPORT_UNRESOLVED_TEXT')
      switch (fix.field) {
        case 'reps': next.reps = fix.value; break
        case 'intensity':
          next.intensity_kind = fix.kind
          next.intensity_values = fix.kind === null ? [] : Array(exercise.sets).fill(fix.value)
          break
        case 'weight': next.weight_values = fix.value === null ? [] : Array(exercise.sets).fill(fix.value); break
      }
      if (!next.note.includes(item.text)) next.note = [next.note, item.text].filter(Boolean).join(' · ')
    }
    return next
  }) })) }))
}
