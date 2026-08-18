import { api } from './client'
import type { PlanDayResponse, PlanExerciseResponse, PlanStatus, PlanWithChildren } from './types'

// Includes 'admin': /admin/users and overview return the admin account itself.
export type AdminManagedRole = 'coach' | 'coached_student' | 'self_train_student' | 'admin'
export type AdminBindingStatus = 'accepted' | 'pending' | 'rejected' | 'expired' | 'cancelled'

export interface AdminOverviewResponse {
  stats: {
    coaches: number
    coachedStudents: number
    selfTrainStudents: number
    activeBonds: number
    publishedPlans: number
  }
  recentUsers: Array<{
    id: string
    displayName: string | null
    role: AdminManagedRole
    createdAt: string
  }>
  recentPlans: Array<{
    id: string
    name: string
    coachId: string | null
    coachName: string | null
    traineeId: string
    studentName: string | null
    publishedAt: string
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
  phone: string
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

export interface AdminPlan {
  id: string
  name: string
  coachId: string | null
  coachName: string | null
  traineeId: string
  studentName: string | null
  status: PlanStatus
  weeks: number
  startDate: string | null
  endDate: string | null
  createdAt: string
}

export interface AdminPlansResponse { plans: AdminPlan[] }

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
export const getAdminPlans = () => api.get<AdminPlansResponse>('/admin/plans')
export const getAdminExerciseUsage = () =>
  api.get<AdminExerciseUsageResponse>('/admin/exercise-usage')
// Admin plan detail carries display-ready exercise names: the admin cannot see
// coach-private catalog entries via /exercises, so the backend joins names in.
export type AdminPlanExercise = PlanExerciseResponse & { exercise_name: string; name_en?: string | null }
export type AdminPlanDay = Omit<PlanDayResponse, 'exercises'> & { exercises: AdminPlanExercise[] }
export type AdminPlanWithChildren = Omit<PlanWithChildren, 'days'> & { days: AdminPlanDay[] }

export const getAdminPlan = (planId: string) =>
  api.get<AdminPlanWithChildren>(`/admin/plans/${encodeURIComponent(planId)}`)
