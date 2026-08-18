import { resolveLocale } from './locale'
import { enApp, zhApp } from './strings-app'
import { enAuth, zhAuth } from './strings-auth'
import { enCommon, zhCommon } from './strings-common'
import { enCatalog, zhCatalog } from './strings-catalog'
import { enEditor, zhEditor } from './strings-editor'
import { enWorkspace, zhWorkspace } from './strings-workspace'
import { enChat, zhChat } from './strings-chat'
import { enStats, zhStats } from './strings-stats'
import { enAdmin, zhAdmin } from './strings-admin'
import { enVideo, zhVideo } from './strings-video'
import type { Translations } from './types'

const zh = {
  app: zhApp,
  common: zhCommon,
  auth: zhAuth,
  catalog: zhCatalog,
  editor: zhEditor,
  workspace: zhWorkspace,
  chat: zhChat,
  stats: zhStats,
  admin: zhAdmin,
  video: zhVideo,
} as const

const en = {
  app: enApp,
  common: enCommon,
  auth: enAuth,
  catalog: enCatalog,
  editor: enEditor,
  workspace: enWorkspace,
  chat: enChat,
  stats: enStats,
  admin: enAdmin,
  video: enVideo,
} satisfies Translations<typeof zh>

type Strings = Translations<typeof zh>

function currentStrings(): Strings {
  return resolveLocale() === 'zh' ? zh : en
}

export const S = new Proxy({} as Strings, {
  get: (_target, key: keyof Strings) => currentStrings()[key],
})

export function localizedRecord<Key extends string>(
  keys: Record<Key, string>,
  current: () => Record<Key, string>,
): Record<Key, string> {
  return new Proxy(keys, {
    get: (_target, key: Key) => current()[key],
  })
}

export function localizedArray(
  keys: readonly string[],
  current: () => readonly string[],
): string[] {
  return new Proxy([...keys], {
    get: (_target, key) => Reflect.get(current(), key),
  })
}

const monthDay = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' })

function parseDate(value: string): Date {
  const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (!dateOnly) return new Date(value)
  return new Date(Number(dateOnly[1]), Number(dateOnly[2]) - 1, Number(dateOnly[3]))
}

export const fmt = {
  parseDate,
  exerciseName(exercise: { name: string; name_en?: string | null }): string {
    return resolveLocale() === 'en' ? exercise.name_en ?? exercise.name : exercise.name
  },
  monthDay(date: Date, zhValue: () => string): string {
    return resolveLocale() === 'en' ? monthDay.format(date) : zhValue()
  },
  number(value: number, maximumFractionDigits = 1): string {
    return value.toLocaleString(resolveLocale() === 'zh' ? 'zh-CN' : 'en-US', { maximumFractionDigits })
  },
  decimal(value: number, digits = 1): string {
    return value.toLocaleString(resolveLocale() === 'zh' ? 'zh-CN' : 'en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits })
  },
}

export { resolveLocale, setLocale } from './locale'
export type { Locale } from './locale'
