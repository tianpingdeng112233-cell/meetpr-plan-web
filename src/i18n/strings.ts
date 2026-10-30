import { enImport, zhImport } from './strings-import'

import { traditionalExerciseName } from './exercise-names'
import { zhHant } from './strings-zh-hant'
import { enBlock, zhBlock } from './strings-block'
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
import { enStates, zhStates } from './strings-states'
import type { Translations } from './types'

const zh = {
  sheetImport: zhImport,
  block: zhBlock,
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
  states: zhStates,
} as const

const en = {
  sheetImport: enImport,
  block: enBlock,
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
  states: enStates,
} satisfies Translations<typeof zh>

type Strings = Translations<typeof zh>

function currentStrings(): Strings {
  return resolveLocale() === 'zh-Hant' ? zhHant : resolveLocale() === 'zh' ? zh : en
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
  exerciseName(exercise: { name: string; name_en?: string | null; custom?: boolean; created_by_coach_id?: string | null }): string {
    if (resolveLocale() === 'en') return exercise.name_en ?? exercise.name
    // DTOs without ownership carry server-localized display names (backend 052).
    // A name match alone cannot distinguish a same-named custom exercise.
    const system = exercise.custom !== true && exercise.created_by_coach_id == null
      && (exercise.custom === false || exercise.created_by_coach_id === null)
    if (resolveLocale() === 'zh-Hant' && system) {
      return traditionalExerciseName(exercise.name)
    }
    return exercise.name
  },
  monthDay(date: Date, zhValue: () => string): string {
    return resolveLocale() === 'en' ? monthDay.format(date) : zhValue()
  },
  number(value: number, maximumFractionDigits = 1): string {
    return value.toLocaleString(resolveLocale() === 'en' ? 'en-US' : 'zh-CN', { maximumFractionDigits })
  },
  decimal(value: number, digits = 1): string {
    return value.toLocaleString(resolveLocale() === 'en' ? 'en-US' : 'zh-CN', { minimumFractionDigits: digits, maximumFractionDigits: digits })
  },
}

export { resolveLocale, setLocale } from './locale'
export type { Locale } from './locale'
