import { api } from './client'
import type { CoachBindRequest, CoachStudent, ExerciseStatsDetail, ExerciseStatsOverview, InviteCode, StudentVideo } from './types'

export const getExerciseStatsOverview = (studentId: string) =>
  api.get<ExerciseStatsOverview>(`/coach/students/${studentId}/exercise-stats`)
export const getExerciseStats = (studentId: string, exerciseId: string) =>
  api.get<ExerciseStatsDetail>(`/coach/students/${studentId}/exercise-stats?exercise_id=${encodeURIComponent(exerciseId)}`)
export const getBindRequests = () =>
  api.get<{ bind_requests: CoachBindRequest[] }>('/coach/bind-requests').then((r) => r.bind_requests)
export const acceptBindRequest = (id: string) =>
  api.post(`/coach/bind-requests/${id}/accept`, { skip_evaluation: true })
export const rejectBindRequest = (id: string) =>
  api.post(`/coach/bind-requests/${id}/reject`, {})
export const getStudentVideos = (studentId: string) =>
  api.get<{ videos: StudentVideo[] }>(`/students/${studentId}/videos`).then((r) => r.videos)
export const getUploadUrl = (id: string) => api.get<{ url: string; expires_in: number }>(`/uploads/${id}/url`)
export const getInviteCodes = () => api.get<{ invite_codes: InviteCode[] }>('/coach/invite-codes').then((r) => r.invite_codes)
export const refreshCoachStudents = () => api.get<{ students: CoachStudent[] }>('/coach/students').then((r) => r.students)
