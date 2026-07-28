import type { ExerciseRow, Week } from './types'

export const DAY_COLUMNS = ['A', 'B', 'C', 'D', 'E', 'F', 'G'] as const

export type PlanCellField = 'name' | 'sets' | 'reps' | 'intensity'

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
  return [
    { weekNumber, dow, rowId: row.id, field: 'name' },
    { weekNumber, dow, rowId: row.id, field: 'sets' },
    { weekNumber, dow, rowId: row.id, field: 'reps' },
    ...row.boxes.map((_, setIndex): PlanCellSelection => ({
      weekNumber,
      dow,
      rowId: row.id,
      field: 'intensity',
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
    && (left.field !== 'intensity' || left.setIndex === right.setIndex)
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
    case 'intensity': return `第 ${(setIndex ?? 0) + 1} 组强度 · ${row.name.trim() || '未命名动作'}`
  }
}

function cellValue(row: ExerciseRow, field: PlanCellField, setIndex?: number): string {
  switch (field) {
    case 'name': return row.name || '/'
    case 'sets': return row.boxes.length > 0 ? `${row.boxes.length} 组` : '/'
    case 'reps': return row.reps && row.reps !== '—' ? `${row.reps} 次` : '/'
    case 'intensity': {
      // Bodyweight cells intentionally carry empty boxes: the grid renders
      // those boxes as BW, so resolve the mode before the generic empty guard.
      if (row.mode === 'bodyweight') return 'BW'
      const box = row.boxes[setIndex ?? -1]
      if (!box || box.empty || box.val.trim() === '') return '/'
      if (row.mode === 'kg') return `${box.val} kg`
      if (row.mode === 'rpe') return `RPE ${box.val}`
      return '/'
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
  if (
    selection.field === 'intensity'
    && (selection.setIndex == null || selection.setIndex < 0 || selection.setIndex >= row.boxes.length)
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
