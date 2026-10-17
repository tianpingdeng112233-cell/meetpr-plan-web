import { request } from './client'

export type ApplicationDevice = 'iphone' | 'android' | 'both'
export interface CoachApplicationInput { name: string; email: string; contact: string; student_count: number; device: ApplicationDevice }
export interface CoachApplication extends CoachApplicationInput {
  id: string; status: 'pending' | 'approved' | 'rejected'; user_id: string | null; created_at: string
}
export const submitCoachApplication = (body: CoachApplicationInput) => request<{ id: string; receipt_email_sent: boolean }>('/coach-applications', { method: 'POST', body, auth: false, retryRateLimit: false })
export const resendCoachApplication = (email: string) => request<void>('/coach-applications/resend', { method: 'POST', body: { email }, auth: false, retryRateLimit: false })
export const setCoachPassword = (email: string, token: string, newPassword: string) => request<void>('/auth/email/reset', { method: 'POST', body: { email, token, newPassword }, auth: false, retryRateLimit: false })
export const getPublicInvite = (code: string) => request<{ valid: boolean; coach_display_name: string | null }>(`/public/invites/${encodeURIComponent(code)}`, { auth: false, retryRateLimit: false })
export const getCoachApplications = () => request<{ applications: CoachApplication[] }>('/admin/coach-applications', { retryRateLimit: false }).then(r => r.applications)
export const reviewCoachApplication = (id: string, action: 'approve' | 'reject' | 'resend') => request<{ welcome_email_sent?: boolean; result_email_sent?: boolean }>(`/admin/coach-applications/${encodeURIComponent(id)}/${action}`, { method: 'POST', retryRateLimit: false })
