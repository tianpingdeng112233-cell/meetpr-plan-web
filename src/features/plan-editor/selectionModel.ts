import type { ExerciseRow, Week } from './types'
import {
  displayedRowIntensity,
  displayedWeightMode,
  inferredIntensityMode,
  isSingleValueIntensity,
  rowIntensity,
  rowIntensityBoxes,
  rowWeightBoxes,
} from './intensityModel'
import { trainingDayOrdinal } from './weekBandModel'
import { S, fmt } from '../../i18n/strings'

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
  const weightMode = displayedWeightMode(row)
  const visibleWeightBoxes = weightMode === 'fixed_weight' ? weightBoxes.slice(0, 1)
    : weightMode === 'per_set' ? weightBoxes
      : weightMode === 'weight_range' ? [null]
        : []
  const intensity = displayedRowIntensity(row)
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
    ...visibleWeightBoxes.map((_, setIndex): PlanCellSelection => ({
        weekNumber,
        dow,
        rowId: row.id,
        field: 'weight',
        setIndex,
      })),
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
  const name =
    fmt.exerciseName({ name: row.name, name_en: row.nameEn }).trim() || S.common.unnamedExercise
  switch (field) {
    case 'name': return S.editor.cellNameLabel(name)
    case 'sets': return S.editor.cellSetsLabel(name)
    case 'reps': return S.editor.cellRepsLabel(name)
    case 'intensity': return setIndex == null || inferredIntensityMode(row) === 'uniform'
      ? S.editor.cellIntensityLabel(name)
      : S.editor.cellSetIntensityLabel(setIndex + 1, name)
    case 'weight': {
      const mode = displayedWeightMode(row)
      const label = mode === 'fixed_weight' ? S.editor.fixedWeight
        : mode === 'weight_range' ? S.editor.weightRange
          : mode === 'bodyweight' ? S.common.bodyweight
            : S.editor.setWeight((setIndex ?? 0) + 1)
      return S.editor.cellWeightLabel(label, name)
    }
  }
}

function cellValue(row: ExerciseRow, field: PlanCellField, setIndex?: number): string {
  switch (field) {
    case 'name': return fmt.exerciseName({ name: row.name, name_en: row.nameEn }) || '/'
    case 'sets': return row.boxes.length > 0 ? S.common.countSets(row.boxes.length) : '/'
    case 'reps': return row.reps && row.reps !== '—' ? S.common.countReps(row.reps) : '/'
    case 'intensity': {
      if (row.mode === 'bodyweight') return 'BW'
      const intensity = displayedRowIntensity(row)
      if (!intensity) return '/'
      if (isSingleValueIntensity(intensity)) {
        const box = rowIntensityBoxes(row)[setIndex ?? 0]
        const value = !box || box.empty ? '—' : box.val
        if (intensity.mode === 'pct') return `${value}% 1RM`
        if (intensity.mode === 'rpe') return `RPE ${value}`
        return `RIR ${value}`
      }
      switch (intensity.mode) {
        case 'rpe_range': return `RPE ${intensity.value || '—'}–${intensity.high || '—'}`
        case 'weight_range':
        case 'fixed_weight': return '/'
      }
      return '/'
    }
    case 'weight': {
      const mode = displayedWeightMode(row)
      const intensity = rowIntensity(row)
      if (mode === 'bodyweight') return 'BW'
      if (mode === 'weight_range' && intensity?.mode === 'weight_range') {
        return `${intensity.value || '—'}–${intensity.high || '—'} kg`
      }
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
  const weightMode = displayedWeightMode(row)
  const visibleWeightCount = weightMode === 'fixed_weight' ? Math.min(1, weightBoxes.length)
    : weightMode === 'per_set' ? weightBoxes.length
      : weightMode === 'weight_range' ? 1
        : 0
  const intensity = displayedRowIntensity(row)
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
  const dayOrdinal = trainingDayOrdinal(week, day.dow)
  return {
    selection,
    reference: `${DAY_COLUMNS[dayIndex]}${rowNumber} · W${week.num2}`,
    label: `${dayOrdinal == null ? '' : `D${dayOrdinal} · `}${day.dowLabel} · ${cellLabel(row, selection.field, selection.setIndex)}`,
    value: cellValue(row, selection.field, selection.setIndex),
    row,
  }
}
