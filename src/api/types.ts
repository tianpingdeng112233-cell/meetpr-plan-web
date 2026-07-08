// Wire types — mirror the MeetPR backend (src/routes/{auth,plans,exercises},
// src/handlers/coach-students). Decimals arrive as strings; keep them strings.

export type UserRole = 'coach' | 'student'
export type IntensityModeWire = 'weight' | 'rpe'
export type SetType = 'warmup' | 'working' | 'failed' | 'amrap' | 'backoff'
export type PlanStatus = 'draft' | 'published' | 'completed' | 'paused'

export interface AuthUser {
  id: string
  phone: string
  role: UserRole
  createdAt: string
}
export interface LoginResponse {
  user: AuthUser
  accessToken: string
  refreshToken: string
}
export interface TokenPair {
  accessToken: string
  refreshToken: string
}

export interface CoachStudent {
  id: string
  display_name: string
  status: 'active' | 'in_evaluation'
  evaluation: { id: string; expected_end_at: string; overdue: boolean } | null
}

export interface PlanResponse {
  id: string
  coach_id: string | null
  trainee_id: string
  name: string
  start_date: string
  end_date: string
  plan_weeks: number
  source: string
  source_template_id: string | null
  status: PlanStatus
  kind: string
  created_at: string
  updated_at: string
}

export interface PlanSetResponse {
  id: string
  plan_exercise_id: string
  set_number: number
  target_reps: number
  target_reps_max: number | null
  intensity_mode: IntensityModeWire
  target_value: string
  set_type: SetType
  rest_seconds: number | null
  coach_note: string | null
  created_at: string
}
export interface PlanExerciseResponse {
  id: string
  plan_day_id: string
  exercise_id: string
  is_main_lift: boolean
  sort_order: number
  notes: string | null
  sets: PlanSetResponse[]
}
export interface PlanDayResponse {
  id: string
  plan_id: string
  day_of_week: number // 1..7
  week_number: number // 1..52
  sort_order: number
  exercises: PlanExerciseResponse[]
}
export interface PlanWithChildren extends PlanResponse {
  days: PlanDayResponse[]
}

export interface ExerciseResponse {
  id: string
  name: string
  name_en: string | null
  exercise_type: ExerciseType
  main_lift_family: LiftFamily | null
  is_competition_lift: boolean
  created_by_coach_id: string | null
  created_at: string
}

export type LiftFamily = 'squat' | 'bench' | 'deadlift'
export type ExerciseType = 'main_lift' | 'main_lift_variation' | 'accessory'
export type MuscleGroup =
  | 'adductor'
  | 'back'
  | 'biceps'
  | 'calf'
  | 'cardio'
  | 'chest'
  | 'core'
  | 'forearm'
  | 'glute'
  | 'grip'
  | 'hamstring'
  | 'hip'
  | 'hip_flexor'
  | 'mobility'
  | 'quad'
  | 'shoulder'
  | 'tibialis'
  | 'trap'
  | 'triceps'
export type Equipment =
  | 'band'
  | 'barbell'
  | 'bodyweight'
  | 'cable'
  | 'dumbbell'
  | 'kettlebell'
  | 'machine'
  | 'other'
  | 'specialty_bar'
export type MovementPattern =
  | 'squat'
  | 'hip_hinge'
  | 'horizontal_push'
  | 'vertical_push'
  | 'horizontal_pull'
  | 'vertical_pull'
  | 'warm_up'
  | 'other'

export interface CreateCustomExerciseBody {
  name: string
  exercise_type: 'accessory'
  main_lift_family: null
  is_competition_lift: false
  muscle_groups: MuscleGroup[]
  equipment: Equipment[]
  movement_pattern: MovementPattern[]
}

// ---- request bodies ----
export interface CreatePlanBody {
  trainee_id: string
  name: string
  start_date: string // YYYY-MM-DD
  end_date: string
  plan_weeks: number
  source: 'coach'
  kind?: 'regular'
}
export interface CreatePlanDayBody {
  day_of_week: number
  week_number: number
  sort_order: number
}
export interface CreatePlanExerciseBody {
  exercise_id: string
  is_main_lift: boolean
  sort_order: number
  notes?: string | null
}
export interface CreatePlanSetBody {
  set_number: number
  target_reps: number
  target_reps_max?: number | null
  intensity_mode: IntensityModeWire
  target_value: string
  set_type: SetType
  coach_note?: string | null
}

export interface ApiError {
  error: string
  issues?: { path: (string | number)[]; message: string }[]
}
