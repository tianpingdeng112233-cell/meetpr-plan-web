import { api } from './client'
import type { CreateCustomExerciseBody, Equipment, ExerciseResponse, MovementPattern, MuscleGroup } from './types'

export interface CreateCustomExerciseInput {
  name: string
  muscleGroup?: MuscleGroup
  /** Ordered as primary muscle first, followed by synergists. */
  muscleGroups?: MuscleGroup[]
  equipment?: Equipment
  equipmentList?: Equipment[]
  movementPattern?: MovementPattern
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
  return {
    ...DEFAULT_CUSTOM_EXERCISE,
    name: input.name.trim(),
    muscle_groups: [...new Set(muscleGroups)],
    equipment: [...new Set(equipment.length ? equipment : DEFAULT_CUSTOM_EXERCISE.equipment)],
    movement_pattern: [input.movementPattern ?? DEFAULT_CUSTOM_EXERCISE.movement_pattern[0]],
  }
}

// The catalog is small enough to fetch once and filter client-side for typeahead.
export const listExercises = () =>
  api.get<{ exercises: ExerciseResponse[] }>('/exercises').then((r) => r.exercises)

export const createCustomExercise = (input: CreateCustomExerciseInput) =>
  api.post<ExerciseResponse>('/exercises', customExerciseBody(input))
