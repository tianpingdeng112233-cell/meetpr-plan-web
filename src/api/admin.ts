import { api } from './client'
import type { ExerciseResponse, PlanStatus } from './types'

// Includes 'admin': /admin/users and overview return the admin account itself.
export type AdminManagedRole = 'coach' | 'coached_student' | 'self_train_student' | 'admin'
export type AdminBindingStatus = 'accepted' | 'pending' | 'rejected' | 'expired' | 'cancelled'

export interface AdminOverviewResponse {
  stats: {
    coaches: number
    coachedStudents: number
    selfTrainStudents: number
    activeBonds: number
  }
  recentUsers: Array<{
    id: string
    displayName: string | null
    role: AdminManagedRole
    createdAt: string
  }>

}

export type AdminUserRelation =
  | { studentCount: number }
  | { coachId: string; coachName: string | null }
  | null

export interface AdminUser {
  id: string
  displayName: string | null
  role: AdminManagedRole
  phone: string | null
  email: string | null
  createdAt: string
  relation: AdminUserRelation
}

export interface AdminUsersResponse { users: AdminUser[] }

export interface AdminUserDetailResponse {
  user: AdminUser
  relations: Array<{
    userId: string
    displayName: string | null
    role: AdminManagedRole
    bondAcceptedAt: string
  }>
  plans: Array<{
    id: string
    name: string
    status: PlanStatus
    weeks: number
    createdAt: string
    coachName: string | null
    studentName: string | null
  }>
}

export interface AdminBinding {
  id: string
  coachId: string
  coachName: string | null
  studentId: string
  studentName: string | null
  status: AdminBindingStatus
  submittedAt: string
  respondedAt: string | null
}

export interface AdminBindingsResponse { bindings: AdminBinding[] }

export interface AdminExerciseUsage {
  exercise_id: string
  name: string
  name_en?: string | null
  exercise_type: string
  plan_count: number
  coach_count: number
}

export interface AdminExerciseUsageResponse { exercises: AdminExerciseUsage[] }

export const getAdminOverview = () => api.get<AdminOverviewResponse>('/admin/overview')
export const getAdminUsers = () => api.get<AdminUsersResponse>('/admin/users')
export const getAdminUser = (userId: string) =>
  api.get<AdminUserDetailResponse>(`/admin/users/${encodeURIComponent(userId)}`)
export const getAdminBindings = () => api.get<AdminBindingsResponse>('/admin/bindings')
export const getAdminExerciseUsage = () =>
  api.get<AdminExerciseUsageResponse>('/admin/exercise-usage')

// Wire shapes from backend spec 053. Official creation also accepts main lifts.
export type OfficialExerciseInput = Pick<ExerciseResponse, 'name' | 'name_en' | 'exercise_type' | 'main_lift_family' | 'is_competition_lift' | 'muscle_groups' | 'equipment' | 'movement_pattern'>
export interface CustomExerciseRow extends OfficialExerciseInput {
  exercise_id: string
  coach_id: string
  coach_name: string | null
  plan_count: number
}
export interface PendingExerciseGroup {
  key: string
  display_name: string
  coach_count: number
  plan_count: number
  rows: CustomExerciseRow[]
}
export interface AdoptedExerciseRow {
  exercise_id: string
  name: string
  coach_id: string
  coach_name: string | null
  plan_count: number
  adopted_at: string
}
export interface AdminCustomExercisesResponse {
  pending: PendingExerciseGroup[]
  adopted: Array<{ official: Pick<ExerciseResponse, 'id' | 'name' | 'name_en'>; rows: AdoptedExerciseRow[] }>
}
export const getAdminCustomExercises = () => api.get<AdminCustomExercisesResponse>('/admin/custom-exercises')
export type AdoptExercisesInput = { exercise_ids: string[] } & (
  | { target_exercise_id: string; new_official?: never }
  | { new_official: OfficialExerciseInput; target_exercise_id?: never }
)
// Consumers refresh the canonical lists; the success envelope is not specified further by 053.
export const adoptCustomExercises = (body: AdoptExercisesInput) => api.post<unknown>('/admin/custom-exercises/adopt', body)
export const unadoptCustomExercises = (exercise_ids: string[]) => api.post<unknown>('/admin/custom-exercises/unadopt', { exercise_ids })

// Spec 063 admin contract; NUMERIC values can arrive as strings from PostgreSQL.
export interface ListedCoachInput {
  name: string
  nickname: string
  gender: string
  douyin_handle: string
  douyin_url: string
  province: string
  city: string
  gyms: string[]
  teaching_mode: '线下' | '线上' | '线上+线下'
  best_total_kg: number | null
  competition_class: string | null
  equipment: '无装备' | '单层装备' | '多层装备' | null
  certifications: string | null
  coaching_years: number | null
}
export type ListedCoachStatus = 'pending' | 'published' | 'hidden' | 'rejected'
export interface AdminListedCoach extends Omit<ListedCoachInput, 'best_total_kg' | 'coaching_years'> {
  id: string
  status: ListedCoachStatus
  best_total_kg: number | string | null
  coaching_years: number | string | null
  rejection_reason: string | null
  submitted_by: string | null
  reviewed_by: string | null
  reviewed_at: string | null
  created_at: string
  updated_at: string
}
export interface CoachRosterImportResult {
  created: number
  updated: number
  skipped: number
  skips: Array<{ row: number; reason: 'example' | 'invalid_fields' }>
}
export interface AdminReviewReport {
  review_id: string
  listed_coach_id: string
  body: string
  deleted_at: string | null
  report_count: number
  first_reported_at: string
  age_seconds: number
  overdue: boolean
  reasons: Array<{ id: string; reason: 'abuse' | 'privacy' | 'advertising' | 'other'; explanation: string | null }>
}
export interface CoachReviewWord { id: string; word: string }

const coachReviewsPath = '/admin/coach-reviews'

export const importCoachRoster = (csv: string) => api.post<CoachRosterImportResult>(`${coachReviewsPath}/import`, { csv })

export const getAdminListedCoaches = (filters: { status?: ListedCoachStatus; q?: string } = {}) => {
  const query = new URLSearchParams()
  if (filters.status) query.set('status', filters.status)
  if (filters.q) query.set('q', filters.q)
  return api.get<{ coaches: AdminListedCoach[] }>(`${coachReviewsPath}/coaches${query.size ? `?${query}` : ''}`)
}

export const updateAdminListedCoach = (id: string, input: ListedCoachInput) => api.patch<AdminListedCoach>(`${coachReviewsPath}/coaches/${encodeURIComponent(id)}`, input)

export const setAdminListedCoachStatus = (id: string, status: 'published' | 'hidden') => api.post<AdminListedCoach>(`${coachReviewsPath}/coaches/${encodeURIComponent(id)}/status`, { status })

export const getAdminCoachSubmissions = () => api.get<{ coaches: AdminListedCoach[] }>(`${coachReviewsPath}/submissions`)

export const decideAdminCoachSubmission = (id: string, action: 'approve' | 'reject', reason?: string) => api.post<AdminListedCoach>(`${coachReviewsPath}/submissions/${encodeURIComponent(id)}/decision`, { action, ...(reason === undefined ? {} : { reason }) })

export const getAdminCoachReviewReports = () => api.get<{ reports: AdminReviewReport[] }>(`${coachReviewsPath}/reports`)

export const decideAdminCoachReviewReport = (reviewId: string, action: 'keep' | 'delete') => api.post<{ action: 'keep' | 'delete' }>(`${coachReviewsPath}/reports/${encodeURIComponent(reviewId)}/decision`, { action })

export const getAdminCoachReviewWords = () => api.get<{ words: CoachReviewWord[] }>(`${coachReviewsPath}/words`)

export const addAdminCoachReviewWord = (word: string) => api.post<CoachReviewWord>(`${coachReviewsPath}/words`, { word })

export const deleteAdminCoachReviewWord = (id: string) => api.del<void>(`${coachReviewsPath}/words/${encodeURIComponent(id)}`)
