import aliasesData from '../../data/exercise-aliases.json'
import type {
  Equipment,
  ExerciseResponse,
  ExerciseType,
  LiftFamily,
  MovementPattern,
  MuscleGroup,
} from '../../api/types'
import { localizedRecord, S } from '../../i18n/strings'
import { zhCommon } from '../../i18n/strings-common'
import { STABLE_ZH } from '../../i18n/stable-zh'

export const EXERCISE_TYPE_LABEL = localizedRecord<ExerciseType>(
  zhCommon.exerciseType,
  () => S.common.exerciseType,
)

export const EXERCISE_TYPE_SHORT_LABEL = localizedRecord<ExerciseType>(
  zhCommon.exerciseTypeShort,
  () => S.common.exerciseTypeShort,
)

export const LIFT_FAMILY_LABEL = localizedRecord<LiftFamily>(
  zhCommon.liftFamily,
  () => S.common.liftFamily,
)

export const MUSCLE_LABEL = localizedRecord<MuscleGroup>(
  zhCommon.muscle,
  () => S.common.muscle,
)

export const EQUIPMENT_LABEL = localizedRecord<Equipment>(
  zhCommon.equipmentLabels,
  () => S.common.equipmentLabels,
)

export const MOVEMENT_PATTERN_LABEL = localizedRecord<MovementPattern>(
  zhCommon.movementPattern,
  () => S.common.movementPattern,
)

export const MUSCLE_OPTIONS = (Object.keys(MUSCLE_LABEL) as MuscleGroup[])
/** Stable head-to-toe order for compact target pickers (non-anatomical utilities last). */
export const TARGET_MUSCLE_ORDER: MuscleGroup[] = [
  'trap', 'shoulder', 'chest', 'back', 'biceps', 'triceps', 'forearm', 'grip',
  'core', 'hip', 'hip_flexor', 'glute', 'adductor', 'quad', 'hamstring',
  'calf', 'tibialis', 'mobility', 'cardio',
]
export const EQUIPMENT_OPTIONS = (Object.keys(EQUIPMENT_LABEL) as Equipment[])
export const MOVEMENT_PATTERN_OPTIONS = (Object.keys(MOVEMENT_PATTERN_LABEL) as MovementPattern[])
export const FAMILY_CATEGORIES: LiftFamily[] = ['squat', 'bench', 'deadlift']

const REGION_DEFINITIONS: { id: keyof typeof S.catalog.regions; muscles: MuscleGroup[] }[] = [
  { id: 'lower', muscles: ['quad', 'glute', 'hamstring', 'adductor', 'hip', 'hip_flexor', 'calf', 'tibialis'] },
  { id: 'push', muscles: ['chest', 'shoulder', 'triceps'] },
  { id: 'pull', muscles: ['back', 'biceps', 'trap', 'forearm', 'grip'] },
  { id: 'core', muscles: ['core', 'mobility', 'cardio'] },
]

export type CatalogCategory = 'all' | 'mine' | LiftFamily | MuscleGroup
export type CatalogRefine = 'all' | ExerciseType

export function isFamilyCategory(category: CatalogCategory): category is LiftFamily {
  return FAMILY_CATEGORIES.includes(category as LiftFamily)
}

export function categoryMatches(
  exercise: ExerciseResponse,
  category: CatalogCategory,
  custom = exercise.created_by_coach_id != null,
): boolean {
  if (category === 'all') return true
  if (category === 'mine') return custom
  if (isFamilyCategory(category)) return exercise.main_lift_family === category
  return exercise.exercise_type === 'accessory' && exercise.muscle_groups[0] === category
}

export function filterExercises(
  exercises: ExerciseResponse[],
  options: {
    category: CatalogCategory
    refine: CatalogRefine
    equipment: Equipment | 'all'
    query: string
    searchIds?: ReadonlySet<string>
    isCustom?: (exercise: ExerciseResponse) => boolean
  },
): ExerciseResponse[] {
  const searching = options.query.trim().length > 0
  return exercises.filter((exercise) => {
    if (options.equipment !== 'all' && !exercise.equipment.includes(options.equipment)) return false
    if (searching) return options.searchIds?.has(exercise.id) ?? false
    if (!categoryMatches(exercise, options.category, options.isCustom?.(exercise))) return false
    return options.refine === 'all' || exercise.exercise_type === options.refine
  })
}

export function availableMuscleRegions(exercises: ExerciseResponse[]) {
  const present = new Set(exercises
    .filter((exercise) => exercise.exercise_type === 'accessory')
    .map((exercise) => exercise.muscle_groups[0])
    .filter((muscle): muscle is MuscleGroup => muscle != null))
  return REGION_DEFINITIONS
    .map((region) => ({ ...region, label: S.catalog.regions[region.id], muscles: region.muscles.filter((muscle) => present.has(muscle)) }))
    .filter((region) => region.muscles.length > 0)
}

interface AliasEntry { alias: string; canonical: string }
const ALIASES = (aliasesData as { aliases: AliasEntry[] }).aliases

export function aliasesForExercise(exercise: ExerciseResponse): string[] {
  return ALIASES.filter((item) => item.canonical === exercise.name).map((item) => item.alias)
}

export function guessCatalogFields(rawName: string): {
  primaryMuscle: MuscleGroup
  equipment: Equipment
  movementPattern: MovementPattern
} {
  const name = rawName.toLowerCase()
  const patterns = STABLE_ZH.catalogGuess
  const equipment: Equipment =
    patterns.equipment.dumbbell.test(name) ? 'dumbbell'
      : patterns.equipment.barbell.test(name) ? 'barbell'
        : patterns.equipment.cable.test(name) ? 'cable'
          : patterns.equipment.band.test(name) ? 'band'
            : patterns.equipment.machine.test(name) ? 'machine'
              : patterns.equipment.kettlebell.test(name) ? 'kettlebell'
                : patterns.equipment.specialty_bar.test(name) ? 'specialty_bar'
                  : 'bodyweight'
  const primaryMuscle: MuscleGroup =
    patterns.muscle.core.test(name) ? 'core'
      : patterns.muscle.chest.test(name) ? 'chest'
        : patterns.muscle.back.test(name) ? 'back'
          : patterns.muscle.shoulder.test(name) ? 'shoulder'
            : patterns.muscle.triceps.test(name) ? 'triceps'
              : patterns.muscle.biceps.test(name) ? 'biceps'
                : patterns.muscle.glute.test(name) ? 'glute'
                  : patterns.muscle.hamstring.test(name) ? 'hamstring'
                    : patterns.muscle.hip.test(name) ? 'hip'
                      : patterns.muscle.quad.test(name) ? 'quad'
                        : 'core'
  const movementPattern: MovementPattern =
    patterns.movement.squat.test(name) ? 'squat'
      : patterns.movement.hip_hinge.test(name) ? 'hip_hinge'
        : patterns.movement.horizontal_push.test(name) ? 'horizontal_push'
          : patterns.movement.vertical_push.test(name) ? 'vertical_push'
            : patterns.movement.horizontal_pull.test(name) ? 'horizontal_pull'
              : patterns.movement.vertical_pull.test(name) ? 'vertical_pull'
                : patterns.movement.warm_up.test(name) ? 'warm_up'
                  : 'other'
  return { primaryMuscle, equipment, movementPattern }
}
