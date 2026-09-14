// Save write-back for draft and published plans.
//
// Days without history keep the legacy whole-day replacement behavior. A day with
// even one logged exercise is reconciled exercise-by-exercise so the immutable rows
// and their set/history links are never touched.

import type { Week, DayCol, ExerciseRow, IntensityValueMode, OpaqueSetSpec, RowIntensity, SetBox, WeightMode } from './types'
import { isBoundNoSets, isContentfulUnbound, isRestDay, rowSetGridSignature, snapshotOpaqueSets } from './types'
import type {
  PlanWithChildren, PlanDayResponse, PlanExerciseResponse, CreatePlanSetBody,
  BatchPlanDayBody, BatchPlanDaysBody, SetType,
} from '../../api/types'
import {
  getPlan, batchDays, deleteDay, createExercise, deleteExercise, createSet, patchPlan,
} from '../../api/plans'
import { ApiException } from '../../api/client'
import { addDays, syncPlanScheduleToWeeks, type Catalog } from './mapping'
import { isLegacyRpeRow, rowIntensity, rowIntensityBoxes, rowWeightBoxes } from './intensityModel'
import { S } from '../../i18n/strings'
import { STABLE_ZH } from '../../i18n/stable-zh'

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
  degradedRows: number
  /** Row identity/lock/order and day schedule metadata from the live baseline. */
  weeks: Week[]
  /** Present when reconciliation also changed the plan calendar metadata. */
  planStartDate?: string
  planEndDate?: string
  planWeeks?: number
}

export interface ResizePlanResult {
  deletedDays: number
  deletedExercises: number
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

export class ReconciliationError extends Error {
  constructor(public readonly code: 'PLAN_SET_SPEC_INCOMPLETE') {
    super(code)
  }
}

function numStr(v: string | number): string {
  const n = Number(v)
  return Number.isNaN(n) ? String(v) : String(n)
}

function numNullable(v: string | number | null | undefined): string | null {
  return v == null || v === '' ? null : numStr(v)
}

function canonicalPctAnchor(anchor: PlanExerciseResponse['sets'][number]['pct_anchor']): 'e1rm' | 'top_set' | null {
  return anchor === 'e1rm' || anchor === 'top_set' ? anchor : null
}

function canonCoachNote(note: string | null | undefined): string | null {
  if (note == null) return null
  return STABLE_ZH.patterns.bodyweight.test(note) ? 'bodyweight' : note
}

function fmtNum(v: string | number): string {
  const n = Number(v)
  return Number.isNaN(n) ? String(v) : String(Number(n.toFixed(2)))
}

function parseReps(reps: string): { reps: number; repsMax: number | null; amrap: boolean } {
  const range = reps.match(STABLE_ZH.patterns.repRange)
  if (range) {
    const lo = Math.min(Math.max(Number(range[1]), 1), 50)
    const hi = Math.min(Math.max(Number(range[2]), lo), 50)
    return { reps: lo, repsMax: hi, amrap: false }
  }
  const amrap = reps.includes('+')
  const n = parseInt(reps, 10)
  return { reps: Number.isFinite(n) ? Math.min(Math.max(n, 1), 50) : 1, repsMax: null, amrap }
}

function opaqueSetToDesired(set: OpaqueSetSpec): CreatePlanSetBody {
  return {
    set_number: set.set_number,
    target_reps: set.target_reps,
    target_reps_max: set.target_reps_max,
    ...(set.intensity_mode !== undefined ? { intensity_mode: set.intensity_mode } : {}),
    ...(set.target_value !== undefined ? { target_value: set.target_value } : {}),
    load_mode: set.load_mode,
    target_pct: set.target_pct,
    ...(set.load_mode === 'pct' ? { pct_anchor: canonicalPctAnchor(set.pct_anchor) } : {}),
    target_rpe: set.target_rpe,
    rir_target: numNullable(set.rir_target),
    rpe_low: set.rpe_low,
    rpe_high: set.rpe_high,
    weight_low: set.weight_low,
    weight_high: set.weight_high,
    target_weight: set.target_weight,
    set_type: set.set_type,
    rest_seconds: set.rest_seconds,
    coach_note: set.coach_note,
  }
}

function rememberServerSets(row: ExerciseRow, exercise: PlanExerciseResponse): void {
  row.opaqueSets = snapshotOpaqueSets(exercise.sets)
  row.opaqueSetBaseline = rowSetGridSignature(row)
}

function rememberDesiredSets(row: ExerciseRow, sets: CreatePlanSetBody[]): void {
  row.opaqueSets = sets.map((set) => ({
    ...set,
    target_reps_max: set.target_reps_max ?? null,
    rest_seconds: set.rest_seconds ?? null,
    coach_note: set.coach_note ?? null,
  }))
  row.opaqueSetBaseline = rowSetGridSignature(row)
}

/** A bound row -> desired backend exercise. Unbound rows (no exerciseId) -> null. */
function rowToDesired(row: ExerciseRow): DesiredExercise | null {
  if (!row.exerciseId) return null
  const { reps, repsMax, amrap } = parseReps(row.reps)
  let sets: CreatePlanSetBody[]
  const sourceSets = row.opaqueSets
  const opaqueUnchanged = sourceSets !== undefined
    && row.opaqueSetBaseline === rowSetGridSignature(row)
  if (opaqueUnchanged) {
    sets = sourceSets.map(opaqueSetToDesired)
  } else if (row.mode === 'bodyweight') {
    sets = row.boxes.map((_, i) => ({
      set_number: i + 1,
      target_reps: reps,
      target_reps_max: repsMax,
      intensity_mode: 'rpe',
      target_value: '10',
      set_type: (amrap && i === row.boxes.length - 1 ? 'amrap' : 'working') as SetType,
      coach_note: STABLE_ZH.bodyweight,
    }))
  } else {
    const intensity = rowIntensity(row)
    const weights = rowWeightBoxes(row)
    const legacyRpeValues = isLegacyRpeRow(row) ? rowIntensityBoxes(row) : null
    const intensityValues = rowIntensityBoxes(row)
    sets = row.boxes.map((_, i) => {
      if (legacyRpeValues) {
        return {
          set_number: i + 1,
          target_reps: reps,
          target_reps_max: repsMax,
          intensity_mode: 'rpe',
          target_value: numNullable(legacyRpeValues[i]?.val ?? '') ?? '',
          set_type: (amrap && i === row.boxes.length - 1 ? 'amrap' : 'working') as SetType,
        }
      }
      const setIntensity = intensity
      const setIntensityValue = intensityValues[i] && !intensityValues[i].empty
        ? intensityValues[i].val
        : ''
      const targetWeight = weights[i] && !weights[i].empty ? numNullable(weights[i].val) : null
      return {
        set_number: i + 1,
        target_reps: reps,
        target_reps_max: repsMax,
        load_mode: setIntensity?.mode ?? null,
        target_pct: setIntensity?.mode === 'pct' ? numNullable(setIntensityValue) : null,
        ...(setIntensity?.mode === 'pct' ? {
          pct_anchor: row.pctAnchor === 'e1rm' || row.pctAnchor === 'top_set' ? row.pctAnchor : null,
        } : {}),
        target_rpe: setIntensity?.mode === 'rpe' ? numNullable(setIntensityValue) : null,
        rir_target: setIntensity?.mode === 'rir' ? numNullable(setIntensityValue) : null,
        rpe_low: setIntensity?.mode === 'rpe_range' ? numNullable(setIntensity.value) : null,
        rpe_high: setIntensity?.mode === 'rpe_range' ? numNullable(setIntensity.high) : null,
        weight_low: setIntensity?.mode === 'weight_range' ? numNullable(setIntensity.value) : null,
        weight_high: setIntensity?.mode === 'weight_range' ? numNullable(setIntensity.high) : null,
        target_weight: targetWeight,
        set_type: (amrap && i === row.boxes.length - 1 ? 'amrap' : 'working') as SetType,
      }
    })
  }
  if (!opaqueUnchanged && sourceSets) {
    // Edited row: the grid owns sets/reps/intensity/weight; rest and app notes
    // ride along by set index. The bodyweight marker lives in coach_note and is
    // a grid-owned weight-mode protocol (mapping.ts), so it must follow the
    // row's current mode — never resurrect an old marker on a kg row, never let
    // an old app note overwrite the marker on a bodyweight row.
    sets = sets.map((set, index) => {
      const oldNote = sourceSets[index]?.coach_note ?? null
      const oldIsBodyweightMarker = oldNote != null && STABLE_ZH.patterns.bodyweight.test(oldNote)
      const coachNote = row.mode === 'bodyweight'
        ? set.coach_note ?? null
        : oldIsBodyweightMarker ? null : oldNote
      return {
        ...set,
        rest_seconds: sourceSets[index]?.rest_seconds ?? null,
        coach_note: coachNote,
      }
    })
  }
  return {
    exercise_id: row.exerciseId,
    is_main_lift: row.isMain,
    notes: row.note || null,
    sets,
  }
}

function canonicalSet(set: CreatePlanSetBody | PlanExerciseResponse['sets'][number]): unknown[] {
  const bodyweight = STABLE_ZH.patterns.bodyweight.test(set.coach_note ?? '')
  const useNewShape = !bodyweight && (
    set.load_mode != null
    || (set.intensity_mode === 'weight' && set.target_value !== undefined)
    // A desired new weight-only row explicitly carries load_mode:null and no
    // legacy projection. A server legacy RPE row also carries null, but keeps
    // intensity_mode/target_value and must stay in the legacy canonical branch.
    || (set.load_mode !== undefined && set.intensity_mode === undefined)
  )
  if (useNewShape) {
    const legacyWeight = set.load_mode == null && set.intensity_mode === 'weight'
      ? numNullable(set.target_value)
      : null
    return [
      set.set_number, set.target_reps, set.target_reps_max ?? null,
      set.load_mode ?? null,
      numNullable(set.target_pct), numNullable(set.target_rpe), numNullable(set.rir_target),
      numNullable(set.rpe_low), numNullable(set.rpe_high),
      numNullable(set.weight_low), numNullable(set.weight_high),
      set.load_mode === 'pct' ? canonicalPctAnchor(set.pct_anchor) : null,
      numNullable(set.target_weight) ?? legacyWeight,
      set.set_type, set.rest_seconds ?? null, canonCoachNote(set.coach_note),
    ]
  }
  return [
    set.set_number, set.target_reps, set.target_reps_max ?? null,
    set.intensity_mode, numNullable(set.target_value), set.set_type,
    set.rest_seconds ?? null, canonCoachNote(set.coach_note),
  ]
}

function canonDesiredOne(e: DesiredExercise): string {
  return JSON.stringify({
    x: e.exercise_id, m: e.is_main_lift, n: e.notes ?? '',
    s: e.sets.map(canonicalSet),
  })
}

function canonServerOne(e: PlanExerciseResponse): string {
  return JSON.stringify({
    x: e.exercise_id, m: e.is_main_lift, n: e.notes ?? '',
    s: [...e.sets].sort((a, b) => a.set_number - b.set_number)
      .map(canonicalSet),
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
const CHUNK_DAYS = 60

function fmtISO(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function cloneWeeks(weeks: Week[]): Week[] {
  return weeks.map((week) => ({
    ...week,
    days: week.days.map((day) => ({
      ...day,
      releasedSortOrders: day.releasedSortOrders ? [...day.releasedSortOrders] : undefined,
      rows: day.rows.map((row) => ({
        ...row,
        intensity: row.intensity ? { ...row.intensity } : row.intensity,
        intensityBoxes: row.intensityBoxes?.map((box) => ({ ...box })),
        boxes: row.boxes.map((box) => ({ ...box })),
        opaqueSets: row.opaqueSets?.map((set) => ({ ...set })),
      })),
    })),
  }))
}

function dayAt(weeks: Week[], weekNumber: number, dow: number): DayCol | undefined {
  return weeks.find((week) => week.num === weekNumber)?.days.find((day) => day.dow === dow)
}

function desiredEntries(
  day: DayCol | undefined, countSkipped: () => void, countDegraded: () => void,
  degradeIncomplete: boolean,
): DesiredEntry[] {
  if (!day || isRestDay(day)) return []
  const entries: DesiredEntry[] = []
  for (const row of day.rows) {
    const desired = rowToDesired(row)
    if (desired) {
      if (isBoundNoSets(row)) {
        // Drafts degrade to a zero-set placeholder (spec 039); a published
        // update keeps the structural refusal — never rewrite the student's
        // live tree with a lossy projection.
        if (!degradeIncomplete) throw new ReconciliationError('PLAN_SET_SPEC_INCOMPLETE')
        desired.sets = []
        countDegraded()
      }
      entries.push({ row, desired })
    }
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
  const bodyweight = sets.length > 0 && sets.every((set) => STABLE_ZH.patterns.bodyweight.test(set.coach_note ?? ''))
  const legacyRpeSource = !bodyweight && sets.length > 0 && sets.every((set) => (
    set.load_mode == null && set.intensity_mode === 'rpe'
  ))
  const legacyWeightSource = !bodyweight && sets.length > 0 && sets.every((set) => (
    set.load_mode == null && set.intensity_mode === 'weight'
  ))
  const loadMode = sets[0]?.load_mode ?? null
  const uniformLoadMode = sets.every((set) => (set.load_mode ?? null) === loadMode)
  const singleValueMode = loadMode === 'pct' || loadMode === 'rpe' || loadMode === 'rir'
  const intensityBoxes: SetBox[] = sets.map((set) => {
    const value = legacyRpeSource
      ? fmtNum(set.target_value)
      : set.load_mode === 'pct' ? set.target_pct == null ? '' : fmtNum(set.target_pct)
        : set.load_mode === 'rpe' ? set.target_rpe == null ? '' : fmtNum(set.target_rpe)
          : set.load_mode === 'rir' ? set.rir_target == null ? '' : fmtNum(set.rir_target)
            : ''
    return { val: value, empty: value === '' }
  })
  const boxes: SetBox[] = sets.map((set) => {
    if (bodyweight) return { val: '', empty: true }
    const targetWeight = set.target_weight
      ?? (set.load_mode == null && set.intensity_mode === 'weight' ? set.target_value : null)
    return { val: targetWeight == null ? '' : fmtNum(targetWeight), empty: targetWeight == null }
  })
  const intensity: RowIntensity | null = (() => {
    const set = sets[0]
    if (!set || bodyweight) return null
    if (legacyRpeSource) return { mode: 'rpe', value: fmtNum(set.target_value), high: '' }
    switch (set.load_mode) {
      case 'pct': return { mode: 'pct', value: set.target_pct == null ? '' : fmtNum(set.target_pct), high: '' }
      case 'rpe': return { mode: 'rpe', value: set.target_rpe == null ? '' : fmtNum(set.target_rpe), high: '' }
      case 'rir': return { mode: 'rir', value: set.rir_target == null ? '' : fmtNum(set.rir_target), high: '' }
      case 'weight_range': return {
        mode: 'weight_range',
        value: set.weight_low == null ? '' : fmtNum(set.weight_low),
        high: set.weight_high == null ? '' : fmtNum(set.weight_high),
      }
      case 'rpe_range': return {
        mode: 'rpe_range',
        value: set.rpe_low == null ? '' : fmtNum(set.rpe_low),
        high: set.rpe_high == null ? '' : fmtNum(set.rpe_high),
      }
      case 'fixed_weight': return { mode: 'fixed_weight', value: '', high: '' }
      default: return null
    }
  })()
  const weightMode: WeightMode = new Set(boxes.map((box) => box.empty || box.val === '' ? '<empty>' : box.val)).size > 1
    ? 'per_set'
    : 'uniform'
  const intensityMode: IntensityValueMode = new Set(intensityBoxes.map((box) => box.empty || box.val === '' ? '<empty>' : box.val)).size > 1
    ? 'per_set'
    : 'uniform'
  const baseReps = sets[0]?.target_reps
  const repsMax = sets[0]?.target_reps_max
  const amrap = sets.some((set) => set.set_type === 'amrap')
  const row: ExerciseRow = {
    id: local?.id ?? exercise.id,
    serverRowId: exercise.id,
    serverSortOrder: exercise.sort_order,
    hasLogs: exercise.has_logs ?? false,
    conflictMessage: local?.conflictMessage ?? null,
    exerciseId: exercise.exercise_id,
    name: catalogEntry?.name ?? (local?.exerciseId === exercise.exercise_id ? local.name : STABLE_ZH.unknownExercise),
    ...(catalogEntry?.nameEn ? { nameEn: catalogEntry.nameEn } : local?.nameEn ? { nameEn: local.nameEn } : {}),
    ku: !custom,
    custom,
    isMain: exercise.is_main_lift,
    aux: sets.length === 0,
    reps: sets.length === 0 ? '—' : repsMax != null && repsMax > baseReps
      ? `${baseReps}-${repsMax}`
      : `${baseReps}${amrap ? '+' : ''}`,
    mode: bodyweight ? 'bodyweight' : legacyRpeSource ? 'rpe' : 'kg',
    ...(legacyWeightSource ? { legacyWeightSource: true } : {}),
    ...(!bodyweight && (legacyRpeSource || singleValueMode) ? { intensityMode, intensityBoxes } : {}),
    ...(loadMode === 'pct' ? { pctAnchor: sets[0]?.pct_anchor ?? 'one_rm' } : {}),
    ...(legacyRpeSource ? {} : { intensity: uniformLoadMode ? intensity : null }),
    weightMode,
    boxes,
    opaqueSets: snapshotOpaqueSets(sets),
    note: exercise.notes ?? '',
  }
  row.opaqueSetBaseline = rowSetGridSignature(row)
  return row
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
    const entries = desiredEntries(day, () => {}, () => {}, !options.published && fresh.status === 'draft')
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
        restored.conflictMessage = S.editor.loggedRowRestored
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
    ? S.editor.calendarHasLogs
    : null
  return new ReconcileConflict(error.code, syncPlanScheduleToWeeks(merged, fresh), topMessage)
}

/** Per-day save progress. */
export type SaveProgress = (done: number, total: number) => void

/** Change a draft's duration. When shrinking, server days outside the new
 * range are deleted before plan_weeks is patched, matching import reconcile's
 * check-safe ordering. Published/paused/completed plans never enter this flow. */
export async function resizeServerPlanWeeks(planId: string, planWeeks: number): Promise<ResizePlanResult> {
  const server: PlanWithChildren = await getPlan(planId)
  if (server.status !== 'draft') throw new ApiException(409, 'PLAN_NOT_DRAFT')
  const removed = server.days.filter((day) => day.week_number > planWeeks)
  for (const day of removed) await deleteDay(day.id)
  await patchPlan(planId, { plan_weeks: planWeeks })
  return {
    deletedDays: removed.length,
    deletedExercises: removed.reduce((sum, day) => sum + day.exercises.length, 0),
  }
}

/** Imported dates/calendar fields are draft-only. Published plans never send plan_patch. */
export async function reconcileImportedPlan(
  planId: string, weeks: Week[], startDate: string, onProgress?: SaveProgress,
  options: ReconcileOptions = {},
): Promise<SaveResult> {
  const server: PlanWithChildren = await getPlan(planId)
  if (options.published || server.status === 'published') throw new ApiException(409, 'PUBLISHED_IMPORT_FORBIDDEN')
  const endDate = fmtISO(addDays(startDate, weeks.length * 7 - 1))
  // Frozen days must never enter a batch (the whole transaction would 409);
  // out-of-range days carrying logs go through the per-day endpoint instead,
  // keeping the pre-batch per-day server verdict semantics.
  const overrange = server.days.filter((day) => day.week_number > weeks.length)
  const dayFrozen = (day: PlanDayResponse) => day.exercises.some((exercise) => exercise.has_logs ?? false)
  for (const day of overrange.filter(dayFrozen)) await deleteDay(day.id)
  const result = await reconcileFromBaseline(planId, weeks, server, onProgress, options, {
    plan_patch: { plan_weeks: weeks.length, start_date: startDate, end_date: endDate },
    delete_day_ids: overrange.filter((day) => !dayFrozen(day)).map((day) => day.id),
  })
  return {
    ...result,
    planStartDate: startDate,
    planEndDate: endDate,
    planWeeks: weeks.length,
  }
}

interface DayWork {
  weekNumber: number
  dow: number
  day: DayCol | undefined
  original: PlanDayResponse | undefined
  entries: DesiredEntry[]
}

function validateMixedWork(work: DayWork, lockedMutationRows: string[]): void {
  const baseline = work.original?.exercises ?? []
  const claims = claimBaseline(work.entries, baseline)
  for (const entry of work.entries) {
    const claim = claims.get(entry.row.id)
    if (claim) bindClaim(entry.row, claim)
    if ((entry.row.hasLogs || (claim?.has_logs ?? false))
      && (!claim || canonDesiredOne(entry.desired) !== canonServerOne(claim))) {
      entry.row.conflictMessage = S.editor.loggedRowCannotChange
      lockedMutationRows.push(entry.row.id)
    }
  }
  const claimedIds = new Set([...claims.values()].map((exercise) => exercise.id))
  for (const baselineRow of baseline) {
    if ((baselineRow.has_logs ?? false) && !claimedIds.has(baselineRow.id)) lockedMutationRows.push(baselineRow.id)
  }
}

function planMixedWork(work: DayWork) {
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
  const maxSort = baseline.reduce((max, exercise) => Math.max(max, exercise.sort_order), -1)
  let tail = maxSort + 1
  const assigned = new Map<string, number>()
  for (const entry of work.entries) {
    const claim = claims.get(entry.row.id)
    if (claim) assigned.set(entry.row.id, claim.sort_order)
  }
  const used = new Set(assigned.values())
  for (const entry of additions) {
    const requested = entry.row.serverSortOrder
    if (requested != null && released.has(requested) && !occupied.has(requested) && !used.has(requested)) {
      assigned.set(entry.row.id, requested)
      used.add(requested)
      tail = Math.max(tail, requested + 1)
    } else {
      while (used.has(tail)) tail++
      assigned.set(entry.row.id, tail)
      used.add(tail++)
    }
  }
  return { work, claims, changed, additions, removals, assigned, hasWrites: changed.length + additions.length + removals.length > 0 }
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

function workToBatchDay(work: DayWork): BatchPlanDayBody {
  return {
    week_number: work.weekNumber,
    day_of_week: work.dow + 1,
    sort_order: 0,
    exercises: work.entries.map((entry, sortOrder) => ({
      exercise_id: entry.desired.exercise_id,
      is_main_lift: entry.desired.is_main_lift,
      sort_order: sortOrder,
      notes: entry.desired.notes,
      sets: entry.desired.sets.map((set) => ({
        set_number: set.set_number,
        target_reps: set.target_reps,
        target_reps_max: set.target_reps_max ?? null,
        ...(set.intensity_mode !== undefined ? { intensity_mode: set.intensity_mode } : {}),
        ...(set.target_value !== undefined ? { target_value: set.target_value } : {}),
        ...(set.load_mode !== undefined ? {
          load_mode: set.load_mode,
          target_pct: set.target_pct ?? null,
          ...(set.load_mode === 'pct' ? { pct_anchor: set.pct_anchor ?? null } : {}),
          target_rpe: set.target_rpe ?? null,
          rir_target: set.rir_target ?? null,
          rpe_low: set.rpe_low ?? null,
          rpe_high: set.rpe_high ?? null,
          weight_low: set.weight_low ?? null,
          weight_high: set.weight_high ?? null,
          target_weight: set.target_weight ?? null,
        } : {}),
        set_type: set.set_type,
        rest_seconds: set.rest_seconds ?? null,
        coach_note: set.coach_note ?? null,
      })),
    })),
  }
}

interface BatchPrelude {
  plan_patch?: BatchPlanDaysBody['plan_patch']
  delete_day_ids?: string[]
}

export async function reconcilePlan(
  planId: string, weeks: Week[], onProgress?: SaveProgress,
  options: ReconcileOptions = {},
): Promise<SaveResult> {
  const server: PlanWithChildren = await getPlan(planId)
  return reconcileFromBaseline(planId, weeks, server, onProgress, options)
}

async function reconcileFromBaseline(
  planId: string, weeks: Week[], server: PlanWithChildren, onProgress: SaveProgress | undefined,
  options: ReconcileOptions, prelude: BatchPrelude = {},
): Promise<SaveResult> {
  const resultWeeks = cloneWeeks(weeks)
  const origByKey = new Map<string, PlanDayResponse>()
  for (const day of server.days) origByKey.set(`${day.week_number}:${day.day_of_week}`, day)

  let skippedRows = 0
  let degradedRows = 0
  const unlockedWorks: DayWork[] = []
  const mixedWorks: DayWork[] = []
  const lockedMutationRows: string[] = []

  for (const week of resultWeeks) {
    for (let dow = 0; dow < 7; dow++) {
      const day = week.days.find((candidate) => candidate.dow === dow)
      // Degrade needs BOTH signals to say draft: the caller's flag can be stale
      // (another device may have published since this page loaded), and the
      // fresh server status is the authority — never degrade into a live tree.
      const entries = desiredEntries(
        day, () => { skippedRows++ }, () => { degradedRows++ },
        !options.published && server.status === 'draft',
      )
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
              if (claim) {
                bindClaim(entry.row, claim)
                rememberServerSets(entry.row, claim)
              }
            }
          }
          continue
        }
        unlockedWorks.push({ weekNumber: week.num, dow, day, original, entries })
        continue
      }

      const work = { weekNumber: week.num, dow, day, original, entries }
      validateMixedWork(work, lockedMutationRows)
      mixedWorks.push(work)
    }
  }

  if (lockedMutationRows.length > 0) {
    throw new LockedRowMutationError([...new Set(lockedMutationRows)], syncPlanScheduleToWeeks(resultWeeks, server))
  }

  // Decide mixed-day CRUD and slots before writing so progress is stable.
  let mixedPlans = mixedWorks.map(planMixedWork)

  const upsertDays = unlockedWorks.filter((work) => work.entries.length > 0).map(workToBatchDay)
  // Every changed unlocked day with a server original is delete+recreate —
  // batch upsert_days is pure INSERT, so leaving the old day would duplicate
  // it. Cleared days delete without a matching upsert. (spec 009 §3)
  const deleteDayIds = [...new Set([
    ...(prelude.delete_day_ids ?? []),
    ...unlockedWorks.filter((work) => work.original).map((work) => work.original!.id),
  ])]
  const hasBatchPrelude = prelude.plan_patch !== undefined || deleteDayIds.length > 0
  const batchChunks: BatchPlanDaysBody[] = []
  for (let offset = 0; offset < upsertDays.length; offset += CHUNK_DAYS) {
    batchChunks.push({
      ...(offset === 0 && prelude.plan_patch ? { plan_patch: prelude.plan_patch } : {}),
      delete_day_ids: offset === 0 ? deleteDayIds : [],
      upsert_days: upsertDays.slice(offset, offset + CHUNK_DAYS),
    })
  }
  if (batchChunks.length === 0 && hasBatchPrelude) {
    batchChunks.push({
      ...(prelude.plan_patch ? { plan_patch: prelude.plan_patch } : {}),
      delete_day_ids: deleteDayIds,
      upsert_days: [],
    })
  }

  let mixedWriteCount = mixedPlans.filter((plan) => plan.hasWrites).length
  const progressTotal = batchChunks.length + mixedWriteCount
  let done = 0
  let liveBaseline = server

  try {
    // Pure unlocked days are atomically upserted/deleted in bounded sequential chunks.
    for (const body of batchChunks) {
      liveBaseline = await batchDays(planId, body)
      onProgress?.(++done, progressTotal)
    }

    // The final batch response is the new live tree and therefore the identity baseline.
    const liveByKey = new Map(liveBaseline.days.map((day) => [`${day.week_number}:${day.day_of_week}`, day]))
    for (const work of unlockedWorks) {
      for (const row of work.day?.rows ?? []) {
        row.serverRowId = null
        row.serverSortOrder = null
        row.hasLogs = false
      }
      const saved = liveByKey.get(`${work.weekNumber}:${work.dow + 1}`)
      if (saved) {
        const claims = claimBaseline(work.entries, saved.exercises)
        for (const entry of work.entries) {
          const claim = claims.get(entry.row.id)
          if (claim) {
            bindClaim(entry.row, claim)
            rememberServerSets(entry.row, claim)
          }
          entry.row.conflictMessage = null
        }
      }
    }

    // Batch returns the complete GET-shaped tree. Use the last chunk's tree as the
    // baseline for the row-level route that follows, including a second lock check.
    if (batchChunks.length > 0) {
      const refreshedLockedRows: string[] = []
      for (const work of mixedWorks) {
        work.original = liveByKey.get(`${work.weekNumber}:${work.dow + 1}`) ?? work.original
        validateMixedWork(work, refreshedLockedRows)
      }
      if (refreshedLockedRows.length > 0) {
        throw new LockedRowMutationError([...new Set(refreshedLockedRows)], syncPlanScheduleToWeeks(resultWeeks, liveBaseline))
      }
      mixedPlans = mixedWorks.map(planMixedWork)
      mixedWriteCount = mixedPlans.filter((plan) => plan.hasWrites).length
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
        rememberDesiredSets(entry.row, entry.desired.sets)
      }
      for (const entry of work.entries) {
        const claim = claims.get(entry.row.id)
        if (claim && !changed.includes(entry)) {
          bindClaim(entry.row, claim)
          rememberServerSets(entry.row, claim)
        }
      }
      if (work.day) {
        const assignedRows = new Map(work.entries.map((entry) => [entry.row.id, assigned.get(entry.row.id)!]))
        work.day.rows.sort((a, b) => {
          const aOrder = assignedRows.get(a.id) ?? Number.MAX_SAFE_INTEGER
          const bOrder = assignedRows.get(b.id) ?? Number.MAX_SAFE_INTEGER
          return aOrder - bOrder
        })
      }
      onProgress?.(++done, progressTotal)
    }
  } catch (error) {
    if (error instanceof ApiException && error.status === 409) {
      const fresh = await getPlan(planId)
      throw merge409(weeks, fresh, error, options)
    }
    throw error
  }

  for (const week of resultWeeks) for (const day of week.days) day.releasedSortOrders = []

  return {
    changedDays: unlockedWorks.length + mixedWriteCount, skippedRows, degradedRows,
    weeks: syncPlanScheduleToWeeks(resultWeeks, liveBaseline),
  }
}
