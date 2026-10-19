import { batchDays, getPlan } from '../../api/plans'
import type { BatchPlanDayBody, PlanWithChildren } from '../../api/types'
import { syncPlanScheduleToWeeks } from './mapping'
import { reconcilePlan, type ReconcileOptions, type SaveProgress, type SaveResult } from './reconcile'
import type { Week } from './types'

export interface BlockSaveOptions extends ReconcileOptions {
  /** IDs explicitly removed with Delete / Delete day in this editor session. */
  deletedDayIds?: readonly string[]
}

/** Keep reconciliation unchanged: it owns prescriptions, while this adapter persists
 * explicit empty day cards through the same batch endpoint after reconciliation.
 * A fresh version check prevents an empty-card write from racing another editor.
 */
export async function saveBlockPlan(planId: string, weeks: Week[], onProgress?: SaveProgress, options: BlockSaveOptions = {}): Promise<SaveResult> {
  const hasEmptyCard = weeks.some(week => week.days.some(day => !day.rows.length && !day.rest))
  if (options.published && hasEmptyCard) throw new Error('EMPTY_TRAINING_DAY')
  // The page may still show draft after another client has published it.
  if (hasEmptyCard && (await getPlan(planId)).status === 'published') throw new Error('EMPTY_TRAINING_DAY')
  const result = await reconcilePlan(planId, weeks, onProgress, options)
  const hasSavedEmptyCard = result.weeks.some(week => week.days.some(day => !day.rows.length && day.serverDayId))
  if (!hasEmptyCard && !hasSavedEmptyCard && !options.deletedDayIds?.length) return result
  const server = await getPlan(planId)
  if (hasEmptyCard && server.status === 'published') throw new Error('EMPTY_TRAINING_DAY')
  const upsertDays: BatchPlanDayBody[] = []
  for (const week of weeks) for (const day of week.days) {
    // A retained server identity can belong to a moved-away day; only an
    // explicit empty card requests creation at an otherwise missing slot.
    if (day.rows.length || day.rest) continue
    if (!server.days.some(saved => saved.week_number === week.num && saved.day_of_week === day.dow + 1)) {
      upsertDays.push({ week_number: week.num, day_of_week: day.dow + 1, sort_order: day.dow, exercises: [] })
    }
  }
  const explicitDeletes = new Set(options.deletedDayIds)
  const deleteDayIds = server.days.filter(saved => explicitDeletes.has(saved.id)
    && !saved.completed_at && saved.exercises.length === 0).map(day => day.id)
  if (!upsertDays.length && !deleteDayIds.length) return { ...result, weeks: syncEmptyCards(result.weeks, server) }
  let live = server
  // Match the existing backend's bounded batch size. Each retry re-reads the tree.
  for (let offset = 0; offset < Math.max(1, upsertDays.length); offset += 100) {
    const body = {
      expected_updated_at: live.updated_at,
      delete_day_ids: offset === 0 ? deleteDayIds : [],
      upsert_days: upsertDays.slice(offset, offset + 100),
    }
    live = await batchDays(planId, body)
  }
  return { ...result, changedDays: result.changedDays + upsertDays.length + deleteDayIds.length,
    weeks: syncEmptyCards(result.weeks, live) }
}

// A server empty day retained by the explicit-delete policy is still a real
// card and must participate in review/publish checks after saving.
function syncEmptyCards(weeks: Week[], server: PlanWithChildren): Week[] {
  const emptyIds = new Set(server.days.filter(day => day.exercises.length === 0).map(day => day.id))
  return syncPlanScheduleToWeeks(weeks, server).map(week => ({ ...week,
    days: week.days.map(day => day.serverDayId && emptyIds.has(day.serverDayId) ? { ...day, rest: false } : day),
  }))
}
