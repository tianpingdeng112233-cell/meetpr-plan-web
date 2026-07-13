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

export interface StudentOnboardingProfile {
  deadlift_style: 'conventional' | 'sumo' | null
  gender?: string | null
  birth_date?: string | null
  height_cm?: string | null
  weight_kg?: string | null
  training_years?: number | null
  squat_1rm_kg?: string | null
  bench_1rm_kg?: string | null
  deadlift_1rm_kg?: string | null
  squat_stance?: string | null
  bench_grip?: string | null
  training_days?: string[] | null
  injury_notes?: string | null
  injury_areas?: string[] | null
  is_competing?: boolean | null
  competition_date?: string | null
  target_weight_class?: string | null
  note_to_coach?: string | null
}

export interface ExerciseStatsOverview {
  exercises: { exercise_id: string; name: string; session_count: number; last_logged_at: string }[]
  one_rm: { squat: string | null; bench: string | null; deadlift: string | null }
  last_trained_at: string | null
  recent_4w: { trained_days: number; total_planned_days: number; completion_rate: number }
}
export interface ExerciseStatsDetail {
  rep_prs: { reps: number; weight_kg: string; logged_at: string; source: 'imported' | 'logged' }[]
  recent_sessions: { date: string; sets: { set_index: number; weight_kg: string; reps: number; rpe: string | null; completed: boolean; failed: boolean; assumed: boolean; has_video: boolean }[] }[]
  by_set_count: Record<string, { date: string; set_count: number; best_weight_kg: string; total_reps: number; completed_sets: number }[]>
  e1rm: { value: string; computed_at: string } | null
  one_rm_reference: string | null
}

export interface BindRequestOnboarding extends StudentOnboardingProfile {
  completed: boolean
  upload_count: number
}
export interface CoachBindRequest {
  id: string
  student_id: string
  display_name: string
  submitted_at: string
  expired_at: string
  masked_phone?: string | null
  invite_code?: string | null
  onboarding: BindRequestOnboarding
}
export interface StudentVideo {
  id: string
  set_log_id: string | null
  plan_exercise_id: string | null
  content_type: string
  size_bytes: number
  filename: string
  created_at: string
  logged_at: string | null
  exercise_name?: string | null
  set_index?: number | null
  weight_kg?: string | null
  reps?: number | null
  viewed_at?: string | null
}
export interface InviteCode {
  id: string
  code: string
  type: string
  revoked_at: string | null
  expires_at: string | null
  max_uses: number | null
  used_count: number
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
  /** backend spec 016; optional while production rolls out the new contract */
  has_logs?: boolean
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
  muscle_groups: MuscleGroup[]
  equipment: Equipment[]
  movement_pattern: MovementPattern[]
  competition_stance: string | null
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
