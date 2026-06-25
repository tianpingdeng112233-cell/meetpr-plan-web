import { api } from './client'
import type { ExerciseResponse } from './types'

// The catalog is small enough to fetch once and filter client-side for typeahead.
export const listExercises = () =>
  api.get<{ exercises: ExerciseResponse[] }>('/exercises').then((r) => r.exercises)

export const createCustomExercise = (name: string, exerciseType = 'accessory') =>
  api.post<ExerciseResponse>('/exercises', { name, exercise_type: exerciseType })
