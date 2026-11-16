import { ApiException } from '../../api/client'
import { S } from '../../i18n/strings'

/** Only render the public conflict fields, never arbitrary error payloads. */
export function planOverlapMessage(error: unknown): string | null {
  if (!(error instanceof ApiException) || error.status !== 409 || error.code !== 'PLAN_DATES_OVERLAP') return null
  const conflicts = Array.isArray(error.details.conflicts) ? error.details.conflicts : []
  const names = conflicts.flatMap((conflict: unknown) => {
    if (!conflict || typeof conflict !== 'object') return []
    const { name, start_date, end_date } = conflict as Record<string, unknown>
    if (typeof name !== 'string' || typeof start_date !== 'string' || typeof end_date !== 'string') return []
    return [S.workspace.handoff.conflict(name, start_date, end_date)]
  })
  const days = error.details.required_shift_days
  return [S.workspace.handoff.overlap, ...names,
    ...(typeof days === 'number' && Number.isInteger(days) && days > 0 ? [S.workspace.handoff.requiredShift(days)] : []),
  ].join('\n')
}
