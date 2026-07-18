import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ExerciseRow, Week } from './types'
import {
  clearDraftMirrorIfHash, createDraftMirrorWriter, DRAFT_MIRROR_PREFIX,
  draftContentHash, draftMirrorStorageKey, loadDraftMirror, saveDraftMirror,
  type DraftMirrorContent,
} from './draftMirror'

class MemoryStorage implements Storage {
  private values = new Map<string, string>()
  get length() { return this.values.size }
  clear() { this.values.clear() }
  getItem(key: string) { return this.values.get(key) ?? null }
  key(index: number) { return [...this.values.keys()][index] ?? null }
  removeItem(key: string) { this.values.delete(key) }
  setItem(key: string, value: string) { this.values.set(key, value) }
}

function row(note = ''): ExerciseRow {
  return {
    id: 'local-row', serverRowId: null, serverSortOrder: null, hasLogs: false, conflictMessage: null,
    exerciseId: 'exercise', name: '深蹲', ku: true, custom: false, isMain: true,
    aux: false, reps: '5', mode: 'kg', boxes: [{ val: '100', empty: false }], note,
  }
}

function content(note = ''): DraftMirrorContent {
  const weeks: Week[] = [{
    num: 1, num2: '01', range: '1/1 – 1/7', isCurrent: false, vol: '',
    days: Array.from({ length: 7 }, (_, dow) => ({
      dow, dowLabel: `周${dow + 1}`, dateLabel: `1/${dow + 1}`,
      rest: dow !== 0, rows: dow === 0 ? [row(note)] : [],
    })),
  }]
  return { weeks, planStartDate: '2026-01-01', weeksCount: 1 }
}

afterEach(() => vi.useRealTimers())

describe('local draft mirror storage', () => {
  it('debounces writes and stores the deterministic content hash', () => {
    vi.useFakeTimers()
    const storage = new MemoryStorage()
    const writer = createDraftMirrorWriter({
      planId: 'plan', delay: 800, storage,
      now: () => new Date('2026-07-18T10:00:00Z'),
    })

    writer.schedule(content('first'))
    vi.advanceTimersByTime(500)
    writer.schedule(content('latest'))
    vi.advanceTimersByTime(799)
    expect(storage.length).toBe(0)
    vi.advanceTimersByTime(1)

    const mirror = loadDraftMirror('plan', storage)
    expect(mirror?.content.weeks[0].days[0].rows[0].note).toBe('latest')
    expect(mirror?.contentHash).toBe(draftContentHash(content('latest')))
  })

  it('clears only when a successful save covered the same content hash', () => {
    const storage = new MemoryStorage()
    const first = content('saved snapshot')
    saveDraftMirror('plan', first, storage)

    expect(clearDraftMirrorIfHash('plan', draftContentHash(first), storage)).toBe(true)
    expect(loadDraftMirror('plan', storage)).toBeNull()

    const newer = content('typed during save')
    saveDraftMirror('plan', newer, storage)
    expect(clearDraftMirrorIfHash('plan', draftContentHash(first), storage)).toBe(false)
    expect(loadDraftMirror('plan', storage)?.contentHash).toBe(draftContentHash(newer))
  })

  it('ignores and removes damaged JSON or an unsupported version', () => {
    const storage = new MemoryStorage()
    storage.setItem(draftMirrorStorageKey('broken'), '{not json')
    expect(loadDraftMirror('broken', storage)).toBeNull()
    expect(storage.getItem(draftMirrorStorageKey('broken'))).toBeNull()

    storage.setItem(draftMirrorStorageKey('old'), JSON.stringify({ version: 0 }))
    expect(loadDraftMirror('old', storage)).toBeNull()
    expect(storage.getItem(draftMirrorStorageKey('old'))).toBeNull()
  })

  it('keeps only the five most recently written plan mirrors', () => {
    const storage = new MemoryStorage()
    for (let index = 0; index < 7; index++) {
      saveDraftMirror(
        `plan-${index}`,
        content(String(index)),
        storage,
        () => new Date(`2026-07-${String(index + 1).padStart(2, '0')}T10:00:00Z`),
      )
    }

    const keys = Array.from({ length: storage.length }, (_, index) => storage.key(index)!)
      .filter((key) => key.startsWith(DRAFT_MIRROR_PREFIX))
    expect(keys).toHaveLength(5)
    expect(loadDraftMirror('plan-0', storage)).toBeNull()
    expect(loadDraftMirror('plan-1', storage)).toBeNull()
    expect(loadDraftMirror('plan-6', storage)).not.toBeNull()
  })

  it('silently degrades when storage throws', () => {
    const storage = {
      get length(): number { throw new Error('blocked') },
      getItem(): string | null { throw new Error('blocked') },
      setItem(): void { throw new Error('quota') },
      removeItem(): void { throw new Error('blocked') },
      key(): string | null { throw new Error('blocked') },
      clear(): void { throw new Error('blocked') },
    } satisfies Storage
    expect(() => saveDraftMirror('plan', content(), storage)).not.toThrow()
    expect(loadDraftMirror('plan', storage)).toBeNull()
  })
})
