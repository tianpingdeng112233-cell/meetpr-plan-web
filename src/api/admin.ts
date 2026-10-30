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
