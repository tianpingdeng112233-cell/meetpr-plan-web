import type { StudentPlanCursor } from '../mapping'
import { S } from '../../../i18n/strings'

export function StudentPlanCursorBadges({ cursor, compact = false }: {
  cursor: StudentPlanCursor | null | undefined
  compact?: boolean
}) {
  if (!cursor) return null

  if (cursor.kind === 'completed') {
    return (
      <span className={`student-cursor-badge completed${compact ? ' compact' : ''}`} data-student-cursor="completed">
        {S.common.completedAll}
      </span>
    )
  }

  const position = S.common.weekDayPosition(cursor.weekNumber, cursor.dayOrdinal)
  return (
    <span className="student-cursor-badges" data-student-cursor={position}>
      <span className={`student-cursor-badge progress${compact ? ' compact' : ''}`}>
        {S.common.progressTo(position)}
      </span>
      {cursor.lagDays > 0 && (
        <span className={`student-cursor-badge lagging${compact ? ' compact' : ''}`}>
          {S.common.laggingDays(cursor.lagDays)}
        </span>
      )}
    </span>
  )
}
