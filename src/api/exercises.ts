import { api } from './client'
import type { CreateCustomExerciseBody, Equipment, ExerciseResponse, LiftFamily, MovementPattern, MuscleGroup } from './types'

export interface CreateCustomExerciseInput {
  name: string
  nameEn?: string | null
  /** Defaults to accessory; main_lift_variation requires mainLiftFamily. */
  exerciseType?: 'accessory' | 'main_lift_variation'
  mainLiftFamily?: LiftFamily
  muscleGroup?: MuscleGroup
  /** Ordered as primary muscle first, followed by synergists. */
  muscleGroups?: MuscleGroup[]
  equipment?: Equipment
  equipmentList?: Equipment[]
  movementPattern?: MovementPattern
}

export interface ExerciseUsageStat {
  exercise_id: string
  plan_count: number
}

export const DEFAULT_CUSTOM_EXERCISE: Omit<CreateCustomExerciseBody, 'name'> = {
  exercise_type: 'accessory',
  main_lift_family: null,
  is_competition_lift: false,
  muscle_groups: ['core'],
  equipment: ['bodyweight'],
  movement_pattern: ['other'],
}

export function customExerciseBody(input: CreateCustomExerciseInput): CreateCustomExerciseBody {
  const muscleGroups = input.muscleGroups?.length
    ? input.muscleGroups
    : [input.muscleGroup ?? DEFAULT_CUSTOM_EXERCISE.muscle_groups[0]]
  const equipment = input.equipmentList ?? [input.equipment ?? DEFAULT_CUSTOM_EXERCISE.equipment[0]]
  const asVariation = input.exerciseType === 'main_lift_variation' && input.mainLiftFamily != null
  return {
    ...DEFAULT_CUSTOM_EXERCISE,
    exercise_type: asVariation ? 'main_lift_variation' : 'accessory',
    main_lift_family: asVariation ? input.mainLiftFamily! : null,
    name: input.name.trim(),
    ...(input.nameEn !== undefined ? { name_en: input.nameEn?.trim() || null } : {}),
    muscle_groups: [...new Set(muscleGroups)],
    equipment: [...new Set(equipment.length ? equipment : DEFAULT_CUSTOM_EXERCISE.equipment)],
    movement_pattern: [input.movementPattern ?? DEFAULT_CUSTOM_EXERCISE.movement_pattern[0]],
  }
}

// The catalog is small enough to fetch once and filter client-side for typeahead.
export const listExercises = () =>
  api.get<{ exercises: ExerciseResponse[] }>('/exercises').then((r) => r.exercises)

export const getExerciseUsageStats = () =>
  api.get<{ stats: ExerciseUsageStat[] }>('/exercises/usage-stats').then((r) => r.stats)

export const createCustomExercise = (input: CreateCustomExerciseInput) =>
  api.post<ExerciseResponse>('/exercises', customExerciseBody(input))

function sameList<T>(a: readonly T[], b: readonly T[]): boolean {
  return a.length === b.length && a.every((item, index) => item === b[index])
}

/** PATCH body = only the fields the coach actually changed, so an edit never downgrades
 *  fields the form does not model (e.g. `main_lift` type or `is_competition_lift`). */
export function customExercisePatchBody(
  input: CreateCustomExerciseInput,
  original: ExerciseResponse,
): Partial<CreateCustomExerciseBody> {
  const patch: Partial<CreateCustomExerciseBody> = {}
  const name = input.name.trim()
  if (name && name !== original.name) patch.name = name
  if (input.nameEn !== undefined) {
    const nameEn = input.nameEn?.trim() || null
    if (nameEn !== original.name_en) patch.name_en = nameEn
  }
  if (input.exerciseType !== undefined) {
    const asVariation = input.exerciseType === 'main_lift_variation' && input.mainLiftFamily != null
    const exerciseType = asVariation ? 'main_lift_variation' : 'accessory'
    const family = asVariation ? input.mainLiftFamily! : null
    if (exerciseType !== original.exercise_type || family !== original.main_lift_family) {
      patch.exercise_type = exerciseType
      patch.main_lift_family = family
    }
  }
  const muscleGroups = input.muscleGroups?.length
    ? [...new Set(input.muscleGroups)]
    : input.muscleGroup ? [input.muscleGroup] : null
  if (muscleGroups && !sameList(muscleGroups, original.muscle_groups)) patch.muscle_groups = muscleGroups
  const equipment = input.equipmentList?.length
    ? [...new Set(input.equipmentList)]
    : input.equipment ? [input.equipment] : null
  if (equipment && !sameList(equipment, original.equipment)) patch.equipment = equipment
  if (input.movementPattern && !sameList([input.movementPattern], original.movement_pattern)) {
    patch.movement_pattern = [input.movementPattern]
  }
  return patch
}

export const updateCustomExercise = (id: string, input: CreateCustomExerciseInput, original: ExerciseResponse) => {
  const body = customExercisePatchBody(input, original)
  if (Object.keys(body).length === 0) return Promise.resolve(original)
  return api.patch<ExerciseResponse>(`/exercises/${id}`, body)
}

export const deleteCustomExercise = (id: string) =>
  api.del<void>(`/exercises/${id}`)
