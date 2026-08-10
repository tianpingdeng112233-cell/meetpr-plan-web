import type { Week } from './types'
import { isRestDay } from './types'

export const DRAFT_MIRROR_VERSION = 2
export const DRAFT_MIRROR_PREFIX = 'meetpr.planEditor.draftMirror.'
export const DRAFT_MIRROR_LIMIT = 5
export const DRAFT_MIRROR_DELAY = 800

export interface DraftMirrorContent {
  weeks: Week[]
  planStartDate: string | null
  weeksCount: number
}

export interface DraftMirror {
  version: typeof DRAFT_MIRROR_VERSION
  planId: string
  savedAt: string
  contentHash: string
  content: DraftMirrorContent
}

type MirrorStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem' | 'key' | 'length'>

function browserStorage(): MirrorStorage | null {
  if (typeof window === 'undefined') return null
  try {
    return window.localStorage
  } catch {
    return null
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

const LOAD_MODES = new Set(['pct', 'rpe', 'rir', 'weight_range', 'rpe_range', 'fixed_weight'])

function isIntensity(value: unknown): boolean {
  return value === null || (
    isRecord(value)
    && typeof value.mode === 'string'
    && LOAD_MODES.has(value.mode)
    && typeof value.value === 'string'
    && typeof value.high === 'string'
  )
}

function isWeek(value: unknown): value is Week {
  if (!isRecord(value) || typeof value.num !== 'number' || typeof value.num2 !== 'string'
    || typeof value.range !== 'string' || typeof value.isCurrent !== 'boolean'
    || typeof value.vol !== 'string' || !Array.isArray(value.days)) return false
  return value.days.every((day) => {
    if (!isRecord(day) || typeof day.dow !== 'number' || typeof day.dowLabel !== 'string'
      || typeof day.dateLabel !== 'string' || typeof day.rest !== 'boolean'
      || !Array.isArray(day.rows)) return false
    if (day.releasedSortOrders !== undefined
      && (!Array.isArray(day.releasedSortOrders) || !day.releasedSortOrders.every((item) => typeof item === 'number'))) return false
    return day.rows.every((row) => (
      isRecord(row)
      && typeof row.id === 'string'
      && (row.serverRowId === null || typeof row.serverRowId === 'string')
      && (row.serverSortOrder === null || typeof row.serverSortOrder === 'number')
      && typeof row.hasLogs === 'boolean'
      && (row.conflictMessage === null || typeof row.conflictMessage === 'string')
      && (row.exerciseId === null || typeof row.exerciseId === 'string')
      && typeof row.name === 'string'
      && typeof row.ku === 'boolean'
      && typeof row.custom === 'boolean'
      && typeof row.isMain === 'boolean'
      // v1 mirrors written before spec-037 v1.1 have no target key; parseMirror
      // upgrades them to the new explicit null default after hash verification.
      && (row.target === undefined || row.target === null || typeof row.target === 'string')
      && typeof row.aux === 'boolean'
      && typeof row.reps === 'string'
      && (row.mode === 'kg' || row.mode === 'rpe' || row.mode === 'bodyweight')
      && (row.intensity === undefined || isIntensity(row.intensity))
      && (row.intensityMode === undefined || row.intensityMode === 'uniform' || row.intensityMode === 'per_set')
      && (row.intensityBoxes === undefined || (
        Array.isArray(row.intensityBoxes)
        && row.intensityBoxes.every((box) => isRecord(box) && typeof box.val === 'string' && typeof box.empty === 'boolean')
      ))
      && (row.weightMode === undefined || row.weightMode === 'uniform' || row.weightMode === 'per_set')
      && Array.isArray(row.boxes)
      && row.boxes.every((box) => isRecord(box) && typeof box.val === 'string' && typeof box.empty === 'boolean')
      && typeof row.note === 'string'
    ))
  })
}

function isContent(value: unknown): value is DraftMirrorContent {
  return isRecord(value)
    && Array.isArray(value.weeks)
    && value.weeks.every(isWeek)
    && (value.planStartDate === null || typeof value.planStartDate === 'string')
    && Number.isInteger(value.weeksCount)
    && (value.weeksCount as number) >= 0
}

/**
 * Hash only editable plan meaning. Reconcile legitimately replaces row ids and
 * lock/order bookkeeping; those changes must not make fully-covered content
 * look different from the local snapshot that produced it.
 */
function canonicalContent(content: DraftMirrorContent): unknown {
  return {
    planStartDate: content.planStartDate,
    weeksCount: content.weeksCount,
    weeks: content.weeks.map((week) => ({
      num: week.num,
      days: week.days.map((day) => ({
        dow: day.dow,
        rest: isRestDay(day),
        rows: day.rows.map((row) => ({
          exerciseId: row.exerciseId,
          name: row.name,
          ku: row.ku,
          custom: row.custom,
          isMain: row.isMain,
          target: row.target,
          aux: row.aux,
          reps: row.reps,
          mode: row.mode,
          intensity: row.intensity == null ? row.intensity : {
            mode: row.intensity.mode,
            value: row.intensity.value,
            high: row.intensity.high,
          },
          intensityMode: row.intensityMode,
          intensityBoxes: row.intensityBoxes?.map((box) => ({ val: box.val, empty: box.empty })),
          weightMode: row.weightMode,
          boxes: row.boxes.map((box) => ({ val: box.val, empty: box.empty })),
          note: row.note,
        })),
      })),
    })),
  }
}

/** The exact editable-content projection used by shipped v1 mirrors. */
function legacyCanonicalContent(content: DraftMirrorContent): unknown {
  return {
    planStartDate: content.planStartDate,
    weeksCount: content.weeksCount,
    weeks: content.weeks.map((week) => ({
      num: week.num,
      days: week.days.map((day) => ({
        dow: day.dow,
        rest: day.rest,
        rows: day.rows.map((row) => ({
          exerciseId: row.exerciseId,
          name: row.name,
          ku: row.ku,
          custom: row.custom,
          isMain: row.isMain,
          aux: row.aux,
          reps: row.reps,
          mode: row.mode,
          intensity: row.intensity == null ? row.intensity : {
            mode: row.intensity.mode,
            value: row.intensity.value,
            high: row.intensity.high,
          },
          intensityMode: row.intensityMode,
          intensityBoxes: row.intensityBoxes?.map((box) => ({ val: box.val, empty: box.empty })),
          weightMode: row.weightMode,
          boxes: row.boxes.map((box) => ({ val: box.val, empty: box.empty })),
          note: row.note,
        })),
      })),
    })),
  }
}

function contentHash(canonical: unknown): string {
  const input = JSON.stringify(canonical)
  let hash = 0x811c9dc5
  for (let index = 0; index < input.length; index++) {
    hash ^= input.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193)
  }
  return `fnv1a32:${(hash >>> 0).toString(16).padStart(8, '0')}`
}

/** Small deterministic non-cryptographic signature for equality/corruption checks. */
export function draftContentHash(content: DraftMirrorContent): string {
  return contentHash(canonicalContent(content))
}

export function draftMirrorStorageKey(planId: string): string {
  return `${DRAFT_MIRROR_PREFIX}${planId}`
}

function removeQuietly(storage: Pick<Storage, 'removeItem'>, key: string): void {
  try { storage.removeItem(key) } catch { /* localStorage is optional safety only */ }
}

function normalizeContent(content: DraftMirrorContent): DraftMirrorContent {
  return {
    ...content,
    weeks: content.weeks.map((week) => ({
      ...week,
      days: week.days.map((day) => ({
        ...day,
        rest: isRestDay(day),
        rows: day.rows.map((row) => ({ ...row, target: row.target ?? null })),
      })),
    })),
  }
}

interface ParsedMirror {
  mirror: DraftMirror
  rewrite: boolean
}

function parseMirror(raw: string, expectedPlanId?: string): ParsedMirror | null {
  try {
    const parsed: unknown = JSON.parse(raw)
    if (!isRecord(parsed)
      || (parsed.version !== 1 && parsed.version !== DRAFT_MIRROR_VERSION)
      || typeof parsed.planId !== 'string'
      || (expectedPlanId !== undefined && parsed.planId !== expectedPlanId)
      || typeof parsed.savedAt !== 'string'
      || !Number.isFinite(Date.parse(parsed.savedAt))
      || typeof parsed.contentHash !== 'string'
      || !isContent(parsed.content)) return null
    const rawContent = parsed.content
    const expectedHash = parsed.version === 1
      ? contentHash(legacyCanonicalContent(rawContent))
      : draftContentHash(rawContent)
    if (expectedHash !== parsed.contentHash) return null
    const content = normalizeContent(rawContent)
    const mirror: DraftMirror = {
      version: DRAFT_MIRROR_VERSION,
      planId: parsed.planId,
      savedAt: parsed.savedAt,
      contentHash: draftContentHash(content),
      content,
    }
    return {
      mirror,
      rewrite: parsed.version === 1 || JSON.stringify(parsed.content) !== JSON.stringify(content),
    }
  } catch {
    return null
  }
}

function parseAndRewriteMirror(
  raw: string,
  storage: Pick<Storage, 'setItem'>,
  key: string,
  expectedPlanId?: string,
): DraftMirror | null {
  const parsed = parseMirror(raw, expectedPlanId)
  if (!parsed) return null
  if (parsed.rewrite) {
    try { storage.setItem(key, JSON.stringify(parsed.mirror)) } catch { /* keep the verified in-memory mirror */ }
  }
  return parsed.mirror
}

export function loadDraftMirror(
  planId: string | null | undefined,
  storage: MirrorStorage | null = browserStorage(),
): DraftMirror | null {
  if (!planId || !storage) return null
  const key = draftMirrorStorageKey(planId)
  try {
    const raw = storage.getItem(key)
    if (raw === null) return null
    const mirror = parseAndRewriteMirror(raw, storage, key, planId)
    if (!mirror) removeQuietly(storage, key)
    return mirror
  } catch {
    return null
  }
}

function evictOldMirrors(storage: MirrorStorage, keep = DRAFT_MIRROR_LIMIT): void {
  try {
    const mirrors: Array<{ key: string; savedAt: number }> = []
    for (let index = 0; index < storage.length; index++) {
      const key = storage.key(index)
      if (!key?.startsWith(DRAFT_MIRROR_PREFIX)) continue
      const raw = storage.getItem(key)
      const mirror = raw === null ? null : parseAndRewriteMirror(raw, storage, key)
      if (!mirror) {
        removeQuietly(storage, key)
        continue
      }
      mirrors.push({ key, savedAt: Date.parse(mirror.savedAt) })
    }
    mirrors.sort((a, b) => b.savedAt - a.savedAt)
    for (const mirror of mirrors.slice(keep)) removeQuietly(storage, mirror.key)
  } catch {
    // Enumeration can throw in privacy mode; editing must continue regardless.
  }
}

export function saveDraftMirror(
  planId: string | null | undefined,
  content: DraftMirrorContent,
  storage: MirrorStorage | null = browserStorage(),
  now: () => Date = () => new Date(),
): DraftMirror | null {
  if (!planId || !storage) return null
  try {
    const normalizedContent = normalizeContent(content)
    const mirror: DraftMirror = {
      version: DRAFT_MIRROR_VERSION,
      planId,
      savedAt: now().toISOString(),
      contentHash: draftContentHash(normalizedContent),
      content: normalizedContent,
    }
    const serialized = JSON.stringify(mirror)
    try {
      storage.setItem(draftMirrorStorageKey(planId), serialized)
    } catch {
      // Quota: make room by evicting the oldest other mirrors, then retry once.
      evictOldMirrors(storage, 1)
      storage.setItem(draftMirrorStorageKey(planId), serialized)
    }
    evictOldMirrors(storage)
    return mirror
  } catch {
    // Quota, disabled storage, cyclic data, and privacy mode all degrade silently.
    return null
  }
}

export function clearDraftMirror(
  planId: string | null | undefined,
  storage: Pick<Storage, 'removeItem'> | null = browserStorage(),
): void {
  if (!planId || !storage) return
  removeQuietly(storage, draftMirrorStorageKey(planId))
}

export function clearDraftMirrorIfHash(
  planId: string | null | undefined,
  contentHash: string,
  storage: MirrorStorage | null = browserStorage(),
): boolean {
  if (!planId || !storage) return false
  const mirror = loadDraftMirror(planId, storage)
  if (!mirror || mirror.contentHash !== contentHash) return false
  clearDraftMirror(planId, storage)
  return true
}

export function clearAllDraftMirrors(storage: MirrorStorage | null = browserStorage()): void {
  if (!storage) return
  try {
    const keys: string[] = []
    for (let index = 0; index < storage.length; index++) {
      const key = storage.key(index)
      if (key?.startsWith(DRAFT_MIRROR_PREFIX)) keys.push(key)
    }
    for (const key of keys) removeQuietly(storage, key)
  } catch {
    // Best-effort privacy cleanup must not make logout fail.
  }
}

export interface DraftMirrorWriter {
  schedule(content: DraftMirrorContent): void
  dropPendingIfHash(contentHash: string): void
  flush(): void
  cancel(): void
}

export function createDraftMirrorWriter({
  planId,
  delay = DRAFT_MIRROR_DELAY,
  storage = browserStorage(),
  now = () => new Date(),
}: {
  planId: string | null | undefined
  delay?: number
  storage?: MirrorStorage | null
  now?: () => Date
}): DraftMirrorWriter {
  let timer: ReturnType<typeof setTimeout> | null = null
  let pending: DraftMirrorContent | null = null

  const cancelTimer = () => {
    if (timer !== null) clearTimeout(timer)
    timer = null
  }
  const flush = () => {
    cancelTimer()
    if (!pending) return
    const content = pending
    pending = null
    saveDraftMirror(planId, content, storage, now)
  }
  return {
    schedule(content) {
      pending = content
      cancelTimer()
      timer = setTimeout(flush, delay)
    },
    dropPendingIfHash(contentHash) {
      if (pending && draftContentHash(pending) === contentHash) {
        pending = null
        cancelTimer()
      }
    },
    flush,
    cancel() {
      pending = null
      cancelTimer()
    },
  }
}
