import { api } from './client'
import type {
  CoachStudent, StudentOnboardingProfile, PlanResponse, PlanWithChildren, PlanStatus,
  CreatePlanBody, CreatePlanExerciseBody, CreatePlanSetBody,
  BatchPlanDaysBody, PlanExerciseResponse, PlanSetResponse,
} from './types'

export const getCoachStudents = () =>
  api.get<{ students: CoachStudent[] }>('/coach/students').then((r) => r.students)

export const renameCoachStudent = (studentId: string, displayName: string) =>
  api.patch<CoachStudent>(`/coach/students/${studentId}`, { display_name: displayName })

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
  body: { name?: string; start_date?: string; end_date?: string; plan_weeks?: number; status?: 'completed' },
) => api.patch<PlanResponse>(`/plans/${planId}`, body)
export const deletePlan = (planId: string) => api.del<void>(`/plans/${planId}`)
export const publishPlan = (planId: string) => api.post<PlanResponse>(`/plans/${planId}/publish`)
/**
 * Persist an imported plan's past sessions as *assumed* completions. Assumed
 * records stay distinguishable from live logs (`assumed`/「导」tag) and DO count
 * toward rep-PR and e1RM baselines — only completion-rate stats exclude them
 * (spec 053 semantics).
 */
export const markImportedHistory = (planId: string) =>
  api.post<{
    plan_id: string
    created_set_logs: number
    existing_set_logs: number
    assumed: true
  }>(`/plans/${planId}/imported-history`, { confirm: true })

// nested tree mutations
export const deleteDay = (dayId: string) => api.del<void>(`/plans/days/${dayId}`)
export const batchDays = (planId: string, body: BatchPlanDaysBody) =>
  api.post<PlanWithChildren>(`/plans/${planId}/days/batch`, body)

export const createExercise = (dayId: string, body: CreatePlanExerciseBody) =>
  api.post<PlanExerciseResponse>(`/plans/days/${dayId}/exercises`, body)
export const deleteExercise = (exerciseId: string) => api.del<void>(`/plans/exercises/${exerciseId}`)

export const createSet = (exerciseId: string, body: CreatePlanSetBody) =>
  api.post<PlanSetResponse>(`/plans/exercises/${exerciseId}/sets`, body)
export const deleteSet = (setId: string) => api.del<void>(`/plans/sets/${setId}`)
