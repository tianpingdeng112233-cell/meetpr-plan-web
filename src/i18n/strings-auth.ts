import type { Translations } from './types'

export const zhAuth = {
  invalidPhoneCredentials: '手机号或密码不正确',
  enterValidPhoneCredentials: '请填写正确的手机号和密码',
  enterValidEmailCredentials: '请填写正确的邮箱和密码',
  invalidEmailCredentials: '邮箱或密码不正确',
  coachOnly: '该账号不是教练，无法编写计划',
  backendUnavailable: '无法连接后端，请稍后再试',
  title: '登录编写学员计划',
  accountLabel: '手机号或邮箱 / Phone or email',
  accountPlaceholder: '手机号或邮箱 / Phone or email',
  previewSample: '用样例数据预览（不连后端）',
  loginFailed: (code: string) => `登录失败（${code}）`,
} as const

export const enAuth = {
  invalidPhoneCredentials: 'Incorrect phone number or password',
  enterValidPhoneCredentials: 'Enter a valid phone number and password',
  enterValidEmailCredentials: 'Enter a valid email address and password',
  invalidEmailCredentials: 'Incorrect email address or password',
  coachOnly: 'This account is not a coach account and cannot create plans',
  backendUnavailable: 'Unable to connect. Try again later.',
  title: 'Sign in to create athlete plans',
  accountLabel: 'Phone or email',
  accountPlaceholder: 'Phone or email',
  previewSample: 'Preview with sample data (offline)',
  loginFailed: (code) => `Sign-in failed (${code})`,
} satisfies Translations<typeof zhAuth>
