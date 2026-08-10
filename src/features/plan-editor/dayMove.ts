import type { DayCol, Week } from './types'
import { isRestDay } from './types'
import { addDays, dowLabel, mdLabel } from './mapping'

export const DAY_MOVE_STATUS_LOCKED_HINT = '已完成/已停用的计划不可移动训练日'
export const DAY_MOVE_LOGGED_HINT = '该日含学员已打卡动作，不可移动或交换'

/** Shared source/target guard for whole-day moves. */
export function dayMoveDisabledReason(day: DayCol, statusCalendarLocked: boolean): string | null {
  if (statusCalendarLocked) return DAY_MOVE_STATUS_LOCKED_HINT
  if (day.rows.some((row) => row.hasLogs)) return DAY_MOVE_LOGGED_HINT
  return null
}

/** Saving a moved day drops its plan_day_shifts row, so the shifted snapshot no longer applies. */
function clearShiftSnapshot(day: DayCol): DayCol {
  if (!day.shiftBadge) return day
  const original = addDays(day.shiftBadge.originalDate, 0)
  return {
    ...day,
    dowLabel: dowLabel(original),
    dateLabel: mdLabel(original),
    shiftedToDate: null,
    shiftBadge: null,
  }
}

/**
 * Move one day's content to another weekday without moving the weekday/date anchors.
 * An empty/rest target receives the source; a populated training target swaps content.
 */
export function moveDayInWeek(week: Week, fromDow: number, toDow: number): Week {
  if (fromDow === toDow) return week
  const source = week.days.find((day) => day.dow === fromDow)
  const target = week.days.find((day) => day.dow === toDow)
  if (!source || !target || dayMoveDisabledReason(source, false) || dayMoveDisabledReason(target, false)) {
    return week
  }
  if (source.rows.length === 0 && target.rows.length === 0) return week

  const targetHasTraining = !isRestDay(target)
  const nextSource: DayCol = clearShiftSnapshot(targetHasTraining
    ? { ...source, rest: false, rows: target.rows, releasedSortOrders: [] }
    : { ...source, rest: true, rows: [], releasedSortOrders: [] })
  const nextTarget: DayCol = clearShiftSnapshot({
    ...target,
    rest: isRestDay(source),
    rows: source.rows,
    releasedSortOrders: [],
  })

  return {
    ...week,
    days: week.days.map((day) => (
      day.dow === fromDow ? nextSource : day.dow === toDow ? nextTarget : day
    )),
  }
}
