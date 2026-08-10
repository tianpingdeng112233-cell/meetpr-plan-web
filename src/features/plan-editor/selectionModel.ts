import type { ExerciseRow, Week } from './types'
import { inferredIntensityMode, inferredWeightMode, isSingleValueIntensity, rowIntensity, rowIntensityBoxes, rowWeightBoxes } from './intensityModel'

export const DAY_COLUMNS = ['A', 'B', 'C', 'D', 'E', 'F', 'G'] as const

export type PlanCellField = 'name' | 'sets' | 'reps' | 'intensity' | 'weight'

export interface PlanCellSelection {
  weekNumber: number
  dow: number
  rowId: string
  field: PlanCellField
  setIndex?: number
}

export interface PlanCellInfo {
  selection: PlanCellSelection
  reference: string
  label: string
  value: string
  row: ExerciseRow
}

export type PlanCellMove = 'next' | 'previous' | 'up' | 'down'

export type RowDisplayTier = 'main' | 'aux'

/**
 * Returns the rows in the order presented inside a day. Tiered days render all
 * main rows first and all auxiliary rows second, while preserving source order
 * inside each section. Without a tier resolver the legacy flat order is kept.
 */
export function orderRowsForDisplay<T>(
  rows: readonly T[],
  resolveTier?: (row: T) => RowDisplayTier,
): T[] {
  if (!resolveTier) return [...rows]
  const main: T[] = []
  const aux: T[] = []
  for (const row of rows) {
    if (resolveTier(row) === 'main') main.push(row)
    else aux.push(row)
  }
  return [...main, ...aux]
}

export function samePlanCell(
  left: PlanCellSelection | null,
  right: PlanCellSelection | null,
): boolean {
  return left?.weekNumber === right?.weekNumber
    && left?.dow === right?.dow
    && left?.rowId === right?.rowId
    && left?.field === right?.field
    && left?.setIndex === right?.setIndex
}

export function planCellKey(selection: PlanCellSelection): string {
  return [
    selection.weekNumber,
    selection.dow,
    selection.rowId,
    selection.field,
    selection.setIndex ?? '',
  ].join(':')
}

function rowSelections(
  weekNumber: number,
  dow: number,
  row: ExerciseRow,
): PlanCellSelection[] {
  const weightBoxes = rowWeightBoxes(row)
  const visibleWeightBoxes = inferredWeightMode(row) === 'uniform' ? weightBoxes.slice(0, 1) : weightBoxes
  const intensity = rowIntensity(row)
  const visibleIntensityBoxes = isSingleValueIntensity(intensity)
    ? (inferredIntensityMode(row) === 'uniform' ? rowIntensityBoxes(row).slice(0, 1) : rowIntensityBoxes(row))
    : null
  return [
    { weekNumber, dow, rowId: row.id, field: 'name' },
    { weekNumber, dow, rowId: row.id, field: 'sets' },
    { weekNumber, dow, rowId: row.id, field: 'reps' },
    ...(visibleIntensityBoxes
      ? (visibleIntensityBoxes.length > 0 ? visibleIntensityBoxes : [null]).map((_, setIndex): PlanCellSelection => ({
        weekNumber, dow, rowId: row.id, field: 'intensity', setIndex,
      }))
      : [{ weekNumber, dow, rowId: row.id, field: 'intensity' } as PlanCellSelection]),
    ...(row.mode === 'bodyweight' ? [] : visibleWeightBoxes.map((_, setIndex): PlanCellSelection => ({
        weekNumber,
        dow,
        rowId: row.id,
        field: 'weight',
        setIndex,
      }))),
  ]
}

export function listPlanCells(weeks: readonly Week[]): PlanCellSelection[] {
  return weeks.flatMap((week) => week.days.flatMap((day) => (
    day.rows.flatMap((row) => rowSelections(week.num, day.dow, row))
  )))
}

function sameColumn(left: PlanCellSelection, right: PlanCellSelection): boolean {
  return left.field === right.field
    && (left.field !== 'weight' && left.field !== 'intensity' || left.setIndex === right.setIndex)
}

/**
 * Spreadsheet navigation over the stable selection model. Horizontal movement
 * follows every concrete cell in row order; vertical movement keeps the same
 * field/set column and skips rows that do not expose that intensity set.
 */
export function movePlanCell(
  weeks: readonly Week[],
  current: PlanCellSelection | null,
  move: PlanCellMove,
): PlanCellSelection | null {
  const cells = listPlanCells(weeks)
  if (cells.length === 0) return null
  if (!current) return move === 'previous' || move === 'up' ? cells[cells.length - 1] : cells[0]
  const index = cells.findIndex((cell) => samePlanCell(cell, current))
  if (index < 0) return cells[0]
  if (move === 'next') return cells[Math.min(cells.length - 1, index + 1)]
  if (move === 'previous') return cells[Math.max(0, index - 1)]
  const direction = move === 'down' ? 1 : -1
  for (let candidate = index + direction; candidate >= 0 && candidate < cells.length; candidate += direction) {
    if (sameColumn(cells[candidate], current)) return cells[candidate]
  }
  return cells[index]
}

function rowNumberInWeek(week: Week, dayIndex: number, rowIndex: number): number {
  return week.days
    .slice(0, dayIndex)
    .reduce((total, day) => total + day.rows.length, 0) + rowIndex + 1
}

function cellLabel(row: ExerciseRow, field: PlanCellField, setIndex?: number): string {
  switch (field) {
    case 'name': return `动作 · ${row.name.trim() || '未命名动作'}`
    case 'sets': return `组数 · ${row.name.trim() || '未命名动作'}`
    case 'reps': return `次数 · ${row.name.trim() || '未命名动作'}`
    case 'intensity': return `${setIndex == null || inferredIntensityMode(row) === 'uniform' ? '强度' : `第 ${setIndex + 1} 组强度`} · ${row.name.trim() || '未命名动作'}`
    case 'weight': return `${inferredWeightMode(row) === 'uniform' ? '统一重量' : `第 ${(setIndex ?? 0) + 1} 组重量`} · ${row.name.trim() || '未命名动作'}`
  }
}

function cellValue(row: ExerciseRow, field: PlanCellField, setIndex?: number): string {
  switch (field) {
    case 'name': return row.name || '/'
    case 'sets': return row.boxes.length > 0 ? `${row.boxes.length} 组` : '/'
    case 'reps': return row.reps && row.reps !== '—' ? `${row.reps} 次` : '/'
    case 'intensity': {
      if (row.mode === 'bodyweight') return 'BW'
      const intensity = rowIntensity(row)
      if (!intensity) return '/'
      if (isSingleValueIntensity(intensity)) {
        const box = rowIntensityBoxes(row)[setIndex ?? 0]
        const value = !box || box.empty ? '—' : box.val
        if (intensity.mode === 'pct') return `${value}% 1RM`
        if (intensity.mode === 'rpe') return `RPE ${value}`
        return `RIR ${value}`
      }
      switch (intensity.mode) {
        case 'weight_range': return `${intensity.value || '—'}–${intensity.high || '—'} kg`
        case 'rpe_range': return `RPE ${intensity.value || '—'}–${intensity.high || '—'}`
        case 'fixed_weight': return '固定重量'
      }
      return '/'
    }
    case 'weight': {
      const box = rowWeightBoxes(row)[setIndex ?? -1]
      if (!box || box.empty || box.val.trim() === '') return '/'
      return `${box.val} kg`
    }
  }
}

/**
 * Resolve a stable selection into its spreadsheet-like reference.
 * Row numbers are continuous within one week while columns follow the
 * week-local day order (A–G), matching the coach-web DAYL contract.
 */
export function resolvePlanCell(
  weeks: readonly Week[],
  selection: PlanCellSelection | null,
): PlanCellInfo | null {
  if (!selection) return null
  const week = weeks.find((candidate) => candidate.num === selection.weekNumber)
  if (!week) return null
  const dayIndex = week.days.findIndex((day) => day.dow === selection.dow)
  if (dayIndex < 0 || dayIndex >= DAY_COLUMNS.length) return null
  const day = week.days[dayIndex]
  const rowIndex = day.rows.findIndex((row) => row.id === selection.rowId)
  if (rowIndex < 0) return null
  const row = day.rows[rowIndex]
  const weightBoxes = rowWeightBoxes(row)
  const visibleWeightCount = inferredWeightMode(row) === 'uniform' ? Math.min(1, weightBoxes.length) : weightBoxes.length
  const intensity = rowIntensity(row)
  const visibleIntensityCount = isSingleValueIntensity(intensity)
    ? Math.max(1, inferredIntensityMode(row) === 'uniform' ? Math.min(1, row.boxes.length) : row.boxes.length)
    : null
  if (
    selection.field === 'weight'
    && (selection.setIndex == null || selection.setIndex < 0 || selection.setIndex >= visibleWeightCount)
  ) return null
  if (
    selection.field === 'intensity'
    && visibleIntensityCount != null
    && (selection.setIndex == null || selection.setIndex < 0 || selection.setIndex >= visibleIntensityCount)
  ) return null

  const rowNumber = rowNumberInWeek(week, dayIndex, rowIndex)
  return {
    selection,
    reference: `${DAY_COLUMNS[dayIndex]}${rowNumber} · W${week.num2}`,
    label: `${day.dowLabel} · ${cellLabel(row, selection.field, selection.setIndex)}`,
    value: cellValue(row, selection.field, selection.setIndex),
    row,
  }
}
