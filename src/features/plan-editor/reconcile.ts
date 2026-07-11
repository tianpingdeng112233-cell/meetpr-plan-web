// Save write-back for draft and published plans.
//
// Days without history keep the legacy whole-day replacement behavior. A day with
// even one logged exercise is reconciled exercise-by-exercise so the immutable rows
// and their set/history links are never touched.

import type { Week, DayCol, ExerciseRow, SetBox } from './types'
import { isContentfulUnbound } from './types'
import type {
  PlanWithChildren, PlanDayResponse, PlanExerciseResponse, CreatePlanSetBody,
  IntensityModeWire, SetType,
} from '../../api/types'
import {
  getPlan, createDay, deleteDay, createExercise, deleteExercise, createSet, patchPlan,
} from '../../api/plans'
import { ApiException } from '../../api/client'
import { addDays, type Catalog } from './mapping'

interface DesiredExercise {
  exercise_id: string
  is_main_lift: boolean
  notes: string | null
  sets: CreatePlanSetBody[]
}

interface DesiredEntry {
  row: ExerciseRow
  desired: DesiredExercise
}

export interface SaveResult {
  changedDays: number
  skippedRows: number
  /** Id/lock/order metadata after the live-baseline reconciliation. */
  weeks: Week[]
}

export interface ReconcileOptions {
  /** Used only for defensive published-import/calendar assertions. */
  published?: boolean
  /** Lets a scoped 409 restore the server row's display name as well as its wire content. */
  catalog?: Catalog
}

export class LockedRowMutationError extends Error {
  rowIds: string[]
  weeks: Week[]
  constructor(rowIds: string[], weeks: Week[]) {
    super('LOCKED_ROW_CHANGED')
    this.rowIds = rowIds
    this.weeks = weeks
  }
}

export class ReconcileConflict extends Error {
  code: string
  weeks: Week[]
  topMessage: string | null
  constructor(code: string, weeks: Week[], topMessage: string | null = null) {
    super(code)
    this.code = code
    this.weeks = weeks
    this.topMessage = topMessage
  }
}

function numStr(v: string): string {
  const n = Number(v)
  return Number.isNaN(n) ? v : String(n)
}

function fmtNum(v: string): string {
  const n = Number(v)
  return Number.isNaN(n) ? v : String(Number(n.toFixed(2)))
}

function parseReps(reps: string): { reps: number; amrap: boolean } {
  const amrap = reps.includes('+')
  const n = parseInt(reps, 10)
  return { reps: Number.isFinite(n) ? Math.min(Math.max(n, 1), 50) : 1, amrap }
}

/** A bound row -> desired backend exercise. Unbound rows (no exerciseId) -> null. */
function rowToDesired(row: ExerciseRow): DesiredExercise | null {
  if (!row.exerciseId) return null
  const mode: IntensityModeWire = row.mode === 'rpe' ? 'rpe' : 'weight'
  const filled = row.boxes.filter((b) => !b.empty && b.val !== '')
  const { reps, amrap } = parseReps(row.reps)
  const sets: CreatePlanSetBody[] = filled.map((b, i) => ({
    set_number: i + 1,
    target_reps: reps,
    intensity_mode: mode,
    target_value: numStr(b.val),
    set_type: (amrap && i === filled.length - 1 ? 'amrap' : 'working') as SetType,
  }))
  return { exercise_id: row.exerciseId, is_main_lift: row.isMain, notes: row.note || null, sets }
}

function canonDesiredOne(e: DesiredExercise): string {
  return JSON.stringify({
    x: e.exercise_id, m: e.is_main_lift, n: e.notes ?? '',
    s: e.sets.map((s) => [s.set_number, s.target_reps, s.intensity_mode, numStr(s.target_value), s.set_type]),
  })
}

function canonServerOne(e: PlanExerciseResponse): string {
  return JSON.stringify({
    x: e.exercise_id, m: e.is_main_lift, n: e.notes ?? '',
    s: [...e.sets].sort((a, b) => a.set_number - b.set_number)
      .map((s) => [s.set_number, s.target_reps, s.intensity_mode, numStr(s.target_value), s.set_type]),
  })
}

function canonDesired(exs: DesiredExercise[]): string {
  return JSON.stringify(exs.map((e) => JSON.parse(canonDesiredOne(e)) as unknown))
}

function canonServer(exs: PlanExerciseResponse[]): string {
  return JSON.stringify([...exs].sort((a, b) => a.sort_order - b.sort_order)
    .map((e) => JSON.parse(canonServerOne(e)) as unknown))
}

const EMPTY = '[]'

function fmtISO(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function cloneWeeks(weeks: Week[]): Week[] {
  return weeks.map((week) => ({
    ...week,
    days: week.days.map((day) => ({
      ...day,
      releasedSortOrders: day.releasedSortOrders ? [...day.releasedSortOrders] : undefined,
      rows: day.rows.map((row) => ({ ...row, boxes: row.boxes.map((box) => ({ ...box })) })),
    })),
  }))
}

function dayAt(weeks: Week[], weekNumber: number, dow: number): DayCol | undefined {
  return weeks.find((week) => week.num === weekNumber)?.days.find((day) => day.dow === dow)
}

function desiredEntries(day: DayCol | undefined, countSkipped: () => void): DesiredEntry[] {
  if (!day || day.rest) return []
  const entries: DesiredEntry[] = []
  for (const row of day.rows) {
    const desired = rowToDesired(row)
    if (desired) entries.push({ row, desired })
    else if (!row.hasLogs && isContentfulUnbound(row)) countSkipped()
  }
  return entries
}

/**
 * Two-stage identity reconciliation. Existing ids claim first; only then can a null/orphan
 * row content-match an unclaimed server row. This ordering is what makes duplicate canon
 * rows safe after a partial write.
 */
function claimBaseline(entries: DesiredEntry[], baseline: PlanExerciseResponse[]): Map<string, PlanExerciseResponse> {
  const byId = new Map(baseline.map((exercise) => [exercise.id, exercise]))
  const claimedIds = new Set<string>()
  const claims = new Map<string, PlanExerciseResponse>()

  for (const entry of entries) {
    if (!entry.row.serverRowId) continue
    const match = byId.get(entry.row.serverRowId)
    if (!match || claimedIds.has(match.id)) continue
    claims.set(entry.row.id, match)
    claimedIds.add(match.id)
  }

  const remaining = [...baseline].sort((a, b) => a.sort_order - b.sort_order)
  for (const entry of entries) {
    if (claims.has(entry.row.id)) continue
    const desiredCanon = canonDesiredOne(entry.desired)
    const match = remaining.find((exercise) => !claimedIds.has(exercise.id) && canonServerOne(exercise) === desiredCanon)
    if (!match) continue
    claims.set(entry.row.id, match)
    claimedIds.add(match.id)
  }
  return claims
}

function bindClaim(row: ExerciseRow, claim: PlanExerciseResponse): void {
  row.serverRowId = claim.id
  row.serverSortOrder = claim.sort_order
  row.hasLogs = claim.has_logs ?? false
}

function serverToRow(exercise: PlanExerciseResponse, local: ExerciseRow | undefined, catalog?: Catalog): ExerciseRow {
  const catalogEntry = catalog?.get(exercise.exercise_id)
  const custom = catalogEntry?.custom ?? (local?.exerciseId === exercise.exercise_id ? local.custom : false)
  const sets = [...exercise.sets].sort((a, b) => a.set_number - b.set_number)
  const boxes: SetBox[] = sets.map((set) => ({ val: fmtNum(set.target_value), empty: false }))
  const amrap = sets.some((set) => set.set_type === 'amrap' || set.target_reps_max != null)
  return {
    id: local?.id ?? exercise.id,
    serverRowId: exercise.id,
    serverSortOrder: exercise.sort_order,
    hasLogs: exercise.has_logs ?? false,
    conflictMessage: local?.conflictMessage ?? null,
    exerciseId: exercise.exercise_id,
    name: catalogEntry?.name ?? (local?.exerciseId === exercise.exercise_id ? local.name : '未知动作'),
    ku: !custom,
    custom,
    isMain: exercise.is_main_lift,
    aux: sets.length === 0,
    reps: sets.length === 0 ? '—' : `${sets[0].target_reps}${amrap ? '+' : ''}`,
    mode: sets[0]?.intensity_mode === 'rpe' ? 'rpe' : 'kg',
    boxes,
    note: exercise.notes ?? '',
  }
}

function errorDetails(error: ApiException): Record<string, unknown> {
  const nested = error.details.details
  return nested && typeof nested === 'object' ? nested as Record<string, unknown> : error.details
}

function stringList(value: unknown): string[] {
  if (Array.isArray(value)) return value.filter((item): item is string => typeof item === 'string')
  return typeof value === 'string' ? [value] : []
}

/** Rebind every surviving local row, then apply only the server-wins scope named by the 409. */
function merge409(
  localWeeks: Week[], fresh: PlanWithChildren, error: ApiException, options: ReconcileOptions,
): ReconcileConflict {
  const merged = cloneWeeks(localWeeks)
  const freshByKey = new Map(fresh.days.map((day) => [`${day.week_number}:${day.day_of_week}`, day]))
  // Snapshot pre-refetch lock state BEFORE any hasLogs refresh below: only rows that
  // just became frozen are server-wins candidates; rows locked before this save keep
  // local state untouched (their edits are impossible via UI).
  const previouslyLocked = new Set<string>()
  for (const week of merged) for (const day of week.days) for (const row of day.rows) {
    if (row.serverRowId && row.hasLogs) previouslyLocked.add(row.serverRowId)
  }

  for (const week of merged) for (const day of week.days) {
    const serverDay = freshByKey.get(`${week.num}:${day.dow + 1}`)
    if (!serverDay) {
      for (const row of day.rows) {
        row.serverRowId = null
        row.serverSortOrder = null
        row.hasLogs = false
      }
      continue
    }
    const serverById = new Map(serverDay.exercises.map((exercise) => [exercise.id, exercise]))
    for (const row of day.rows) {
      if (!row.serverRowId) continue
      const direct = serverById.get(row.serverRowId)
      if (!direct) continue
      // Refresh identity/lock metadata even when local content is temporarily unbound.
      // PLAN_HISTORY_IMMUTABLE is local-wins for row content, so this must not require canon.
      row.serverSortOrder = direct.sort_order
      row.hasLogs = direct.has_logs ?? false
    }
    const entries = desiredEntries(day, () => {})
    const claims = claimBaseline(entries, serverDay.exercises)
    for (const entry of entries) {
      const claim = claims.get(entry.row.id)
      if (claim) bindClaim(entry.row, claim)
      else if (entry.row.serverRowId && !serverById.has(entry.row.serverRowId)) {
        entry.row.serverRowId = null
        entry.row.serverSortOrder = null
        entry.row.hasLogs = false
      }
    }
    const claimedLocalRows = new Set(entries.filter((entry) => claims.has(entry.row.id)).map((entry) => entry.row.id))
    for (const row of day.rows) {
      if (claimedLocalRows.has(row.id) || !row.serverRowId || serverById.has(row.serverRowId)) continue
      row.serverRowId = null
      row.serverSortOrder = null
      row.hasLogs = false
    }
  }

  const details = errorDetails(error)
  const exerciseIds = new Set(stringList(details.exercise_ids))
  const dayIds = new Set([
    ...stringList(details.day_ids),
    ...stringList(details.day_id),
  ])
  const restoreExercise = error.code === 'EXERCISE_HISTORY_IMMUTABLE'
  const restoreDays = error.code === 'DAY_HISTORY_IMMUTABLE'
  // server-wins scope comes strictly from 409 details; when details are missing or
  // unparseable the scope must NOT widen to the whole plan — the newly-frozen check
  // below (existing?.hasLogs skip) is then the only selector.
  const hasScope = restoreExercise ? exerciseIds.size > 0 : dayIds.size > 0

  if (restoreExercise || restoreDays) {
    for (const freshDay of fresh.days) {
      if (restoreDays && hasScope && !dayIds.has(freshDay.id)) continue
      const localDay = dayAt(merged, freshDay.week_number, freshDay.day_of_week - 1)
      if (!localDay) continue
      for (const freshExercise of [...freshDay.exercises].sort((a, b) => a.sort_order - b.sort_order)) {
        if (!(freshExercise.has_logs ?? false)) continue
        if (restoreExercise && hasScope && !exerciseIds.has(freshExercise.id)) continue
        if (previouslyLocked.has(freshExercise.id)) continue
        const index = localDay.rows.findIndex((row) => row.serverRowId === freshExercise.id)
        const existing = index >= 0 ? localDay.rows[index] : undefined
        const restored = serverToRow(freshExercise, existing, options.catalog)
        restored.hasLogs = true
        restored.conflictMessage = '学员刚打了卡,该行已锁定并还原'
        if (index >= 0) localDay.rows[index] = restored
        else {
          const insertAt = localDay.rows.findIndex((row) => (row.serverSortOrder ?? Number.MAX_SAFE_INTEGER) > freshExercise.sort_order)
          localDay.rows.splice(insertAt < 0 ? localDay.rows.length : insertAt, 0, restored)
        }
        localDay.rest = false
      }
    }
  }

  const topMessage = error.code === 'PLAN_HISTORY_IMMUTABLE'
    ? '计划已有训练记录,日历不可改'
    : null
  return new ReconcileConflict(error.code, merged, topMessage)
}

/** Per-day save progress. */
export type SaveProgress = (done: number, total: number) => void

/** Imported dates/calendar fields are draft-only. Published plans never send plan_patch. */
export async function reconcileImportedPlan(
  planId: string, weeks: Week[], startDate: string, onProgress?: SaveProgress,
  options: ReconcileOptions = {},
): Promise<SaveResult> {
  const server = await getPlan(planId)
  if (options.published || server.status === 'published') throw new ApiException(409, 'PUBLISHED_IMPORT_FORBIDDEN')
  for (const day of server.days) {
    if (day.week_number > weeks.length) await deleteDay(day.id)
  }
  const endDate = fmtISO(addDays(startDate, weeks.length * 7 - 1))
  await patchPlan(planId, { plan_weeks: weeks.length, start_date: startDate, end_date: endDate })
  return reconcilePlan(planId, weeks, onProgress, options)
}

interface DayWork {
  weekNumber: number
  dow: number
  day: DayCol | undefined
  original: PlanDayResponse | undefined
  entries: DesiredEntry[]
}

async function postExercise(dayId: string, entry: DesiredEntry, sortOrder: number): Promise<string> {
  const created = await createExercise(dayId, {
    exercise_id: entry.desired.exercise_id,
    is_main_lift: entry.desired.is_main_lift,
    sort_order: sortOrder,
    notes: entry.desired.notes,
  })
  for (const set of entry.desired.sets) await createSet(created.id, set)
  return created.id
}

export async function reconcilePlan(
  planId: string, weeks: Week[], onProgress?: SaveProgress,
  options: ReconcileOptions = {},
): Promise<SaveResult> {
  const server: PlanWithChildren = await getPlan(planId)
  const resultWeeks = cloneWeeks(weeks)
  const origByKey = new Map<string, PlanDayResponse>()
  for (const day of server.days) origByKey.set(`${day.week_number}:${day.day_of_week}`, day)

  let skippedRows = 0
  const unlockedWorks: DayWork[] = []
  const mixedWorks: DayWork[] = []
  const lockedMutationRows: string[] = []

  for (const week of resultWeeks) {
    for (let dow = 0; dow < 7; dow++) {
      const day = week.days.find((candidate) => candidate.dow === dow)
      const entries = desiredEntries(day, () => { skippedRows++ })
      const original = origByKey.get(`${week.num}:${dow + 1}`)
      const mixed = !!original?.exercises.some((exercise) => exercise.has_logs ?? false)

      if (!mixed) {
        const originalCanon = original ? canonServer(original.exercises) : EMPTY
        const desiredCanon = entries.length ? canonDesired(entries.map((entry) => entry.desired)) : EMPTY
        if (originalCanon === desiredCanon) {
          if (original) {
            const claims = claimBaseline(entries, original.exercises)
            for (const entry of entries) {
              const claim = claims.get(entry.row.id)
              if (claim) bindClaim(entry.row, claim)
            }
          }
          continue
        }
        unlockedWorks.push({ weekNumber: week.num, dow, day, original, entries })
        continue
      }

      const baseline = original?.exercises ?? []
      const claims = claimBaseline(entries, baseline)
      for (const entry of entries) {
        const claim = claims.get(entry.row.id)
        if (claim) bindClaim(entry.row, claim)
        if ((entry.row.hasLogs || (claim?.has_logs ?? false))
          && (!claim || canonDesiredOne(entry.desired) !== canonServerOne(claim))) {
          entry.row.conflictMessage = '学员已打卡,锁定行不能修改'
          lockedMutationRows.push(entry.row.id)
        }
      }
      const claimedIds = new Set([...claims.values()].map((exercise) => exercise.id))
      for (const baselineRow of baseline) {
        if ((baselineRow.has_logs ?? false) && !claimedIds.has(baselineRow.id)) lockedMutationRows.push(baselineRow.id)
      }
      mixedWorks.push({ weekNumber: week.num, dow, day, original, entries })
    }
  }

  if (lockedMutationRows.length > 0) {
    throw new LockedRowMutationError([...new Set(lockedMutationRows)], resultWeeks)
  }

  // Decide mixed-day CRUD and slots before writing so progress and locked validation are stable.
  const mixedPlans = mixedWorks.map((work) => {
    const baseline = work.original?.exercises ?? []
    const claims = claimBaseline(work.entries, baseline)
    const claimedIds = new Set([...claims.values()].map((exercise) => exercise.id))
    const changed = work.entries.filter((entry) => {
      const claim = claims.get(entry.row.id)
      return !!claim && !(claim.has_logs ?? false) && canonDesiredOne(entry.desired) !== canonServerOne(claim)
    })
    const additions = work.entries.filter((entry) => !claims.has(entry.row.id))
    const removals = baseline.filter((exercise) => !claimedIds.has(exercise.id) && !(exercise.has_logs ?? false))
    const changedIds = new Set(changed.map((entry) => claims.get(entry.row.id)!.id))
    const occupied = new Set(baseline
      .filter((exercise) => !changedIds.has(exercise.id) && !removals.some((removed) => removed.id === exercise.id))
      .map((exercise) => exercise.sort_order))
    const released = new Set(removals.map((exercise) => exercise.sort_order))
    for (const entry of additions) {
      const oldSlot = entry.row.serverSortOrder
      if (oldSlot != null && !occupied.has(oldSlot)) released.add(oldSlot)
    }
    const freeSlots = [...released].sort((a, b) => a - b)
    const maxSort = baseline.reduce((max, exercise) => Math.max(max, exercise.sort_order), -1)
    let tail = maxSort + 1
    const assigned = new Map<string, number>()
    for (const entry of work.entries) {
      const claim = claims.get(entry.row.id)
      if (claim) assigned.set(entry.row.id, claim.sort_order)
    }
    for (const entry of additions) assigned.set(entry.row.id, freeSlots.shift() ?? tail++)
    return { work, claims, changed, additions, removals, assigned, hasWrites: changed.length + additions.length + removals.length > 0 }
  })

  const total = unlockedWorks.length + mixedPlans.filter((plan) => plan.hasWrites).length
  let done = 0

  try {
    // Legacy whole-day replacements first. A mixed day id can never reach these calls.
    for (const work of unlockedWorks) {
      if (work.original) await deleteDay(work.original.id)
      for (const row of work.day?.rows ?? []) {
        row.serverRowId = null
        row.serverSortOrder = null
        row.hasLogs = false
      }
      if (work.entries.length > 0) {
        const createdDay = await createDay(planId, {
          day_of_week: work.dow + 1, week_number: work.weekNumber, sort_order: 0,
        })
        for (let index = 0; index < work.entries.length; index++) {
          const entry = work.entries[index]
          const id = await postExercise(createdDay.id, entry, index)
          entry.row.serverRowId = id
          entry.row.serverSortOrder = index
          entry.row.hasLogs = false
          entry.row.conflictMessage = null
        }
      }
      onProgress?.(++done, total)
    }

    // Mixed days: all exercise DELETEs settle before any POST for that day.
    for (const plan of mixedPlans) {
      const { work, claims, changed, additions, removals, assigned } = plan
      if (!plan.hasWrites) continue
      for (const entry of changed) await deleteExercise(claims.get(entry.row.id)!.id)
      for (const exercise of removals) await deleteExercise(exercise.id)
      const toCreate = [...changed, ...additions]
        .sort((a, b) => assigned.get(a.row.id)! - assigned.get(b.row.id)!)
      for (const entry of toCreate) {
        const sortOrder = assigned.get(entry.row.id)!
        const id = await postExercise(work.original!.id, entry, sortOrder)
        entry.row.serverRowId = id
        entry.row.serverSortOrder = sortOrder
        entry.row.hasLogs = false
        entry.row.conflictMessage = null
      }
      for (const entry of work.entries) {
        const claim = claims.get(entry.row.id)
        if (claim && !changed.includes(entry)) bindClaim(entry.row, claim)
      }
      if (work.day) {
        const assignedRows = new Map(work.entries.map((entry) => [entry.row.id, assigned.get(entry.row.id)!]))
        work.day.rows.sort((a, b) => {
          const aOrder = assignedRows.get(a.id) ?? Number.MAX_SAFE_INTEGER
          const bOrder = assignedRows.get(b.id) ?? Number.MAX_SAFE_INTEGER
          return aOrder - bOrder
        })
      }
      onProgress?.(++done, total)
    }
  } catch (error) {
    if (error instanceof ApiException && error.status === 409) {
      const fresh = await getPlan(planId)
      throw merge409(weeks, fresh, error, options)
    }
    throw error
  }

  for (const week of resultWeeks) for (const day of week.days) day.releasedSortOrders = []

  return { changedDays: total, skippedRows, weeks: resultWeeks }
}
