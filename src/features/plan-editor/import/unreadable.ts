import type { AIWeek, SourceCell, UnreadableExercise } from '../../../api/planImports'
import { S } from '../../../i18n/strings'
import type { SheetCell } from './sheets'

export function sharesSource(left: SourceCell[], right: SourceCell[]): boolean {
  return left.some(([r, c]) => right.some(([row, col]) => row === r && col === c))
}

export function unreadableMessage(week: AIWeek, item: UnreadableExercise, cells: SheetCell[]): string {
  const original = item.source_cells.map(([r, c]) => cells.find(cell => cell[0] === r && cell[1] === c)?.[2] ?? '').filter(Boolean).join(' ')
  const day = item.weekday === null ? `Day ${item.day_index}` : S.common.weekdaysMondayFirst[item.weekday]
  const exercise = week.days.find(d => d.day_index === item.day_index)?.exercises.find(e => sharesSource(e.source_cells ?? [], item.source_cells))
  const kind = exercise?.intensity_kind ?? (/\brpe\b/i.test(original) ? 'rpe' : /\brir\b/i.test(original) ? 'rir' : /%|百分比/.test(original) ? 'pct' : 'intensity')
  const reason = item.reason === 'SETS_VALUES_MISMATCH'
    ? S.sheetImport.unreadableMismatch(item.detail.sets, item.detail.got, S.sheetImport.unreadableTracks[item.detail.track === 'weight' ? 'weight' : kind])
    : item.reason === 'INVALID_NUMBER' ? S.sheetImport.unreadableInvalid(item.detail.value) : S.sheetImport.unreadableReasons[item.reason]
  return `W${week.index + 1} ${day} · ${original} —— ${reason}`
}

/** Unreadable source rows never become prescriptions or custom exercises. */
export function readableWeek(week: AIWeek): AIWeek {
  if (!week.unreadable?.length) return week
  return { ...week, days: week.days.map(day => ({ ...day, exercises: day.exercises.filter(exercise =>
    !week.unreadable!.some(item => item.day_index === day.day_index && sharesSource(exercise.source_cells ?? [], item.source_cells)),
  ) })) }
}
