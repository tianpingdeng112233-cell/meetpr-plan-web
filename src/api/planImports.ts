import { api } from './client'
import type { ImportSheet, SheetCell, SheetRegion } from '../features/plan-editor/import/sheets'
import type { LiftFamily } from './types'

export interface ImportStatus { enabled: boolean; daily_limit: number; remaining_today: number }
export interface OutlineWeek { index: number; label: string; start_date: string | null; training_days: number; region: SheetRegion }
export interface ImportOutline { import_id: string; sheet: string; truncated_rows: number; header_region: SheetRegion | null; weeks: OutlineWeek[] }
export type ImportFailureReason = 'MODEL_BUSY' | 'OUTPUT_TOO_LONG' | 'BAD_OUTPUT' | 'REGION_SUSPECT'
export interface AIExercise {
  name: string; sets: number; reps: string
  intensity_kind: 'rpe' | 'rir' | 'pct' | null
  intensity_values: string[]
  weight_values: string[]
  note: string
  family_guess: LiftFamily | null
  flags: ('note_fallback' | 'inferred')[]
}
export interface AIWeek { index: number; start_date: string | null; days: { weekday: number; rest: boolean; exercises: AIExercise[] }[] }
export interface FailedAIWeek { index: number; error: 'PARSE_FAILED'; reason: ImportFailureReason }
export type AIWeekResult = AIWeek | FailedAIWeek
export const getImportStatus = (traineeId: string) => api.get<ImportStatus>(`/coach/plan-imports/status?trainee_id=${encodeURIComponent(traineeId)}`, { retryRateLimit: false })
// Build explicit bodies: file metadata must never cross this boundary.
export const outlineImport = (input: { trainee_id: string; source: 'file' | 'paste'; sheets: ImportSheet[] }) =>
  api.post<ImportOutline>('/coach/plan-imports', {
    trainee_id: input.trainee_id, source: input.source,
    sheets: input.sheets.map(({ name, cells }) => ({ name, cells })),
  }, { retryRateLimit: false })
export const recognizeImportWeeks = (id: string, input: { weeks: { index: number; cells: SheetCell[] }[]; header_cells: SheetCell[] }) =>
  api.post<{ weeks: AIWeekResult[] }>(`/coach/plan-imports/${encodeURIComponent(id)}/weeks`, {
    weeks: input.weeks.map(({ index, cells }) => ({ index, cells })), header_cells: input.header_cells,
  }, { retryRateLimit: false })
