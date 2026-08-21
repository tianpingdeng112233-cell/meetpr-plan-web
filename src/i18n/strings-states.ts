import type { Translations } from './types'

export const zhStates = {
  retry: '重试',
  defaultContent: '内容',
  defaultExclusion: '并不代表这里没有数据',
  errorTitle: (content: string) => `${content}没能加载出来`,
  errorBody: (exclusion: string) => `网络或服务出了点问题，${exclusion}。`,
  stillFailing: '仍然失败？',
  signInAgain: '重新登录',
  clearFilters: '清除筛选',
  inlineFail: '失败',
} as const

export const enStates = {
  retry: 'Retry',
  defaultContent: 'Content',
  defaultExclusion: 'this does not mean there is no data here',
  errorTitle: (content: string) => `${content} could not be loaded`,
  errorBody: (exclusion: string) => `There was a network or service problem; ${exclusion}.`,
  stillFailing: 'Still not working?',
  signInAgain: 'Sign in again',
  clearFilters: 'Clear filters',
  inlineFail: 'Failed',
} satisfies Translations<typeof zhStates>
