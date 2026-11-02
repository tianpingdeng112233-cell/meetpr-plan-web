import type { ExerciseRow } from './types'

export type EditorClipboard = { text: string } & (
  | { kind: 'row' | 'day'; rows: ExerciseRow[] }
  | { kind: 'days'; days: { offset: number; rows: ExerciseRow[] }[] }
)

const STORAGE_KEY = 'meetpr.planEditor.clipboard'
type ClipboardStorage = Pick<Storage, 'getItem' | 'setItem'>

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isBoxes(value: unknown): boolean {
  return Array.isArray(value) && value.every(box => isRecord(box)
    && typeof box.val === 'string' && typeof box.empty === 'boolean')
}

function isRows(value: unknown): value is ExerciseRow[] {
  return Array.isArray(value) && value.every(row => isRecord(row)
    && typeof row.id === 'string' && typeof row.name === 'string'
    && row.serverRowId === null && row.serverSortOrder === null && row.hasLogs === false
    && row.conflictMessage === null
    && (row.exerciseId === null || typeof row.exerciseId === 'string')
    && ['ku', 'custom', 'isMain', 'aux'].every(key => typeof row[key] === 'boolean')
    && typeof row.reps === 'string' && typeof row.note === 'string'
    && ['kg', 'rpe', 'bodyweight'].includes(row.mode as string)
    && isBoxes(row.boxes)
    && (row.intensityBoxes === undefined || isBoxes(row.intensityBoxes))
    && (row.intensity == null || (isRecord(row.intensity)
      && ['pct', 'rpe', 'rir', 'weight_range', 'rpe_range', 'fixed_weight'].includes(row.intensity.mode as string)
      && typeof row.intensity.value === 'string' && typeof row.intensity.high === 'string'))
    && (row.importDoubts === undefined || (Array.isArray(row.importDoubts)
      && row.importDoubts.every(item => typeof item === 'string')))
    && (row.opaqueSets === undefined || (Array.isArray(row.opaqueSets)
      && row.opaqueSets.every(set => isRecord(set)
        && typeof set.set_number === 'number' && typeof set.target_reps === 'number'
        && (set.target_reps_max === null || typeof set.target_reps_max === 'number')
        && typeof set.set_type === 'string'
        && (set.rest_seconds === null || typeof set.rest_seconds === 'number')
        && (set.coach_note === null || typeof set.coach_note === 'string')))))
}

function parseClipboard(raw: string | null): EditorClipboard | null {
  if (!raw) return null
  try {
    const value: unknown = JSON.parse(raw)
    if (!isRecord(value) || value.version !== 1 || !isRecord(value.content)) return null
    const content = value.content
    if (typeof content.text !== 'string') return null
    if ((content.kind === 'row' || content.kind === 'day') && isRows(content.rows)) {
      return { kind: content.kind, text: content.text, rows: content.rows }
    }
    if (content.kind === 'days' && Array.isArray(content.days)
      && content.days.every(day => isRecord(day) && Number.isInteger(day.offset)
        && (day.offset as number) >= 0 && isRows(day.rows))) {
      return content as EditorClipboard
    }
  } catch { /* malformed data is an empty clipboard, not a storage outage */ }
  return null
}

/** One copy per browser tab; a new store can recover it after a page reload. */
export function createClipboardStore(storage: () => ClipboardStorage = () => window.sessionStorage) {
  let memory: EditorClipboard | null = null
  let memoryOnly = false
  return {
    read(): EditorClipboard | null {
      if (memory !== null) return memory
      if (!memoryOnly) {
        try {
          const raw = storage().getItem(STORAGE_KEY)
          memory = parseClipboard(raw)
        } catch { memoryOnly = true }
      }
      return memory
    },
    write(content: EditorClipboard): void {
      memory = content
      if (!memoryOnly) {
        try { storage().setItem(STORAGE_KEY, JSON.stringify({ version: 1, content })) }
        catch { memoryOnly = true }
      }
    },
  }
}

export const clipboardStore = createClipboardStore()
