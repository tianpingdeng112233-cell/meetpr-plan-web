// Save write-back: reconcile the edited Week[] model into the backend plan tree.
// Strategy: diff per (week, day) by canonical content; only changed days are
// replaced (delete + recreate). Unchanged days are left untouched, so their
// plan_set ids (and any student references) survive.

import type { Week, ExerciseRow } from './types'
import { isContentfulUnbound } from './types'
import type {
  PlanWithChildren, PlanExerciseResponse, CreatePlanSetBody, IntensityModeWire, SetType,
} from '../../api/types'
import { getPlan, createDay, deleteDay, createExercise, createSet, patchPlan } from '../../api/plans'
import { addDays } from './mapping'

interface DesiredExercise {
  exercise_id: string
  is_main_lift: boolean
  notes: string | null
  sets: CreatePlanSetBody[]
}

export interface SaveResult { changedDays: number; skippedRows: number }

function numStr(v: string): string {
  const n = Number(v)
  return Number.isNaN(n) ? v : String(n)
}

function parseReps(reps: string): { reps: number; repsMax: number | null; amrap: boolean } {
  const range = reps.match(/(\d{1,2})\s*(?:-|–|—|~|到|至)\s*(\d{1,2})/)
  if (range) {
    const lo = Math.min(Math.max(Number(range[1]), 1), 50)
    const hi = Math.min(Math.max(Number(range[2]), lo), 50)
    return { reps: lo, repsMax: hi, amrap: false }
  }
  const amrap = reps.includes('+')
  const n = parseInt(reps, 10)
  return { reps: Number.isFinite(n) ? Math.min(Math.max(n, 1), 50) : 1, repsMax: null, amrap }
}

/** A bound row -> desired backend exercise. Unbound rows (no exerciseId) -> null. */
function rowToDesired(row: ExerciseRow): DesiredExercise | null {
  if (!row.exerciseId) return null
  const mode: IntensityModeWire = row.mode === 'rpe' || row.mode === 'bodyweight' ? 'rpe' : 'weight'
  const filled = row.mode === 'bodyweight'
    ? row.boxes.map(() => ({ val: '10', empty: false }))
    : row.boxes.filter((b) => !b.empty && b.val !== '')
  const { reps, repsMax, amrap } = parseReps(row.reps)
  const sets: CreatePlanSetBody[] = filled.map((b, i) => ({
    set_number: i + 1,
    target_reps: reps,
    target_reps_max: repsMax,
    intensity_mode: mode,
    target_value: numStr(b.val),
    set_type: (amrap && i === filled.length - 1 ? 'amrap' : 'working') as SetType,
    coach_note: row.mode === 'bodyweight' ? '自重' : undefined,
  }))
  return { exercise_id: row.exerciseId, is_main_lift: row.isMain, notes: row.note || null, sets }
}

function canonDesired(exs: DesiredExercise[]): string {
  return JSON.stringify(exs.map((e) => ({
    x: e.exercise_id, m: e.is_main_lift, n: e.notes ?? '',
    s: e.sets.map((s) => [
      s.set_number, s.target_reps, s.target_reps_max ?? null, s.intensity_mode, numStr(s.target_value), s.set_type, s.coach_note ?? null,
    ]),
  })))
}

function canonServer(exs: PlanExerciseResponse[]): string {
  const sorted = [...exs].sort((a, b) => a.sort_order - b.sort_order)
  return JSON.stringify(sorted.map((e) => ({
    x: e.exercise_id, m: e.is_main_lift, n: e.notes ?? '',
    s: [...e.sets].sort((a, b) => a.set_number - b.set_number)
      .map((s) => [
        s.set_number, s.target_reps, s.target_reps_max ?? null, s.intensity_mode, numStr(s.target_value), s.set_type, s.coach_note ?? null,
      ]),
  })))
}

const EMPTY = '[]'

function fmtISO(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** Save an *imported* plan: align the backend plan to the import — delete weeks
 *  beyond it, set plan_weeks + start_date (+ end_date) to the source — so the imported
 *  dates and week count survive a reload, then reconcile the days. Delete happens
 *  before shrinking plan_weeks so it can't violate `week_number ≤ plan_weeks`. */
/** Per-day save progress: `done` of `total` changed days written. Lets the editor
 *  show real movement during multi-minute saves (429 backoff makes big imports slow)
 *  instead of a frozen-looking「自动保存中…」. */
export type SaveProgress = (done: number, total: number) => void

export async function reconcileImportedPlan(
  planId: string, weeks: Week[], startDate: string, onProgress?: SaveProgress,
): Promise<SaveResult> {
  const server: PlanWithChildren = await getPlan(planId)
  for (const day of server.days) {
    if (day.week_number > weeks.length) await deleteDay(day.id)
  }
  const endDate = fmtISO(addDays(startDate, weeks.length * 7 - 1))
  await patchPlan(planId, { plan_weeks: weeks.length, start_date: startDate, end_date: endDate })
  return reconcilePlan(planId, weeks, onProgress)
}

export async function reconcilePlan(
  planId: string, weeks: Week[], onProgress?: SaveProgress,
): Promise<SaveResult> {
  // live server tree as the diff baseline (never trust a stale snapshot)
  const server: PlanWithChildren = await getPlan(planId)
  const origByKey = new Map<string, PlanWithChildren['days'][number]>()
  for (const day of server.days) origByKey.set(`${day.week_number}:${day.day_of_week}`, day)

  let skippedRows = 0

  // Diff first so the total is known before writing (progress needs it)…
  interface DayWork { wnum: number; dow: number; origId: string | null; desired: DesiredExercise[] }
  const work: DayWork[] = []
  for (const wk of weeks) {
    for (let dow = 0; dow < 7; dow++) {
      const dayCol = wk.days.find((d) => d.dow === dow)
      const desired: DesiredExercise[] = (dayCol && !dayCol.rest)
        ? dayCol.rows.map((r) => {
            const d = rowToDesired(r)
            // Only count rows that would actually lose content — empty placeholder rows
            // also produce null but skipping them loses nothing, so they must not inflate the warning.
            if (!d && isContentfulUnbound(r)) skippedRows++
            return d
          }).filter((d): d is DesiredExercise => d !== null)
        : []
      const orig = origByKey.get(`${wk.num}:${dow + 1}`)
      const origCanon = orig ? canonServer(orig.exercises) : EMPTY
      const desCanon = desired.length ? canonDesired(desired) : EMPTY
      if (origCanon === desCanon) continue
      work.push({ wnum: wk.num, dow, origId: orig?.id ?? null, desired })
    }
  }

  // …then write day by day, reporting progress after each settled day.
  for (let w = 0; w < work.length; w++) {
    const { wnum, dow, origId, desired } = work[w]
    if (origId) await deleteDay(origId) // cascades exercises + sets
    if (desired.length) {
      const day = await createDay(planId, { day_of_week: dow + 1, week_number: wnum, sort_order: 0 })
      for (let i = 0; i < desired.length; i++) {
        const ex = desired[i]
        const pe = await createExercise(day.id, {
          exercise_id: ex.exercise_id, is_main_lift: ex.is_main_lift, sort_order: i, notes: ex.notes,
        })
        for (const s of ex.sets) await createSet(pe.id, s)
      }
    }
    onProgress?.(w + 1, work.length)
  }
  return { changedDays: work.length, skippedRows }
}
