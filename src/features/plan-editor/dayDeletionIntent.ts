/** Local edit metadata, separate from the plan tree and remote v3 snapshot. */
export interface ExplicitDayDeletion { id: string | null; weekNumber: number; dow: number }
const key = (planId: string) => `meetpr.plan-editor.day-deletions.${planId}`

export function saveDayDeletionIntent(planId: string, hash: string, days: ExplicitDayDeletion[]): void {
  try { localStorage.setItem(key(planId), JSON.stringify({ hash, days: days.map(({ id, weekNumber, dow }) => ({ id, weekNumber, dow })) })) } catch { /* Recovery must fail closed without evidence. */ }
}

export function loadDayDeletionIntent(planId: string, hash: string): ExplicitDayDeletion[] {
  try {
    const value = JSON.parse(localStorage.getItem(key(planId)) ?? 'null')
    if (value?.hash !== hash || !Array.isArray(value.days)) return []
    return value.days.filter((day: ExplicitDayDeletion) => day && typeof day.id === 'string'
      && Number.isInteger(day.weekNumber) && day.weekNumber > 0
      && Number.isInteger(day.dow) && day.dow >= 0 && day.dow < 7)
  } catch { return [] }
}

export function clearDayDeletionIntent(planId?: string, hash?: string): void {
  if (!planId) return
  try {
    if (hash && JSON.parse(localStorage.getItem(key(planId)) ?? 'null')?.hash !== hash) return
    localStorage.removeItem(key(planId))
  } catch { /* No storage means no recoverable deletion authorization. */ }
}
