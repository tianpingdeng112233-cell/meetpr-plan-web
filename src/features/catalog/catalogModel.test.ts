import { describe, expect, it } from 'vitest'
import type { ExerciseResponse } from '../../api/types'
import { availableMuscleRegions, categoryMatches, filterExercises, guessCatalogFields } from './catalogModel'

function exercise(id: string, partial: Partial<ExerciseResponse> = {}): ExerciseResponse {
  return {
    id,
    name: id,
    name_en: null,
    exercise_type: 'accessory',
    main_lift_family: null,
    is_competition_lift: false,
    muscle_groups: ['core'],
    equipment: ['bodyweight'],
    movement_pattern: ['other'],
    competition_stance: null,
    created_by_coach_id: null,
    created_at: '2026-07-13T00:00:00.000Z',
    ...partial,
  }
}

describe('catalog model', () => {
  const rows = [
    exercise('squat', { exercise_type: 'main_lift', main_lift_family: 'squat', muscle_groups: ['quad'], equipment: ['barbell'] }),
    exercise('pause-squat', { exercise_type: 'main_lift_variation', main_lift_family: 'squat', muscle_groups: ['quad'], equipment: ['barbell'] }),
    exercise('split-squat', { muscle_groups: ['quad', 'glute'], equipment: ['dumbbell'] }),
    exercise('hip-thrust', { muscle_groups: ['glute', 'hamstring'], equipment: ['barbell'], created_by_coach_id: 'coach-1' }),
  ]

  it('uses the main muscle only for accessory navigation', () => {
    expect(categoryMatches(rows[2], 'quad')).toBe(true)
    expect(categoryMatches(rows[2], 'glute')).toBe(false)
    expect(categoryMatches(rows[0], 'quad')).toBe(false)
  })

  it('lets search pierce category and refine while retaining equipment filtering', () => {
    const searchIds = new Set(['squat', 'split-squat'])
    expect(filterExercises(rows, {
      category: 'mine',
      refine: 'accessory',
      equipment: 'barbell',
      query: '深蹲',
      searchIds,
    }).map((item) => item.id)).toEqual(['squat'])
  })

  it('builds only populated accessory muscle groups', () => {
    const regions = availableMuscleRegions(rows)
    expect(regions.flatMap((region) => region.muscles)).toEqual(['quad', 'glute'])
  })

  it('reuses the custom-exercise name heuristics', () => {
    expect(guessCatalogFields('史密斯箭步蹲')).toEqual({
      primaryMuscle: 'quad',
      equipment: 'machine',
      movementPattern: 'squat',
    })
  })
})
