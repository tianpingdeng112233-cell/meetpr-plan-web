import { act } from 'react'

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

/** Existing editor regressions enter the new edit state through its public gesture. */
export function openBlockDay(host: HTMLElement, week = 1, dow?: number): HTMLElement {
  const selector = `[data-block-week="${week}"]${dow == null ? '' : `[data-dow="${dow}"]`}`
  const cell = host.querySelector<HTMLElement>(selector)
  if (!cell) throw new Error(`Block cell missing: ${selector}`)
  if (!cell.classList.contains('is-editing')) act(() => cell.click())
  return cell
}

import type { ExerciseRow, Week } from './types'
import { relabelWeeksForStartDate } from './mapping'
export function blockRow(id: string, overrides: Partial<ExerciseRow> = {}): ExerciseRow {
  return { id, name: id, serverRowId: null, serverSortOrder: null, hasLogs: false, conflictMessage: null,
    exerciseId: id, ku: true, custom: false, isMain: true, aux: false, reps: '3', mode: 'kg',
    boxes: [{ val: '120', empty: false }], note: '', ...overrides }
}
export function blockWeeks(patterns: number[][], count = 1): Week[] {
  return relabelWeeksForStartDate(patterns.map((pattern, i) => ({
    num: i + 1, num2: String(i + 1).padStart(2, '0'), range: '', isCurrent: i === 0, vol: '',
    days: Array.from({ length: 7 }, (_, dow) => ({ dow, dowLabel: '', dateLabel: '', rest: !pattern.includes(dow),
      rows: pattern.includes(dow) ? Array.from({ length: count }, (_, r) => blockRow(`w${i + 1}-${dow}-${r}`)) : [] })),
  })), '2026-10-19')
}
export function blockCell(host: HTMLElement, week: number, dx: number): HTMLElement {
  const cell = host.querySelector<HTMLElement>(`[data-block-week="${week}"][data-dx="${dx}"]`)
  if (!cell) throw new Error(`Missing W${week}D${dx + 1}`)
  return cell
}
export async function blockKey(key: string, modifiers: KeyboardEventInit = {}): Promise<void> {
  await act(async () => { window.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...modifiers })); await Promise.resolve() })
}
