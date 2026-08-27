import type { Translations } from './types'

export const zhApp = {
  sampleStudent: '吕子豪',
  samplePlan: 'Monster · 力型兼备',
  exitSample: '← 退出样例',
  updateReadyTitle: 'MeetPR 网页已更新',
  updateWaitingForSave: '检测到未保存的输入内容。保存成功后页面会自动刷新；也可以先截图或复制内容，再立即刷新。',
  reloadNow: '立即刷新',
} as const

export const enApp = {
  sampleStudent: 'Sample athlete',
  samplePlan: 'Monster · Power and Strength',
  exitSample: '← Exit sample',
  updateReadyTitle: 'A MeetPR update is ready',
  updateWaitingForSave: 'There are unsaved plan edits. The page will refresh after they are saved, or you can copy them and refresh now.',
  reloadNow: 'Refresh now',
} satisfies Translations<typeof zhApp>
