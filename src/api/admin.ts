import { api } from './client'
import type { PlanStatus } from './types'

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
