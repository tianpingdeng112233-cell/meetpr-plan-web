import type { Translations } from './types'

export const zhApp = {
  sampleStudent: '吕子豪',
  samplePlan: 'Monster · 力型兼备',
  exitSample: '← 退出样例',
} as const

export const enApp = {
  sampleStudent: 'Sample athlete',
  samplePlan: 'Monster · Power and Strength',
  exitSample: '← Exit sample',
} satisfies Translations<typeof zhApp>
