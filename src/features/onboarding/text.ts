import { resolveLocale } from '../../i18n/locale'
export const text = (zh: string, en: string) => resolveLocale() === 'zh' ? zh : en
export function errorText(error: unknown): string {
  const code = error && typeof error === 'object' && 'code' in error ? String(error.code) : ''
  const errors: Record<string, [string, string]> = {
    COACH_APPLICATION_EXISTS: ['这个邮箱已经提交过申请', 'This email has already submitted an application.'],
    COACH_APPLICATION_EMAIL_IS_STUDENT: ['该邮箱已是学员账号，请联系申请人改用别的邮箱；不会自动转换账号。', 'This email belongs to a student. Ask the applicant to use another email; no account is converted.'],
    COACH_APPLICATION_EMAIL_EXISTS: ['该邮箱已有账号，请核对账号后处理。', 'This email already has an account. Check it before proceeding.'],
    COACH_APPLICATION_REVIEWED: ['这条申请已处理，请刷新列表。', 'This application was already reviewed. Refresh the list.'],
    COACH_SETUP_COMPLETE: ['该教练已设置密码，可以直接登录。', 'This coach has already set a password and can sign in.'],
    AUTH_INVALID_RESET_CODE: ['设密码链接已过期或已使用，请重新发送。', 'This setup link has expired or was used. Request a new one.'],
    VALIDATION_ERROR: ['请检查填写内容后重试。', 'Check your details and try again.'],
  }
  if (errors[code]) return text(...errors[code])
  if (error && typeof error === 'object' && 'status' in error && error.status === 429) return text('操作太频繁，请稍后再试。', 'Too many attempts. Please try again later.')
  return text('暂时无法连接，请稍后重试。', 'Unable to connect. Please try again.')
}
