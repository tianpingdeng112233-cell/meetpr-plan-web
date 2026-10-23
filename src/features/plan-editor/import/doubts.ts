import { rowSetGridSignature, type ImportDoubt, type Week } from '../types'

// Legacy snapshots retain their wire shape; only these kinds require editor review.
export function activeImportDoubts(doubts?: readonly ImportDoubt[]): ('inferred' | 'empty_week')[] {
  return doubts?.filter((kind): kind is 'inferred' | 'empty_week' => kind === 'inferred' || kind === 'empty_week') ?? []
}

export const countImportDoubts = (weeks: Week[]): number => weeks.reduce((count, week) => count
  + week.days.reduce((n, day) => n + day.rows.filter(row => activeImportDoubts(row.importDoubts).length).length, 0)
  + (activeImportDoubts(week.importDoubts).length && !week.days.some(day => day.rows.length) ? 1 : 0), 0)

export function withoutImportDoubts(weeks: Week[]): Week[] {
  return weeks.map(week => ({ ...week, importDoubts: undefined, days: week.days.map(day => ({ ...day, rows: day.rows.map(row => ({ ...row, importDoubts: undefined })) })) }))
}
/** Content edits clear inherited review flags; loading a snapshot supplies its own flags. */
export function clearEditedDoubts(previous: Week[], next: Week[]): Week[] {
  // Ordinary editor changes keep their object identity; only imported metadata needs work.
  if (!next.some(week => activeImportDoubts(week.importDoubts).length || week.days.some(day => day.rows.some(row => activeImportDoubts(row.importDoubts).length)))) return next
  return next.map(week => {
    const old = previous.find(w => w.num === week.num)
    const rows = new Map(old?.days.flatMap(d => d.rows.map(r => [r.id, r] as const)))
    return { ...week,
      importDoubts: week.days.some(d => d.rows.length) ? week.importDoubts?.filter(d => d !== 'empty_week') : week.importDoubts,
      days: week.days.map(day => ({ ...day, rows: day.rows.map(row => {
        const before = rows.get(row.id)
        const changed = before && (before.name !== row.name || before.exerciseId !== row.exerciseId || before.note !== row.note || before.isMain !== row.isMain || rowSetGridSignature(before) !== rowSetGridSignature(row))
        return changed && row.importDoubts === before.importDoubts ? { ...row, importDoubts: undefined } : row
      }) })),
    }
  })
}
