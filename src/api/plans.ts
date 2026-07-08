import { api } from './client'
import type {
  CoachStudent, StudentOnboardingProfile, PlanResponse, PlanWithChildren, PlanStatus,
  CreatePlanBody, CreatePlanDayBody, CreatePlanExerciseBody, CreatePlanSetBody,
  PlanDayResponse, PlanExerciseResponse, PlanSetResponse,
} from './types'

export const getCoachStudents = () =>
  api.get<{ students: CoachStudent[] }>('/coach/students').then((r) => r.students)

export const getStudentOnboarding = (studentId: string) =>
  api.get<StudentOnboardingProfile>(`/students/${studentId}/onboarding`)

export const getStudentPlans = (studentId: string, status?: PlanStatus[]) => {
  const q = status?.length ? `?status=${status.join(',')}` : ''
  return api.get<{ plans: PlanResponse[] }>(`/students/${studentId}/plans${q}`).then((r) => r.plans)
}

export const getPlan = (planId: string) => api.get<PlanWithChildren>(`/plans/${planId}`)

export const createPlan = (body: CreatePlanBody) => api.post<PlanResponse>('/plans', body)
export const patchPlan = (
  planId: string,
  body: { name?: string; start_date?: string; end_date?: string; plan_weeks?: number },
) => api.patch<PlanResponse>(`/plans/${planId}`, body)
export const publishPlan = (planId: string) => api.post<PlanResponse>(`/plans/${planId}/publish`)

// nested tree mutations
export const createDay = (planId: string, body: CreatePlanDayBody) =>
  api.post<PlanDayResponse>(`/plans/${planId}/days`, body)
export const deleteDay = (dayId: string) => api.del<void>(`/plans/days/${dayId}`)

export const createExercise = (dayId: string, body: CreatePlanExerciseBody) =>
  api.post<PlanExerciseResponse>(`/plans/days/${dayId}/exercises`, body)
export const deleteExercise = (exerciseId: string) => api.del<void>(`/plans/exercises/${exerciseId}`)

export const createSet = (exerciseId: string, body: CreatePlanSetBody) =>
  api.post<PlanSetResponse>(`/plans/exercises/${exerciseId}/sets`, body)
export const deleteSet = (setId: string) => api.del<void>(`/plans/sets/${setId}`)
