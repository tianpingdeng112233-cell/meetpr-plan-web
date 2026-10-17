import { request } from './client'

export async function requestPasswordReset(email: string): Promise<void> {
  await request('/auth/email/forgot', {
    method: 'POST', body: { email }, auth: false, retryRateLimit: false,
  })
}

export async function resetPassword(email: string, code: string, newPassword: string): Promise<void> {
  await request('/auth/email/reset', {
    method: 'POST', body: { email, code, newPassword }, auth: false, retryRateLimit: false,
  })
}
