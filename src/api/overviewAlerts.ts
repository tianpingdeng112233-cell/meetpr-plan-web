import { api } from './client'

export type TrainingAlert =
  | { type: 'rpe_over'; date: string; plan_day_id: string; plan_exercise_id: string; exercise_id: string; set_index: number; target_rpe: string; actual_rpe: string }
  | { type: 'incomplete'; date: string; plan_day_id: string; plan_exercise_id: string; exercise_id: string; set_index: number; reason: 'missing' | 'failed' }
  | { type: 'behind'; recommended_date: string; plan_day_id: string; week_number: number }
export interface OverviewAlerts {
  generated_at: string
  plan_ending: { student_id: string; plan_id: string; plan_name: string; end_date: string; days_left: number }[]
  training: { student_id: string; latest_at: string; items: TrainingAlert[] }[]
}
export const getOverviewAlerts = () => api.get<OverviewAlerts>('/coach/overview-alerts')
export const markPlanViewed = (studentId: string) => api.post<void>(`/coach/students/${studentId}/plan-viewed`, {})
