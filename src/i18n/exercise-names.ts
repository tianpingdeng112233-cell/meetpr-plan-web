import generatedNames from './exercise-names-zh-hant.json'
import { normalizeTraditionalInput } from './stable-zh'

const names: Record<string, string> = generatedNames
const canonicalNames = new Map(Object.entries(names).map(([canonical, display]) => [display, canonical]))

export function traditionalExerciseName(name: string): string {
  return Object.hasOwn(names, name) ? names[name] : name
}

/** Undo localized API display names before they enter catalog binding/storage. */
export function canonicalCatalogExercise<T extends { name: string; created_by_coach_id: string | null }>(exercise: T): T {
  if (exercise.created_by_coach_id != null || Object.hasOwn(names, exercise.name)) return exercise
  const simplified = normalizeTraditionalInput(exercise.name)
  const canonical = names[simplified] === exercise.name ? simplified : canonicalNames.get(exercise.name)
  return canonical ? { ...exercise, name: canonical } : exercise
}
