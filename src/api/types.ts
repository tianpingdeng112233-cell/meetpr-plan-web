// Wire types — mirror the MeetPR backend (src/routes/{auth,plans,exercises},
// src/handlers/coach-students). Decimals arrive as strings; keep them strings.

export type UserRole = 'coach' | 'coached_student' | 'self_train_student' | 'admin'
export type IntensityModeWire = 'weight' | 'rpe'
export type SetType = 'warmup' | 'working' | 'failed' | 'amrap' | 'backoff'
export type PlanStatus = 'draft' | 'published' | 'completed' | 'paused'

export interface AuthUser {
  id: string
  phone: string
  role: UserRole
  createdAt: string
  /** Not returned by /auth/login; optional until the backend provides GET /me. */
  display_name?: string | null
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
  rpe?: string | null
  viewed_at?: string | null
}
export type VideoMarkerLevel = 'info' | 'warn' | 'bad'
export interface VideoMarker {
  id: string
  video_id: string
  coach_id: string
  time_ms: number
  level: VideoMarkerLevel
  note: string
  created_at: string
}
export interface CreateVideoMarkerPayload {
  time_ms: number
  level: VideoMarkerLevel
  note: string
}
export interface CoachFeedbackPayload {
  student_id: string
  day_date: string
  plan_exercise_id: string | null
  video_id: string
  text: string
}
export interface CoachFeedbackResponse {
  id: string
  coach_id: string
  student_id: string
  day_date: string | null
  plan_exercise_id: string | null
  video_id: string | null
  text: string
  posted_at: string
  read_at: string | null
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

export interface ChatReadCursor {
  message_id: string
  seq: number
}

export interface ChatLastMessage {
  id: string
  seq: number
  kind: string
  preview: string
  created_at: string
  sender_id: string
}

export interface ChatConversation {
  id: string
  other_party: { id: string; display_name: string }
  last_message: ChatLastMessage | null
  last_message_at: string | null
  unread_count: number
  my_last_read: ChatReadCursor | null
  other_last_read: ChatReadCursor | null
}

export interface ChatSetRefV1 {
  v: 1
  exercise_name: string
  set_number: number
  weight_kg: string | null
  reps: number | null
  rpe: string | null
  day_date: string
  set_log_id: string
}

export interface ChatMessage {
  id: string
  conversation_id: string
  seq: number
  sender_id: string
  kind: 'text' | 'image' | (string & {})
  body: string | null
  attachment_id: string | null
  image_url: string | null
  image_expires_in: number | null
  set_ref: unknown | null
  video_url: string | null
  video_expires_in: number | null
  client_id: string
  created_at: string
}

export interface ChatMessagePage {
  messages: ChatMessage[]
  meta: {
    other_last_read: ChatReadCursor | null
    has_more: boolean
  }
}

export interface ChatReadState {
  my_last_read: ChatReadCursor
  unread_count: number
}

export type MessagesQuery =
  | { mode: 'latest'; limit?: number }
  | { mode: 'since'; seq: number; limit?: number }
  | { mode: 'before'; seq: number; limit?: number }

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
  total_shift_days: number
  latest_shift_created_at: string | null
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
  shifted_to_date: string | null
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

export interface BatchPlanSetBody {
  set_number: number
  target_reps: number
  target_reps_max: number | null
  intensity_mode: IntensityModeWire
  target_value: string
  set_type: SetType
  rest_seconds: number | null
  coach_note: string | null
}
export interface BatchPlanExerciseBody {
  exercise_id: string
  is_main_lift: boolean
  sort_order: number
  notes?: string | null
  sets: BatchPlanSetBody[]
}
export interface BatchPlanDayBody {
  week_number: number
  day_of_week: number
  sort_order: number
  exercises: BatchPlanExerciseBody[]
}
export interface BatchPlanDaysBody {
  plan_patch?: {
    name?: string
    start_date?: string
    end_date?: string
    plan_weeks?: number
  }
  delete_day_ids: string[]
  upsert_days: BatchPlanDayBody[]
}

export interface ApiError {
  error: string
  issues?: { path: (string | number)[]; message: string }[]
}
