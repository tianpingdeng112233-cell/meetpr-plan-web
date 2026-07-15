import aliasesData from '../../data/exercise-aliases.json'
import type {
  Equipment,
  ExerciseResponse,
  ExerciseType,
  LiftFamily,
  MovementPattern,
  MuscleGroup,
} from '../../api/types'

export const EXERCISE_TYPE_LABEL: Record<ExerciseType, string> = {
  main_lift: '主项',
  main_lift_variation: '主项变式',
  accessory: '辅助动作',
}

export const EXERCISE_TYPE_SHORT_LABEL: Record<ExerciseType, string> = {
  main_lift: '主项',
  main_lift_variation: '变式',
  accessory: '辅助',
}

export const LIFT_FAMILY_LABEL: Record<LiftFamily, string> = {
  squat: '深蹲',
  bench: '卧推',
  deadlift: '硬拉',
}

export const MUSCLE_LABEL: Record<MuscleGroup, string> = {
  adductor: '内收肌',
  back: '背',
  biceps: '二头',
  calf: '小腿',
  cardio: '心肺',
  chest: '胸',
  core: '核心',
  forearm: '前臂',
  glute: '臀',
  grip: '握力',
  hamstring: '腘绳肌',
  hip: '髋',
  hip_flexor: '髋屈肌',
  mobility: '灵活性',
  quad: '股四头',
  shoulder: '肩',
  tibialis: '胫骨前肌',
  trap: '斜方肌',
  triceps: '三头',
}

export const EQUIPMENT_LABEL: Record<Equipment, string> = {
  band: '弹力带',
  barbell: '杠铃',
  bodyweight: '徒手',
  cable: '绳索',
  dumbbell: '哑铃',
  kettlebell: '壶铃',
  machine: '器械',
  other: '其他',
  specialty_bar: '特殊杆',
}

export const MOVEMENT_PATTERN_LABEL: Record<MovementPattern, string> = {
  squat: '蹲',
  hip_hinge: '髋铰链',
  horizontal_push: '水平推',
  vertical_push: '垂直推',
  horizontal_pull: '水平拉',
  vertical_pull: '垂直拉',
  warm_up: '热身',
  other: '其他',
}

export const MUSCLE_OPTIONS = (Object.keys(MUSCLE_LABEL) as MuscleGroup[])
export const EQUIPMENT_OPTIONS = (Object.keys(EQUIPMENT_LABEL) as Equipment[])
export const MOVEMENT_PATTERN_OPTIONS = (Object.keys(MOVEMENT_PATTERN_LABEL) as MovementPattern[])
export const FAMILY_CATEGORIES: LiftFamily[] = ['squat', 'bench', 'deadlift']

const REGION_DEFINITIONS: { id: string; label: string; muscles: MuscleGroup[] }[] = [
  { id: 'lower', label: '辅助 · 下肢', muscles: ['quad', 'glute', 'hamstring', 'adductor', 'hip', 'hip_flexor', 'calf', 'tibialis'] },
  { id: 'push', label: '辅助 · 上肢推', muscles: ['chest', 'shoulder', 'triceps'] },
  { id: 'pull', label: '辅助 · 上肢拉', muscles: ['back', 'biceps', 'trap', 'forearm', 'grip'] },
  { id: 'core', label: '辅助 · 核心 / 其他', muscles: ['core', 'mobility', 'cardio'] },
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
    .map((region) => ({ ...region, muscles: region.muscles.filter((muscle) => present.has(muscle)) }))
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
  const equipment: Equipment =
    /哑铃|db|dumbbell/.test(name) ? 'dumbbell'
      : /杠铃|barbell/.test(name) ? 'barbell'
        : /绳索|龙门|cable/.test(name) ? 'cable'
          : /弹力|弹力带|band/.test(name) ? 'band'
            : /器械|machine|史密斯/.test(name) ? 'machine'
              : /壶铃|kettlebell/.test(name) ? 'kettlebell'
                : /安全杆|ssb|特殊杆/.test(name) ? 'specialty_bar'
                  : 'bodyweight'
  const primaryMuscle: MuscleGroup =
    /平板|支撑|腹|卷腹|核心|core|plank/.test(name) ? 'core'
      : /卧推|俯卧撑|胸|夹胸|chest|push.?up/.test(name) ? 'chest'
        : /划船|下拉|引体|背|row|pulldown|pull.?up/.test(name) ? 'back'
          : /肩|推举|侧平举|shoulder|press/.test(name) ? 'shoulder'
            : /三头|臂屈伸|triceps/.test(name) ? 'triceps'
              : /二头|弯举|biceps|curl/.test(name) ? 'biceps'
                : /臀|glute|臀推|髋推/.test(name) ? 'glute'
                  : /腘|腿弯举|hamstring/.test(name) ? 'hamstring'
                    : /髋|hip/.test(name) ? 'hip'
                      : /蹲|腿举|腿屈伸|quad|股四/.test(name) ? 'quad'
                        : 'core'
  const movementPattern: MovementPattern =
    /蹲|腿举|squat/.test(name) ? 'squat'
      : /硬拉|臀推|髋推|hinge|deadlift/.test(name) ? 'hip_hinge'
        : /卧推|俯卧撑|夹胸|horizontal.*push/.test(name) ? 'horizontal_push'
          : /推举|实力推|肩推|press/.test(name) ? 'vertical_push'
            : /划船|row/.test(name) ? 'horizontal_pull'
              : /下拉|引体|pulldown|pull.?up/.test(name) ? 'vertical_pull'
                : /热身|激活|warm/.test(name) ? 'warm_up'
                  : 'other'
  return { primaryMuscle, equipment, movementPattern }
}
