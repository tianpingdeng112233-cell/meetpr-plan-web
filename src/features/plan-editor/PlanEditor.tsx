import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ColKey, ColWidths, Week, DayCol, ExerciseRow } from './types'
import { COL_DEFAULTS, COL_MIN, isContentfulUnbound, isRestDay } from './types'
import { getBoundRowInputIssue, type BoundRowInputIssue } from './inputGuard'
import { groupActualsByExercise, groupStudentAddedByDay, type ActualSet, type StudentAddedExercise } from './actuals'
import { getStudentSetLogs } from '../../api/coach'
import { getPlan, shiftPlan, undoPlanShift } from '../../api/plans'
import {
  materializeIntensityRow, isSingleValueIntensity, rowIntensity, rowIntensityBoxes, rowWeightBoxes,
} from './intensityModel'
import { ApiException } from '../../api/client'
import { clearDayDeletionIntent, loadDayDeletionIntent, saveDayDeletionIntent, type ExplicitDayDeletion } from './dayDeletionIntent'
import { BlockGrid } from './components/BlockGrid'
import { insertBlockDay, deleteBlockDay, blockDayDeletionLocked, isBlockTrainingDay, buildBlockGrid, changeBlockPattern, blockTargetDay, fillBlockDays, changeBlockDate, changeBlockWeekday, type BlockAddress } from './blockGridModel'
import { NewPlanDialog } from '../workspace/PlanDialogs'
import { loadBlockExtraWeekdays, saveBlockExtraWeekdays, loadBlockWeekdays, saveBlockWeekdays } from '../workspace/blockPlanSettings'
import { BlockHistory } from './components/BlockHistory'
import './components/block-history.css'
import { TopBar } from './components/TopBar'
import { DayColumn } from './components/DayColumn'
import { ExercisePopover } from './components/ExercisePopover'
import { CustomExerciseDialog } from './components/CustomExerciseDialog'
import type { ExerciseIndex, ExerciseHit } from './exerciseIndex'
import type { CreateCustomExerciseInput } from '../../api/exercises'
import type {
  ExerciseResponse,
  ExerciseStatsOverview,
  PlanShiftSummary,
  PlanStatus,
  PlanWithChildren,
  StudentOnboardingProfile,
} from '../../api/types'
import type { ParsedWeek } from './import'
import {
  LockedRowMutationError, ReconcileConflict, ReconciliationError, type SaveResult,
} from './reconcile'
import { createSaveController } from './autosave'
import { classifySaveFailure } from './saveFailure'
import { formatTranslatedDaysPasteStatus, parseClipboardRows, serializeDayForClipboard, serializeRowsForClipboard } from './clipboard'
import {
  addDays,
  resizeWeeksForCount,
  applyShiftedDaysToWeeks,
  isoDate,
  mdLabel,
  recommendedDateForDay,
  projectWeekSchedule,
  relabelWeeksForStartDate,
  syncPlanScheduleToWeeks,
  type StudentPlanCursor,
} from './mapping'
import { dayMoveDisabledReason, moveDayInWeek } from './dayMove'
import { compareWeekMetric, summarizeWeek } from './weeklySummary'
import { WeekCapacitySummary } from './components/WeekCapacitySummary'
import {
  clearDraftMirror, clearDraftMirrorIfHash, createDraftMirrorWriter, draftContentHash,
  loadDraftMirror, parseDraftMirror, saveDraftMirror, type DraftMirror, type DraftMirrorContent,
} from './draftMirror'
import { createRemoteMirrorWriter, type RemoteMirrorState, type RemoteMirrorWriter } from './remoteMirror'
import { getPendingRevision, type PendingRevisionResponse } from '../../api/pendingRevision'
import { DraftMirrorBanner } from './components/DraftMirrorBanner'
import {
  absoluteDayIndex,
  applyPlanDayPlacements,
  movePlanCell,
  orderRowsForDisplay,
  planDayKey,
  planDaysInRange,
  placePlanDayOffsets,
  planCellKey,
  resolvePlanCell,
  type PlanDayTarget,
  type PlanCellField,
  type PlanCellSelection,
} from './selectionModel'
import { useGlobalKeyboardHandler } from '../workspace/globalKeyboard'
import { S, fmt, resolveLocale } from '../../i18n/strings'
import { registerReloadBlocker } from '../../reloadSafety'
import { MUSCLE_LABEL } from '../catalog/catalogModel'
import {
  reorderRowsInWeek,
  trainingDayOrdinal,
} from './weekBandModel'
import type { WeekBandBadge } from './components/DayColumn'

// Runtime identity follows snapshots and save clones; a replacement day gets
// its own identity. It is never serialized into the plan or pending revision.
type TrackedDayDeletion = ExplicitDayDeletion & { sourceToken?: object }
type Sel = PlanDayTarget
interface PopState { visible: boolean; x: number; y: number; wnum: number; dow: number; rowId: string; query: string }
interface RowTarget { wnum: number; dow: number; rowId: string }
interface RowSelection { anchor: RowTarget | null; rowIds: Set<string> }
interface DaySelection { anchor: Sel | null; days: Set<string> }
interface RowSelectionModifiers { toggle: boolean; range: boolean }
interface CreateExerciseState { open: boolean; initialName: string; bindTarget: RowTarget | null }
type ClipboardKind = 'day' | 'days' | 'row'
interface DayMoveVisual {
  fromWnum: number
  fromDow: number
  targetWnum: number | null
  targetDow: number | null
  targetValid: boolean
}

const DAY_MOVE_THRESHOLD = 5
// One automatic retry for a failed「更新计划」before the modal error (David 2026-08-23).
export const UPDATE_RETRY_DELAY = 1500

interface Switcher { id: string; label: string; tag?: string }
interface RecoveryMirror { mirror: DraftMirror; source: 'local' | 'remote' }

export interface PlanEditorProps {
  initialWeeks: Week[]
  weeksCount: number
  studentName: string
  studentId?: string
  onboardingProfile?: StudentOnboardingProfile | null
  /** Already-cached one-request overview; the editor never fans out per exercise. */
  exerciseStatsOverview?: ExerciseStatsOverview | null
  planName: string
  initialPublished?: boolean
  planStatus?: PlanStatus
  totalShiftDays?: number
  latestShift?: PlanShiftSummary | null
  /** Keeps the parent-owned server snapshot current after shift/undo refreshes. */
  onPlanRefreshed?: (plan: PlanWithChildren) => void
  /** Read-only athlete progress cursor derived from the active published plan. */
  studentPlanCursor?: StudentPlanCursor | null
  /** Completed/paused historical plans render as a true non-persisting viewer. */
  readOnly?: boolean
  /** Real publish call; when omitted the button just toggles locally (sample mode). */
  onPublish?: () => Promise<void>
  /** Save current edits back to the backend; resolves with how many contentful rows were skipped. */
  onSave?: (
    weeks: Week[],
    importStart?: string | null,
    /** Coach explicitly chose to mark past imported sessions as assumed completion. */
    markPastAsAssumedComplete?: boolean,
    onProgress?: (done: number, total: number) => void,
    deletedDayIds?: readonly string[],
  ) => Promise<SaveResult>
  /** Rename the current plan (backend PATCH); parent also refreshes its plan list. */
  onRename?: (name: string) => Promise<void> | void
  /** Rename the selected student (backend PATCH); parent refreshes the roster label. */
  onRenameStudent?: (name: string) => Promise<void> | void
  /** Exercise catalog + alias index for name-cell binding. */
  exerciseIndex?: ExerciseIndex | null
  /** Create a custom exercise and return its id+name (adds to the index). */
  onCreateExercise?: (input: CreateCustomExerciseInput) => Promise<{ id: string; name: string }>
  // top-bar switchers (connected mode)
  students?: Switcher[]
  currentStudentId?: string
  onSwitchStudent?: (id: string) => void | Promise<void>
  plans?: Switcher[]
  currentPlanId?: string
  onSwitchPlan?: (id: string) => void | Promise<void>
  onNewPlan?: () => void | Promise<void>
  onDeleteCurrentDraft?: () => void | Promise<void>
  onMarkComplete?: () => void | Promise<void>
  /** Backfill the current plan's past, unlogged sessions as assumed-complete（补记历史）. */
  onBackfillHistory?: () => void | Promise<void>
  onOpenVideos?: () => void
  onBackToBoard?: () => void | Promise<void>
  /** Registers the guarded-leave path used by workspace navigation and account controls. */
  onLeaveGuardChange?: (guard: (() => Promise<boolean>) | null) => void
  /** Keeps the parent-owned plan switcher tag synchronized with remote mirror writes/deletes. */
  onPendingRevisionSavedAtChange?: (savedAt: string | null) => void
  /** While true (guarded view switch in flight) global shortcuts must not mutate weeks. */
  suspended?: boolean
  /** Current plan start date; enables xlsx import date remapping. */
  planStartDate?: string
  /** Server plan-tree timestamp used to arbitrate draft pending revisions on load. */
  planUpdatedAt?: string
  onChangeStartDate?: (startDate: string) => Promise<void>
  onChangePlanWeeks?: (planWeeks: number) => Promise<void>
}

function hasGridContent(weeks: Week[]): boolean {
  return weeks.some((week) => week.days.some((day) => day.rows.length > 0))
}

function emptyTrainingDays(weeks: Week[], start: string | null) {
  return buildBlockGrid(weeks, start).rows.flatMap(row => row.cells)
    .filter(cell => cell.day && !cell.day.rest && cell.day.rows.length === 0)
}

function mirrorContent(weeks: Week[], planStartDate: string | null, weeksCount = weeks.length): DraftMirrorContent {
  return { weeks: weeks.map(week => ({ ...week, days: week.days.map(day => (
    day.rest && !day.rows.length ? { ...day, serverDayId: null } : day
  )) })), planStartDate, weeksCount }
}

function pendingResponseMirror(planId: string, response: PendingRevisionResponse): DraftMirror | null {
  return parseDraftMirror({
    version: response.version,
    planId: response.plan_id,
    savedAt: response.saved_at,
    contentHash: response.content_hash,
    content: response.content,
  }, planId)
}

function savedClock(iso: string): string {
  try {
    return new Intl.DateTimeFormat(resolveLocale() === 'zh' ? 'zh-CN' : 'en-US', {
      hour: '2-digit', minute: '2-digit', hour12: false,
    }).format(new Date(iso))
  } catch {
    return iso
  }
}

function hasParsedWeekContent(week: ParsedWeek): boolean {
  return week.days.some((day) => day.exercises.length > 0)
}

export interface IssueRow {
  rowId: string
  kind: 'unbound' | 'noSets'
}

interface DetailedIssueRow extends IssueRow {
  inputIssue?: BoundRowInputIssue
}

function findDetailedIssueRows(wks: Week[]): DetailedIssueRow[] {
  const issues: DetailedIssueRow[] = []
  for (const wk of wks) for (const d of wk.days) {
    if (isRestDay(d)) continue
    for (const r of d.rows) {
      if (r.hasLogs) continue
      if (isContentfulUnbound(r)) issues.push({ rowId: r.id, kind: 'unbound' })
      else {
        const inputIssue = getBoundRowInputIssue(r)
        if (inputIssue) issues.push({ rowId: r.id, kind: 'noSets', inputIssue })
      }
    }
  }
  return issues
}

/** Grid-order issue list used by both the chip count and its cycling cursor. */
export function findIssueRows(wks: Week[]): IssueRow[] {
  return findDetailedIssueRows(wks).map(({ rowId, kind }) => ({ rowId, kind }))
}

function importRangeLabel(weeks: Week[]): string {
  const first = weeks[0]
  const last = weeks[weeks.length - 1]
  const start = first?.days[0]?.dateLabel
  const end = last?.days[6]?.dateLabel
  return start && end ? `${start}–${end}` : ''
}

function isPastISODate(iso: string): boolean {
  const [year, month, day] = iso.split('-').map(Number)
  const candidate = new Date(year, month - 1, day)
  if (
    !Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)
    || candidate.getFullYear() !== year || candidate.getMonth() !== month - 1 || candidate.getDate() !== day
  ) return false
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  return candidate < today
}

type WeeksUpdate = Week[] | ((prev: Week[]) => Week[])
interface DayClipboard { rows: ExerciseRow[] }
interface DaysClipboardDay extends DayClipboard { offset: number }
interface DaysClipboard { days: DaysClipboardDay[] }

function cloneRow(row: ExerciseRow, prefix: string, index: number): ExerciseRow {
  const source = materializeIntensityRow(row)
  return {
    ...source,
    id: `${prefix}-${index}-${Date.now()}-${Math.round(performance.now())}`,
    serverRowId: null,
    serverSortOrder: null,
    hasLogs: false,
    conflictMessage: null,
    intensity: source.intensity ? { ...source.intensity } : source.intensity,
    intensityBoxes: source.intensityBoxes?.map((box) => ({ ...box })),
    boxes: source.boxes.map((box) => ({ ...box })),
    opaqueSets: source.opaqueSets?.map(set => ({ ...set })),
  }
}

function cloneRows(rows: ExerciseRow[], prefix: string): ExerciseRow[] {
  return rows.map((row, index) => cloneRow(row, prefix, index))
}

function cloneDayClipboard(day: DayCol): DayClipboard {
  return { rows: cloneRows(day.rows, 'clip') }
}

function dayDisplay(week: Week, day: DayCol): string {
  const ordinal = trainingDayOrdinal(week, day.dow)
  return `${ordinal == null ? '' : `D${ordinal} · `}${day.dowLabel} ${day.dateLabel}`
}

function singleRowSelection(anchor: RowTarget | null): RowSelection {
  return { anchor, rowIds: new Set(anchor ? [anchor.rowId] : []) }
}

function singleDaySelection(anchor: Sel | null): DaySelection {
  return { anchor, days: new Set(anchor ? [planDayKey(anchor)] : []) }
}

function convergeDaySelection(selection: DaySelection, weeks: Week[]): DaySelection {
  const { anchor } = selection
  if (!anchor) return selection.days.size === 0 ? selection : singleDaySelection(null)
  const validKeys = new Set(weeks.flatMap((week) => (
    week.days.map((day) => planDayKey({ wnum: week.num, dow: day.dow }))
  )))
  if (!validKeys.has(planDayKey(anchor))) return singleDaySelection(null)
  // A visible-week change can hide a single selected day while retaining its
  // Shift anchor. Week relabels/resizes must not make that hidden day reappear.
  if (selection.days.size === 0) return selection
  const days = new Set([...selection.days].filter((key) => validKeys.has(key)))
  days.add(planDayKey(anchor))
  const unchanged = days.size === selection.days.size
    && [...days].every((key) => selection.days.has(key))
  return unchanged ? selection : { anchor, days }
}

function convergeRowSelection(
  selection: RowSelection,
  weeks: Week[],
  resolveTier: (row: ExerciseRow) => 'main' | 'aux',
): RowSelection {
  const { anchor } = selection
  if (!anchor) return selection.rowIds.size === 0 ? selection : singleRowSelection(null)
  const day = weeks.find((week) => week.num === anchor.wnum)?.days.find((item) => item.dow === anchor.dow)
  if (!day) return singleRowSelection(null)
  const orderedIds = orderRowsForDisplay(day.rows, resolveTier)
    .filter((row) => selection.rowIds.has(row.id))
    .map((row) => row.id)
  if (orderedIds.length === 0) return singleRowSelection(null)
  const anchorId = orderedIds.includes(anchor.rowId) ? anchor.rowId : orderedIds[0]
  const unchanged = anchorId === anchor.rowId
    && orderedIds.length === selection.rowIds.size
    && orderedIds.every((rowId) => selection.rowIds.has(rowId))
  return unchanged
    ? selection
    : { anchor: { ...anchor, rowId: anchorId }, rowIds: new Set(orderedIds) }
}

/** Whole-day paste keeps immutable rows in place, replaces only editable slots,
 * and appends overflow at the visible tail. */
export function replaceUnlockedRows(day: DayCol, sourceRows: ExerciseRow[], prefix = 'paste'): DayCol {
  const replacements = cloneRows(sourceRows, prefix)
  const unlocked = day.rows.filter((row) => !row.hasLogs)
  const replacementCount = Math.min(replacements.length, unlocked.length)
  for (let index = 0; index < replacementCount; index++) {
    replacements[index].serverSortOrder = unlocked[index].serverSortOrder
  }

  let nextReplacement = 0
  const rows = day.rows.flatMap((row) => {
    if (row.hasLogs) return [row]
    if (nextReplacement >= replacementCount) return []
    return [replacements[nextReplacement++]]
  })
  rows.push(...replacements.slice(replacementCount))

  const released = new Set(day.releasedSortOrders ?? [])
  for (const row of unlocked.slice(replacementCount)) {
    if (row.serverSortOrder != null) released.add(row.serverSortOrder)
  }
  return {
    ...day,
    rest: rows.length === 0,
    rows,
    releasedSortOrders: [...released].sort((a, b) => a - b),
  }
}

export function PlanEditor(props: PlanEditorProps) {
  const { initialWeeks, weeksCount, studentName, planName, initialPublished = false, onPublish } = props
  const readOnly = props.readOnly ?? (props.planStatus === 'completed' || props.planStatus === 'paused')
  /** Display tier for a row: catalog exercise_type is authoritative (main lift +
   *  variations vs accessories); unbound/unknown rows fall back to is_main_lift. */
  const rowTier = useCallback((row: ExerciseRow): 'main' | 'aux' => {
    if (row.exerciseId && props.exerciseIndex) {
      const t = props.exerciseIndex.typeById(row.exerciseId)
      if (t) return t === 'accessory' ? 'aux' : 'main'
    }
    return row.isMain ? 'main' : 'aux'
  }, [props.exerciseIndex])
  const [weeks, setWeeks] = useState<Week[]>(initialWeeks)
  const latestWeeks = useRef(weeks)
  latestWeeks.current = weeks
  const displayWeeks = useMemo(
    () => weeks.map((week) => ({
      ...week,
      days: week.days.map((day) => ({ ...day, rows: orderRowsForDisplay(day.rows, rowTier) })),
    })),
    [rowTier, weeks],
  )
  const latestDisplayWeeks = useRef(displayWeeks)
  latestDisplayWeeks.current = displayWeeks
  const mirrorPlanId = props.currentPlanId
  const initialServerMirrorContent = useRef(mirrorContent(
    initialWeeks,
    props.planStartDate ?? null,
    initialWeeks.length || weeksCount,
  ))
  const lastSavedDraftContent = useRef(initialServerMirrorContent.current)
  const serverMirrorHash = useRef(draftContentHash(initialServerMirrorContent.current))
  const mountedMirror = useRef<DraftMirror | null>(readOnly ? null : loadDraftMirror(mirrorPlanId))
  const waitsForRemoteRecovery = !!mirrorPlanId && !readOnly && (initialPublished || !!props.planUpdatedAt)
  const mountedLocalCandidate = mountedMirror.current?.contentHash !== serverMirrorHash.current
    ? mountedMirror.current
    : null
  const [recoveryMirror, setRecoveryMirror] = useState<RecoveryMirror | null>(() => {
    if (waitsForRemoteRecovery || !mountedLocalCandidate) return null
    return { mirror: mountedLocalCandidate, source: 'local' }
  })
  const [recoveryReady, setRecoveryReady] = useState(!waitsForRemoteRecovery)
  const [remoteMirrorState, setRemoteMirrorState] = useState<RemoteMirrorState>({ status: 'idle' })
  const remoteMirrorStateRef = useRef(remoteMirrorState)
  remoteMirrorStateRef.current = remoteMirrorState
  // Flipped on unmount so a delayed「更新计划」retry never fires against a plan the
  // coach already left (PlanEditor is keyed per plan, so switching plans unmounts).
  const aliveRef = useRef(true)
  useEffect(() => {
    aliveRef.current = true
    return () => { aliveRef.current = false }
  }, [])
  const remoteHasDirtyContent = useRef(false)
  const pendingRevisionChangeRef = useRef(props.onPendingRevisionSavedAtChange)
  pendingRevisionChangeRef.current = props.onPendingRevisionSavedAtChange
  const remoteWriter = useRef<RemoteMirrorWriter | null>(null)
  const [publishedDirty, setPublishedDirty] = useState(false)
  const publishedDirtyRef = useRef(publishedDirty)
  publishedDirtyRef.current = publishedDirty
  const mirrorWriter = useRef(createDraftMirrorWriter({ planId: mirrorPlanId }))

  useEffect(() => {
    if (!mirrorPlanId) return
    const writer = createRemoteMirrorWriter({
      planId: mirrorPlanId,
      // PlanEditor owns the single beforeunload hook so local and remote
      // mirrors flush together without issuing duplicate keepalive PUTs.
      eventTarget: null,
      onState: (state) => {
        setRemoteMirrorState(state)
        if (state.status === 'saved') pendingRevisionChangeRef.current?.(state.savedAt)
      },
    })
    remoteWriter.current = writer
    return () => {
      writer.dispose()
      if (remoteWriter.current === writer) remoteWriter.current = null
    }
  }, [mirrorPlanId])

  useEffect(() => {
    const local = mountedMirror.current
    if (!waitsForRemoteRecovery || !mirrorPlanId) {
      if (local && local.contentHash === serverMirrorHash.current) clearDraftMirror(mirrorPlanId)
      return
    }
    let cancelled = false
    void getPendingRevision(mirrorPlanId)
      .then((response) => {
        if (cancelled) return
        let remote = response ? pendingResponseMirror(mirrorPlanId, response) : null
        if (response && (!remote || remote.contentHash === serverMirrorHash.current)) {
          remote = null
          remoteWriter.current?.clear()
          pendingRevisionChangeRef.current?.(null)
        } else if (remote) {
          pendingRevisionChangeRef.current?.(remote.savedAt)
        }
        const localCandidate = local && local.contentHash !== serverMirrorHash.current ? local : null
        if (local && !localCandidate) clearDraftMirror(mirrorPlanId)
        if (!initialPublished) {
          const treeSavedAt = Date.parse(props.planUpdatedAt ?? '')
          const remoteSavedAt = remote ? Date.parse(remote.savedAt) : Number.NEGATIVE_INFINITY
          const localSavedAt = localCandidate ? Date.parse(localCandidate.savedAt) : Number.NEGATIVE_INFINITY
          const validTreeSavedAt = Number.isFinite(treeSavedAt) ? treeSavedAt : Number.NEGATIVE_INFINITY
          const localIsNewest = !!localCandidate
            && localSavedAt > validTreeSavedAt
            && localSavedAt > remoteSavedAt

          if (localIsNewest) {
            setRecoveryMirror({ mirror: localCandidate, source: 'local' })
            setRecoveryReady(true)
            return
          }
          if (localCandidate) clearDraftMirror(mirrorPlanId)
          if (remote && remoteSavedAt > validTreeSavedAt) {
            const { content } = remote
            setWeeks(content.weeks)
            const metadataChanged = content.planStartDate !== persistedPlanStart.current
              || content.weeksCount !== initialServerMirrorContent.current.weeksCount
            currentPlanStart.current = content.planStartDate
            setPlanStartDate(content.planStartDate)
            pendingPlanStart.current = metadataChanged ? content.planStartDate : null
            saveDraftMirror(mirrorPlanId, content)
            setRecoveryMirror(null)
            setRecoveryReady(true)
            return
          }
          if (remote) {
            remoteWriter.current?.clear()
            pendingRevisionChangeRef.current?.(null)
          }
          setRecoveryMirror(null)
          setRecoveryReady(true)
          return
        }
        const candidates: RecoveryMirror[] = [
          ...(localCandidate ? [{ mirror: localCandidate, source: 'local' as const }] : []),
          ...(remote ? [{ mirror: remote, source: 'remote' as const }] : []),
        ]
        candidates.sort((a, b) => Date.parse(b.mirror.savedAt) - Date.parse(a.mirror.savedAt))
        setRecoveryMirror(candidates[0] ?? null)
        setRecoveryReady(true)
      })
      .catch(() => {
        if (cancelled) return
        let localCandidate = local && local.contentHash !== serverMirrorHash.current ? local : null
        // Draft arbitration is timestamp-based (spec 039 §2.3). When the remote
        // GET fails we can't see the snapshot, but the tree timestamp is still
        // known: never offer a local stash older than the tree — restoring it
        // would let autosave overwrite newer server content.
        if (localCandidate && !initialPublished) {
          const treeSavedAt = Date.parse(props.planUpdatedAt ?? '')
          if (Number.isFinite(treeSavedAt) && Date.parse(localCandidate.savedAt) <= treeSavedAt) {
            localCandidate = null
          }
        }
        setRecoveryMirror(localCandidate ? { mirror: localCandidate, source: 'local' } : null)
        setRecoveryReady(true)
      })
    return () => { cancelled = true }
  }, [initialPublished, mirrorPlanId, props.planUpdatedAt, waitsForRemoteRecovery])
  const suspendedRef = useRef(false)
  suspendedRef.current = !!props.suspended
  // Keep the displayed start date separate from the metadata change waiting to
  // be persisted. Clearing a pending save must never make a second date shift
  // calculate from the old parent prop, and undo/redo needs the real date too.
  const currentPlanStart = useRef<string | null>(props.planStartDate ?? null)
  const persistedPlanStart = useRef<string | null>(props.planStartDate ?? null)
  const pendingPlanStart = useRef<string | null>(null)
  const [planStartDate, setPlanStartDate] = useState<string | null>(props.planStartDate ?? null)
  // Presentation-only fallback keeps cleared Dx targets available during this edit session.
  const lastBlockWeekdays = useRef(buildBlockGrid(initialWeeks, props.planStartDate).columns.filter(column => column.patternIndex !== null).map(column => column.weekday))
  const [columnWeekdays, setColumnWeekdays] = useState<Record<number, number>>(() => Object.fromEntries((loadBlockWeekdays(props.currentPlanId) ?? []).map((day, dx) => [dx, day])))
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [setsDraft, setSetsDraft] = useState<{ rowId: string; value: string | null } | null>(null)
  const [extraWeekdays, setExtraWeekdays] = useState<number[]>(() => [...new Set([...loadBlockExtraWeekdays(props.currentPlanId),
    ...buildBlockGrid(initialWeeks, props.planStartDate).columns.filter(column => column.patternIndex === null).map(column => column.weekday)])])
  const observedColumns = buildBlockGrid(weeks, planStartDate, [], extraWeekdays).columns.filter(column => column.patternIndex !== null)
  const blockWeekdays = Array.from({ length: Math.max(Object.keys(columnWeekdays).length, lastBlockWeekdays.current.length, observedColumns.length) }, (_, dx) => (
    columnWeekdays[dx] ?? observedColumns[dx]?.weekday ?? lastBlockWeekdays.current[dx] ?? 0
  ))
  lastBlockWeekdays.current = blockWeekdays


  // Kept with the import token so an autosave retry reuses the coach's explicit
  // answer rather than prompting again or silently changing historical data.
  const importedPastHistory = useRef(false)
  const [colW, setColW] = useState<ColWidths[]>(() => Array.from({ length: 7 }, () => ({ ...COL_DEFAULTS })))
  const [editingDay, setEditingDay] = useState<Sel | null>(null)
  const [blockMenu, setBlockMenu] = useState<{ x: number; y: number } | null>(null)
  const [sel, setSel] = useState<Sel | null>(null)
  // SPEC-038:学员实际完成组,serverRowId → sets。失败静默(编排主流程不受影响)。
  const [actualsByExercise, setActualsByExercise] = useState<Map<string, ActualSet[]>>(() => new Map())
  const [studentAddedByDay, setStudentAddedByDay] = useState<Map<string, StudentAddedExercise[]>>(() => new Map())
  const hasServerDay = weeks.some((week) => week.days.some((day) => !!day.serverDayId))
  const anyRowHasLogs = weeks.some((week) => week.days.some((day) => day.rows.some((row) => row.hasLogs)))
  useEffect(() => {
    const studentId = props.studentId
    const from = planStartDate
    const today = isoDate(new Date())
    if (!studentId || !from || (!anyRowHasLogs && !hasServerDay) || from > today) return
    let cancelled = false
    void getStudentSetLogs(studentId, from, isoDate(addDays(today, 1)))
      .then((logs) => {
        if (cancelled) return
        setActualsByExercise(groupActualsByExercise(logs))
        setStudentAddedByDay(groupStudentAddedByDay(logs))
      })
      .catch(() => {})
    return () => { cancelled = true }
  }, [props.studentId, planStartDate, anyRowHasLogs, hasServerDay])
  const actualsForRow = useCallback((row: ExerciseRow): ActualSet[] | null => (
    row.serverRowId ? actualsByExercise.get(row.serverRowId) ?? null : null
  ), [actualsByExercise])
  const e1rmForRow = useCallback((row: ExerciseRow): number | null => {
    const metadata = row.exerciseId ? props.exerciseIndex?.bandMetadataById(row.exerciseId) : null
    const family = metadata && metadata.exercise_type !== 'accessory' ? metadata.main_lift_family : null
    const value = family ? props.exerciseStatsOverview?.e1rm?.[family]?.value : null
    const parsed = value == null ? NaN : Number(value)
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null
  }, [props.exerciseIndex, props.exerciseStatsOverview])
  const [daySelection, setDaySelection] = useState<DaySelection>(() => singleDaySelection(null))
  const daySelectionRef = useRef(daySelection)
  daySelectionRef.current = daySelection
  const [rowSelection, setRowSelection] = useState<RowSelection>(() => singleRowSelection(null))
  const selectedRow = rowSelection.anchor
  const selectedRowIds = rowSelection.rowIds
  const [cellSelection, setCellSelection] = useState<PlanCellSelection | null>(null)
  // Authoritative published state, initialized from the backend plan status. Monotonic:
  // set true on a real publish and never cleared — there is no backend unpublish, so 发布后不可撤回.
  // Published plans remain editable, but only through explicit confirmed updates;
  // rows with server-authoritative history are locked individually.
  const [published, setPublished] = useState(initialPublished)
  const [statusText, setStatusText] = useState(readOnly
    ? S.editor.readOnlyStatus(props.planStatus === 'completed' ? S.common.completed : S.common.paused)
    : initialPublished ? S.editor.publishedTo(studentName) : S.editor.draftSavedInitial)
  const undoShiftInFlight = useRef(false)
  const [undoingShift, setUndoingShift] = useState(false)
  const [undoNeedsRefresh, setUndoNeedsRefresh] = useState(false)
  const [totalShiftDays, setTotalShiftDays] = useState(props.totalShiftDays ?? 0)
  const [latestShift, setLatestShift] = useState<PlanShiftSummary | null>(props.latestShift ?? null)
  const [degradedSaveStatus, setDegradedSaveStatus] = useState<{ base: string; count: number } | null>(null)
  // W1 calendar/delete controls are draft-only. Keep this separate from main's
  // `published` flag, which drives explicit in-place updates for spec 004.
  const statusCalendarLocked = props.planStatus != null ? props.planStatus !== 'draft' : published
  // Day dragging is allowed on live plans too (David 2026-07-18): a published
  // plan never autosaves, so a move only reaches the student after the
  // explicit「更新计划」confirm. Logged days stay frozen via dayMoveDisabledReason.
  const dayMoveLocked = props.planStatus != null
    ? props.planStatus !== 'draft' && props.planStatus !== 'published'
    : false
  const [pop, setPop] = useState<PopState>({ visible: false, x: 0, y: 0, wnum: 0, dow: 0, rowId: '', query: '' })
  const [activeIndex, setActiveIndex] = useState(0)
  const [createExercise, setCreateExercise] = useState<CreateExerciseState>({ open: false, initialName: '', bindTarget: null })
  const [creatingExercise, setCreatingExercise] = useState(false)
  const [createExerciseError, setCreateExerciseError] = useState('')
  const [dayMoveVisual, setDayMoveVisual] = useState<DayMoveVisual | null>(null)
  const initialVisibleWeekIndex = Math.max(0, initialWeeks.findIndex((week) => week.isCurrent))
  const [visibleWeekIndex, setVisibleWeekIndex] = useState(initialVisibleWeekIndex)

  useEffect(() => { setTotalShiftDays(props.totalShiftDays ?? 0) }, [props.totalShiftDays])
  useEffect(() => { setLatestShift(props.latestShift ?? null) }, [props.latestShift])

  const rootRef = useRef<HTMLDivElement>(null)
  const scrollerRef = useRef<HTMLDivElement>(null)
  const weeksRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef<{ dow: number; col: ColKey; startX: number; startW: number; el: HTMLElement } | null>(null)
  const panRef = useRef<{ x: number; y: number; sl: number; st: number } | null>(null)
  const historyRef = useRef<Week[][]>([])
  const redoRef = useRef<Week[][]>([])
  const historyStartRef = useRef<(string | null)[]>([])
  const redoStartRef = useRef<(string | null)[]>([])
  // Session-only edit intent follows the same undo/redo boundary as content.
  const daySourceTokens = useRef(new WeakMap<ExerciseRow[], object>())
  const daySourceToken = useCallback((rows: ExerciseRow[]) => {
    let token = daySourceTokens.current.get(rows)
    if (!token) { token = {}; daySourceTokens.current.set(rows, token) }
    return token
  }, [])
  const deletedDaysRef = useRef<TrackedDayDeletion[]>([])
  const historyDeletedDaysRef = useRef<TrackedDayDeletion[][]>([])
  const redoDeletedDaysRef = useRef<TrackedDayDeletion[][]>([])
  const requestedDeletedDayIds = (snapshot: Week[]) => deletedDaysRef.current.filter(deleted => {
    const day = snapshot.find(week => week.num === deleted.weekNumber)?.days.find(day => day.dow === deleted.dow)
    return !day || (day.rest && !day.rows.length)
  }).flatMap(deleted => deleted.id ? [deleted.id] : [])
  const dayClipboardRef = useRef<DayClipboard | null>(null)
  const daysClipboardRef = useRef<DaysClipboard | null>(null)
  const rowClipboardRef = useRef<ExerciseRow[] | null>(null)
  const clipboardKindRef = useRef<ClipboardKind | null>(null)
  const clipboardTextRef = useRef('')
  const nameComposingRef = useRef(false)
  const suppressDayClickRef = useRef(false)
  const dayMoveCleanupRef = useRef<((updateVisual?: boolean) => void) | null>(null)
  const visibleWeekRef = useRef<number | null>(null)
  const skipNextScheduleAutosave = useRef(false)
  useEffect(() => () => dayMoveCleanupRef.current?.(false), [])

  useEffect(() => {
    setDaySelection((current) => convergeDaySelection(current, weeks))
    setSel((current) => current && !weeks.some((week) => (
      week.num === current.wnum && week.days.some((day) => day.dow === current.dow)
    )) ? null : current)
    setRowSelection((current) => convergeRowSelection(current, displayWeeks, rowTier))
    setCellSelection((current) => current && !resolvePlanCell(displayWeeks, current) ? null : current)
  }, [displayWeeks, rowTier, weeks])

  useEffect(() => {
    // Parent metadata is authoritative after loading/saving. Do not overwrite a
    // local date while it is still waiting to be reconciled.
    if (pendingPlanStart.current === null) {
      currentPlanStart.current = props.planStartDate ?? null
      persistedPlanStart.current = props.planStartDate ?? null
      setPlanStartDate(props.planStartDate ?? null)
    }
  }, [props.planStartDate])

  const updateScheduleHistory = useCallback((update: (snapshot: Week[]) => Week[]) => {
    historyRef.current = historyRef.current.map(update)
    redoRef.current = redoRef.current.map(update)
  }, [])

  const applyScheduleUpdate = useCallback((
    update: (snapshot: Week[]) => Week[],
    options?: { currentWeeks: Week[] },
  ) => {
    if (!options) skipNextScheduleAutosave.current = true
    setWeeks((current) => {
      // Prescription history must not roll back the backend-owned schedule.
      updateScheduleHistory(update)
      return options?.currentWeeks ?? update(current)
    })
  }, [updateScheduleHistory])

  const applyRefreshedShiftPlan = useCallback((plan: PlanWithChildren) => {
    applyScheduleUpdate((snapshot) => syncPlanScheduleToWeeks(snapshot, plan))
    setTotalShiftDays(plan.total_shift_days)
    setLatestShift(plan.latest_shift)
    setUndoNeedsRefresh(false)
    props.onPlanRefreshed?.(plan)
  }, [applyScheduleUpdate, props.onPlanRefreshed])

  const refreshShiftPlan = useCallback(async () => {
    if (!props.currentPlanId) return null
    const plan = await getPlan(props.currentPlanId)
    applyRefreshedShiftPlan(plan)
    return plan
  }, [applyRefreshedShiftPlan, props.currentPlanId])

  const handlePlanShift = useCallback(async (anchorDate: string, offsetDays: number) => {
    const id = props.currentPlanId
    const startDate = currentPlanStart.current
    if (!id || !startDate) throw new Error('PLAN_SHIFT_CONTEXT_MISSING')
    let response
    try {
      response = await shiftPlan(id, { anchor_date: anchorDate, offset_days: offsetDays })
    } catch (caught) {
      if (caught instanceof ApiException && caught.status === 409 && caught.code === 'SHIFT_NO_TARGET_DAYS') {
        await refreshShiftPlan().catch(() => null)
      }
      throw caught
    }
    applyScheduleUpdate((snapshot) => applyShiftedDaysToWeeks(snapshot, startDate, response.shifted_days))
    setTotalShiftDays(response.total_shift_days)
    setLatestShift({
      batch_id: response.batch_id,
      actor_role: 'coach',
      anchor_date: response.anchor_date,
      offset_days: response.offset_days,
      created_at: new Date().toISOString(),
    })
    await refreshShiftPlan().catch(() => null)
    setStatusText(S.editor.shiftSucceeded(offsetDays))
  }, [applyScheduleUpdate, props.currentPlanId, refreshShiftPlan])

  const handleUndoPlanShift = useCallback(async () => {
    const id = props.currentPlanId
    const batch = latestShift
    if (!id || !batch || readOnly || props.planStatus !== 'published' || undoShiftInFlight.current) return
    if (!undoNeedsRefresh && !window.confirm(S.editor.undoShiftConfirm(
      mdLabel(addDays(batch.anchor_date, 0)),
      batch.offset_days,
    ))) return
    undoShiftInFlight.current = true
    setUndoingShift(true)
    let undone = undoNeedsRefresh
    try {
      if (!undone) {
        try {
          await undoPlanShift(id)
        } catch (caught) {
          if (!(caught instanceof ApiException && caught.status === 409 && caught.code === 'NO_ACTIVE_SHIFT')) throw caught
        }
        // DELETE has already consumed the latest batch. A failed GET must never
        // turn a refresh retry into another DELETE against the previous batch.
        undone = true
        setUndoNeedsRefresh(true)
      }
      await refreshShiftPlan()
      setStatusText(S.editor.undoShiftSucceeded)
    } catch {
      setStatusText(undone ? S.editor.undoShiftRefreshFailed : S.editor.undoShiftFailed)
    } finally {
      undoShiftInFlight.current = false
      setUndoingShift(false)
    }
  }, [latestShift, props.currentPlanId, props.planStatus, readOnly, refreshShiftPlan, undoNeedsRefresh])

  const setWeeksWithHistory = useCallback((update: WeeksUpdate, deleted: TrackedDayDeletion[] = []) => {
    if (readOnly) return
    const startSnapshot = currentPlanStart.current
    setWeeks((prev) => {
      const next = typeof update === 'function' ? update(prev) : update
      if (next === prev) return prev
      historyRef.current = [...historyRef.current.slice(-49), prev]
      historyStartRef.current = [...historyStartRef.current.slice(-49), startSnapshot]
      historyDeletedDaysRef.current = [...historyDeletedDaysRef.current.slice(-49), deletedDaysRef.current]
      deletedDaysRef.current = [...deletedDaysRef.current, ...deleted].filter(removal => {
        const day = next.find(week => week.num === removal.weekNumber)?.days.find(day => day.dow === removal.dow)
        return !day || (day.rest && !day.rows.length)
      })
      redoDeletedDaysRef.current = []
      redoRef.current = []
      redoStartRef.current = []
      return next
    })
  }, [readOnly])

  const markMirrorCovered = useCallback((content: DraftMirrorContent) => {
    const hash = draftContentHash(content)
    serverMirrorHash.current = hash
    mirrorWriter.current.dropPendingIfHash(hash)
    clearDraftMirrorIfHash(mirrorPlanId, hash)
    clearDayDeletionIntent(mirrorPlanId, hash)
    remoteWriter.current?.markCovered(hash)
    pendingRevisionChangeRef.current?.(null)
    if (published) {
      const current = mirrorContent(
        latestWeeks.current,
        currentPlanStart.current,
        latestWeeks.current.length || props.weeksCount,
      )
      const stillDirty = draftContentHash(current) !== hash
      remoteHasDirtyContent.current = stillDirty
      setPublishedDirty(stillDirty)
    }
  }, [mirrorPlanId, props.weeksCount, published])

  useEffect(() => {
    // The writer keeps running while the recovery banner is open: the banner's
    // candidate lives in React state, so edits typed before the coach decides
    // still reach storage instead of going unprotected.
    if (readOnly) return
    const content = mirrorContent(
      weeks,
      currentPlanStart.current,
      weeks.length || props.weeksCount,
    )
    const hash = draftContentHash(content)
    if (mirrorPlanId && hash !== serverMirrorHash.current) {
      saveDayDeletionIntent(mirrorPlanId, hash, deletedDaysRef.current)
    }
    if (waitsForRemoteRecovery && !recoveryReady) {
      // Do not overwrite/delete an unread remote candidate. Fresh edits still
      // reach the fast local mirror while the GET is in flight.
      if (hash !== serverMirrorHash.current) {
        setPublishedDirty(true)
        if (mirrorPlanId) mirrorWriter.current.schedule(content)
      }
      return
    }
    if (hash === serverMirrorHash.current) {
      if (published) setPublishedDirty(false)
      if (!mirrorPlanId) return
      // Content is back at the server baseline (e.g. undo): there is no draft
      // left to protect, so drop ANY pending write and wipe the stored mirror
      // outright — a hash-conditional clean would leave the undone draft to
      // resurrect on reload. An open banner still owns its stored candidate.
      mirrorWriter.current.cancel()
      if (!recoveryMirror) {
        clearDraftMirror(mirrorPlanId)
        clearDayDeletionIntent(mirrorPlanId)
        if (remoteHasDirtyContent.current) {
          remoteWriter.current?.clear()
          remoteHasDirtyContent.current = false
          pendingRevisionChangeRef.current?.(null)
        }
      }
      return
    }
    if (published) setPublishedDirty(true)
    if (!mirrorPlanId) return
    remoteHasDirtyContent.current = true
    remoteWriter.current?.schedule(content)
    mirrorWriter.current.schedule(content)
  }, [mirrorPlanId, props.weeksCount, published, readOnly, recoveryMirror, recoveryReady, waitsForRemoteRecovery, weeks])

  useEffect(() => {
    const writer = mirrorWriter.current
    return () => {
      writer.cancel()
    }
  }, [])

  const restoreDraftMirror = useCallback(() => {
    if (!recoveryMirror || readOnly) return
    const { content } = recoveryMirror.mirror
    const restoredDeletions: TrackedDayDeletion[] = (mirrorPlanId ? loadDayDeletionIntent(mirrorPlanId, recoveryMirror.mirror.contentHash) : [])
      .map(deleted => {
        const day = latestWeeks.current.find(week => week.num === deleted.weekNumber)?.days.find(day => day.dow === deleted.dow && day.serverDayId === deleted.id)
        return { ...deleted, sourceToken: day ? daySourceToken(day.rows) : undefined }
      })
    clearDraftMirror(mirrorPlanId)
    remoteWriter.current?.clear()
    remoteHasDirtyContent.current = false
    pendingRevisionChangeRef.current?.(null)
    // Restoring means the coach chose this candidate as THE current draft, so
    // it synchronously takes over the single storage slot — replacing even a
    // newer mirror written while the banner was open. An immediate save then
    // cleans exactly this content; a crash right after restore recovers it.
    if (published) {
      // A published update never writes calendar metadata (importStart is
      // always null), so restoring it would strand local-only date/weeks that
      // could later be mistaken for covered. Merge row content week-by-week
      // instead: the week list keeps the server's exact shape, so a shorter
      // draft-era mirror can never turn into server-week deletions on save.
      const merged = latestWeeks.current.map((wk) => {
        const mirroredWeek = content.weeks.find((mirrored) => mirrored.num === wk.num)
        if (!mirroredWeek) return wk
        return {
          ...wk,
          days: wk.days.map((day) => {
            const mirroredDay = mirroredWeek.days.find((candidate) => candidate.dow === day.dow)
            if (!mirroredDay) return day
            const locked = blockDayDeletionLocked(day) || !!(day.serverDayId && studentAddedByDay.get(day.serverDayId)?.length)
            // Old v3 snapshots normalized existing empty days to rest:true but
            // retained their identity. New explicit deletions have no identity.
            const keepLegacyEmpty = !day.rows.length && !!day.serverDayId && !!mirroredDay.serverDayId
            const removing = mirroredDay.rest && !mirroredDay.rows.length
            if (removing && locked) return day
            // A mirror alone is not proof of an explicit Delete action. Without
            // this device's matching intent, keep a server empty day for review.
            if (removing && !day.rows.length && day.serverDayId
              && !restoredDeletions.some(deleted => deleted.id === day.serverDayId)) return day
            return {
              ...day,
              rows: mirroredDay.rows,
              releasedSortOrders: mirroredDay.releasedSortOrders,
              rest: keepLegacyEmpty && removing ? false : mirroredDay.rest,
              // An empty/rest snapshot explicitly removes this day. Live history
              // remains authoritative and cannot be deleted by restoring a mirror.
              serverDayId: removing && !keepLegacyEmpty ? null : day.serverDayId,
            }
          }),
        }
      })
      setWeeksWithHistory(merged, restoredDeletions)
      saveDraftMirror(mirrorPlanId, mirrorContent(
        merged, currentPlanStart.current, merged.length || props.weeksCount,
      ))
      setRecoveryMirror(null)
      return
    }
    // History first: setWeeksWithHistory snapshots currentPlanStart at call
    // time, so undo must capture the pre-restore date, not the mirror's.
    setWeeksWithHistory(content.weeks, restoredDeletions)
    const metadataChanged = content.planStartDate !== persistedPlanStart.current
      || content.weeksCount !== initialServerMirrorContent.current.weeksCount
    currentPlanStart.current = content.planStartDate
    setPlanStartDate(content.planStartDate)
    pendingPlanStart.current = metadataChanged ? content.planStartDate : null
    saveDraftMirror(mirrorPlanId, content)
    setRecoveryMirror(null)
  }, [mirrorPlanId, props.weeksCount, published, readOnly, recoveryMirror, setWeeksWithHistory, studentAddedByDay, daySourceToken])

  const discardDraftMirror = useCallback(() => {
    clearDraftMirror(mirrorPlanId)
    clearDayDeletionIntent(mirrorPlanId)
    remoteWriter.current?.clear()
    remoteHasDirtyContent.current = false
    pendingRevisionChangeRef.current?.(null)
    setRecoveryMirror(null)
  }, [mirrorPlanId])

  const setVisibleWeek = useCallback((weekNumber: number) => {
    const index = latestWeeks.current.findIndex((week) => week.num === weekNumber)
    if (index >= 0) setVisibleWeekIndex(index)
    if (visibleWeekRef.current === weekNumber) return
    visibleWeekRef.current = weekNumber

    // Once the horizontal week anchor changes, selections from another
    // week are cleared so day/row/cell context and the formula bar cannot keep
    // describing a week that the toolbar no longer identifies as visible.
    setSel((current) => daySelectionRef.current.days.size > 1 || current?.wnum === weekNumber ? current : null)
    setDaySelection((current) => {
      if (current.anchor?.wnum === weekNumber || current.days.size > 1) return current
      // Keep a hidden range anchor so scrolling to another week can be followed
      // by Shift-click, while retaining the old single-day visible cleanup.
      return current.anchor ? { anchor: current.anchor, days: new Set() } : current
    })
    setRowSelection((current) => current.anchor?.wnum === weekNumber ? current : singleRowSelection(null))
    setCellSelection((current) => current?.weekNumber === weekNumber ? current : null)
    setPop((current) => (
      current.visible && current.wnum !== weekNumber
        ? { ...current, visible: false }
        : current
    ))
  }, [])

  // ---- global drag (column resize) + pan ----
  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      const d = dragRef.current
      if (d) {
        const dx = e.clientX - d.startX
        const w = Math.max(COL_MIN[d.col], Math.round(d.startW + dx))
        setColW((prev) => {
          const next = prev.map((c) => ({ ...c }))
          next[d.dow][d.col] = w
          return next
        })
        return
      }
      const p = panRef.current, sc = scrollerRef.current
      if (p && sc) { sc.scrollLeft = p.sl - (e.clientX - p.x); sc.scrollTop = p.st - (e.clientY - p.y) }
    }
    const onUp = () => {
      if (dragRef.current) { dragRef.current.el.classList.remove('dragging'); dragRef.current = null; document.body.style.cursor = '' }
      if (panRef.current) {
        panRef.current = null
        const scroller = scrollerRef.current
        scroller?.classList.remove('panning')
        if (scroller) {
          scroller.style.scrollSnapType = 'none'
        }
      }
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp) }
  }, [])

  // ---- horizontal wheel/trackpad + middle-mouse pan ----
  useEffect(() => {
    const sc = scrollerRef.current
    if (!sc) return
    const onWheel = (e: WheelEvent) => {
      if (!e.shiftKey || Math.abs(e.deltaX) > Math.abs(e.deltaY)) return
      e.preventDefault()
      sc.scrollLeft += e.deltaY
    }
    const onDown = (e: MouseEvent) => {
      if (e.button !== 1) return
      e.preventDefault()
      panRef.current = { x: e.clientX, y: e.clientY, sl: sc.scrollLeft, st: sc.scrollTop }
      sc.classList.add('panning')
      sc.style.scrollSnapType = 'none'
    }
    sc.addEventListener('wheel', onWheel, { passive: false })
    sc.addEventListener('mousedown', onDown)
    return () => {
      sc.removeEventListener('wheel', onWheel)
      sc.removeEventListener('mousedown', onDown)
    }
  }, [])

  // ---- handlers ----
  const handleResizeStart = (dow: number, col: ColKey, e: React.MouseEvent) => {
    e.preventDefault(); e.stopPropagation()
    const el = e.currentTarget as HTMLElement
    el.classList.add('dragging')
    dragRef.current = { dow, col, startX: e.clientX, startW: colW[dow][col], el }
    document.body.style.cursor = 'col-resize'
  }

  const handleSelect = (wnum: number, dow: number) => {
    const target = { wnum, dow }
    setSel(target)
    setDaySelection(singleDaySelection(target))
    setRowSelection(singleRowSelection(null))
    setCellSelection(null)
    setPop((p) => ({ ...p, visible: false }))
  }
  const handleDayClick = (wnum: number, dow: number, event: React.MouseEvent) => {
    if (suppressDayClickRef.current) return
    const target = { wnum, dow }
    const toggle = event.metaKey || event.ctrlKey
    if (!toggle && !event.shiftKey) {
      handleSelect(wnum, dow)
      return
    }

    let next = daySelection
    if (event.shiftKey && daySelection.anchor) {
      next = {
        anchor: daySelection.anchor,
        days: new Set(planDaysInRange(latestWeeks.current, daySelection.anchor, target).map(planDayKey)),
      }
    } else if (
      toggle
      && daySelection.anchor
      && daySelection.days.has(planDayKey(daySelection.anchor))
    ) {
      const days = new Set(daySelection.days)
      const key = planDayKey(target)
      if (days.has(key)) days.delete(key)
      else days.add(key)
      if (days.size === 0) next = singleDaySelection(null)
      else if (key !== planDayKey(daySelection.anchor) || days.has(key)) next = { anchor: daySelection.anchor, days }
      else {
        const anchor = weeks.flatMap((week) => week.days.map((day) => ({ wnum: week.num, dow: day.dow })))
          .filter((day) => days.has(planDayKey(day)))
          .sort((left, right) => absoluteDayIndex(left) - absoluteDayIndex(right))[0] ?? null
        next = anchor ? { anchor, days } : singleDaySelection(null)
      }
    } else {
      next = singleDaySelection(target)
    }
    setDaySelection(next)
    setSel(next.anchor)
    if (next.days.size !== 1) setRowSelection(singleRowSelection(null))
    setCellSelection(null)
    setPop((current) => ({ ...current, visible: false }))
  }
  const handleDayMoveStart = (wnum: number, day: DayCol, e: React.MouseEvent) => {
    if (e.button !== 0 || dayMoveDisabledReason(day, dayMoveLocked)) return
    if ((e.target as HTMLElement).closest('button')) return

    dayMoveCleanupRef.current?.()
    const startX = e.clientX
    const startY = e.clientY
    const previousCursor = document.body.style.cursor
    const previousUserSelect = document.body.style.userSelect
    let active = false
    let currentTarget: { wnum: number; dow: number; valid: boolean } | null = null

    const resolveTarget = (clientX: number, clientY: number) => {
      const targetEl = document.elementsFromPoint(clientX, clientY)
        .map((element) => element.closest<HTMLElement>('.day[data-dow]'))
        .find((element): element is HTMLElement => element != null)
      const weekEl = targetEl?.closest<HTMLElement>('.weekband[data-wnum]')
      const targetWnum = Number(weekEl?.dataset.wnum)
      const targetDow = Number(targetEl?.dataset.dow)
      if (!targetEl || !Number.isInteger(targetWnum) || !Number.isInteger(targetDow)) return null
      const targetDay = latestWeeks.current.find((week) => week.num === targetWnum)
        ?.days.find((candidate) => candidate.dow === targetDow)
      const sourceRows = latestWeeks.current.find((week) => week.num === wnum)
        ?.days.find((candidate) => candidate.dow === day.dow)?.rows.length ?? 0
      const valid = targetWnum === wnum && targetDow !== day.dow
        && !!targetDay && !dayMoveDisabledReason(targetDay, false)
        && (sourceRows > 0 || targetDay.rows.length > 0)
      return { wnum: targetWnum, dow: targetDow, valid }
    }

    const syncTarget = (clientX: number, clientY: number) => {
      currentTarget = resolveTarget(clientX, clientY)
      setDayMoveVisual({
        fromWnum: wnum,
        fromDow: day.dow,
        targetWnum: currentTarget?.wnum ?? null,
        targetDow: currentTarget?.dow ?? null,
        targetValid: currentTarget?.valid ?? false,
      })
      document.body.style.cursor = currentTarget?.valid ? 'grabbing' : 'not-allowed'
    }

    const cleanup = (updateVisual = true) => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
      window.removeEventListener('blur', onBlur)
      if (active) {
        document.body.style.cursor = previousCursor
        document.body.style.userSelect = previousUserSelect
      }
      if (updateVisual) setDayMoveVisual(null)
      if (dayMoveCleanupRef.current === cleanup) dayMoveCleanupRef.current = null
    }

    const onMove = (event: MouseEvent) => {
      // A mouseup outside the browser window never reaches us; the next move
      // with no pressed button means the drag is already over — abort cleanly.
      if (event.buttons === 0) {
        cleanup()
        if (active) window.setTimeout(() => { suppressDayClickRef.current = false }, 0)
        return
      }
      if (!active) {
        if (Math.hypot(event.clientX - startX, event.clientY - startY) < DAY_MOVE_THRESHOLD) return
        active = true
        suppressDayClickRef.current = true
        document.body.style.userSelect = 'none'
      }
      event.preventDefault()
      syncTarget(event.clientX, event.clientY)
    }

    const onUp = (event: MouseEvent) => {
      if (active) {
        event.preventDefault()
        syncTarget(event.clientX, event.clientY)
        if (currentTarget?.valid) {
          const sourceWeek = latestWeeks.current.find((week) => week.num === wnum)
          const sourceDay = sourceWeek?.days.find((candidate) => candidate.dow === day.dow)
          const targetDay = sourceWeek?.days.find((candidate) => candidate.dow === currentTarget!.dow)
          if (sourceWeek && sourceDay && targetDay && !dayMoveDisabledReason(sourceDay, false)) {
            const confirmed = (!sourceDay.shiftBadge && !targetDay.shiftBadge) || window.confirm(
              S.editor.shiftedDayMoveConfirm,
            )
            if (confirmed) {
              const swapped = !isRestDay(targetDay)
              const displayedMovedWeek = moveDayInWeek(sourceWeek, day.dow, currentTarget.dow)
              setWeeksWithHistory((previous) => {
                const index = previous.findIndex((week) => week.num === wnum)
                if (index < 0) return previous
                const movedWeek = moveDayInWeek(previous[index], day.dow, currentTarget!.dow)
                if (movedWeek === previous[index]) return previous
                const next = [...previous]
                next[index] = movedWeek
                return next
              })
              handleSelect(wnum, currentTarget.dow)
              const movedTarget = displayedMovedWeek.days.find((candidate) => candidate.dow === currentTarget!.dow)!
              setStatusText(swapped
                ? S.editor.swappedDays(dayDisplay(sourceWeek, sourceDay), dayDisplay(sourceWeek, targetDay))
                : S.editor.movedDay(dayDisplay(sourceWeek, sourceDay), dayDisplay(displayedMovedWeek, movedTarget)))
            }
          }
        }
      }
      cleanup()
      if (active) window.setTimeout(() => { suppressDayClickRef.current = false }, 0)
    }

    const onBlur = () => {
      cleanup()
      if (active) window.setTimeout(() => { suppressDayClickRef.current = false }, 0)
    }

    dayMoveCleanupRef.current = cleanup
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    window.addEventListener('blur', onBlur)
  }
  const handleSelectRow = (
    wnum: number,
    dow: number,
    rowId: string,
    modifiers: RowSelectionModifiers = { toggle: false, range: false },
  ) => {
    setSel({ wnum, dow })
    setDaySelection(singleDaySelection({ wnum, dow }))
    const target = { wnum, dow, rowId }
    setRowSelection((current) => {
      const anchor = current.anchor
      const sameDay = anchor?.wnum === wnum && anchor.dow === dow
      if (!sameDay || (!modifiers.toggle && !modifiers.range)) return singleRowSelection(target)

      const day = latestDisplayWeeks.current.find((week) => week.num === wnum)?.days.find((item) => item.dow === dow)
      if (!day) return singleRowSelection(target)
      const displayRows = orderRowsForDisplay(day.rows, rowTier)
      if (modifiers.range && anchor) {
        const anchorIndex = displayRows.findIndex((row) => row.id === anchor.rowId)
        const targetIndex = displayRows.findIndex((row) => row.id === rowId)
        if (anchorIndex < 0 || targetIndex < 0) return singleRowSelection(target)
        const [start, end] = anchorIndex <= targetIndex
          ? [anchorIndex, targetIndex]
          : [targetIndex, anchorIndex]
        return { anchor, rowIds: new Set(displayRows.slice(start, end + 1).map((row) => row.id)) }
      }

      const rowIds = new Set(current.rowIds)
      if (rowIds.has(rowId)) rowIds.delete(rowId)
      else rowIds.add(rowId)
      if (rowIds.size === 0) return singleRowSelection(null)
      if (rowId !== anchor?.rowId || rowIds.has(rowId)) return { anchor, rowIds }
      const nextAnchor = displayRows.find((row) => rowIds.has(row.id))
      return nextAnchor
        ? { anchor: { wnum, dow, rowId: nextAnchor.id }, rowIds }
        : singleRowSelection(null)
    })
    setCellSelection((current) => (
      current?.weekNumber === wnum && current.dow === dow && current.rowId === rowId
        ? current
        : null
    ))
    setPop((p) => ({ ...p, visible: false }))
  }
  const handleSelectCell = (
    wnum: number,
    dow: number,
    rowId: string,
    field: PlanCellField,
    setIndex?: number,
  ) => {
    const selection = { weekNumber: wnum, dow, rowId, field, setIndex }
    setSel({ wnum, dow })
    setDaySelection(singleDaySelection({ wnum, dow }))
    setRowSelection((current) => (
      current.anchor?.wnum === wnum
      && current.anchor.dow === dow
      && current.rowIds.has(rowId)
        ? current
        : singleRowSelection({ wnum, dow, rowId })
    ))
    setCellSelection(selection)
  }
  const positionPopAt = (el: HTMLElement, wnum: number, dow: number, rowId: string, query: string) => {
    const root = rootRef.current
    if (!root) return
    const r = el.getBoundingClientRect(), rr = root.getBoundingClientRect()
    const left = Math.max(8, Math.min(r.left - rr.left, root.clientWidth - 256))
    let top = r.bottom - rr.top + 2
    if (top + 260 > root.clientHeight) top = r.top - rr.top - 260
    setPop({ visible: true, x: left, y: top, wnum, dow, rowId, query })
  }
  // Pending blur timers keyed per row: resuming edit on the same row must cancel its
  // pending auto-bind/hide, or the stale callback races the new editing session.
  const blurTimersRef = useRef(new Map<string, number>())
  const blurTimerKey = (wnum: number, dow: number, rowId: string) => `${wnum}:${dow}:${rowId}`
  const cancelPendingBlur = (wnum: number, dow: number, rowId: string) => {
    const key = blurTimerKey(wnum, dow, rowId)
    const pending = blurTimersRef.current.get(key)
    if (pending !== undefined) {
      window.clearTimeout(pending)
      blurTimersRef.current.delete(key)
    }
  }
  useEffect(() => {
    const timers = blurTimersRef.current
    return () => timers.forEach((id) => window.clearTimeout(id))
  }, [])
  const handleNameFocus = (wnum: number, dow: number, rowId: string, name: string, el: HTMLElement) => {
    cancelPendingBlur(wnum, dow, rowId)
    setActiveIndex(0)
    positionPopAt(el, wnum, dow, rowId, name)
  }
  const handleNameChange = (wnum: number, dow: number, rowId: string, value: string, el: HTMLElement) => {
    cancelPendingBlur(wnum, dow, rowId)
    editRow(wnum, dow, rowId, (r) => ({ ...r, name: value, nameEn: null, exerciseId: null, ku: false, custom: false }))
    setActiveIndex(0)
    positionPopAt(el, wnum, dow, rowId, value)
  }

  const bindRowAt = (
    target: { wnum: number; dow: number; rowId: string },
    exerciseId: string,
    name: string,
    custom: boolean,
    knownType: ExerciseResponse['exercise_type'] | null = null,
    nameEn?: string | null,
  ) => {
    // Backfill is_main_lift from the catalog tier so manually picked rows persist
    // the same flag the xlsx-import path infers (main lift or variation → true).
    // knownType covers just-created customs the index hasn't picked up yet.
    const tier = knownType ?? props.exerciseIndex?.typeById(exerciseId) ?? null
    setWeeksWithHistory((prev) => prev.map((wk) => wk.num !== target.wnum ? wk : {
      ...wk,
      days: wk.days.map((d) => d.dow !== target.dow ? d : {
        ...d, rows: d.rows.map((r) => r.id === target.rowId && !r.hasLogs
          ? { ...r, exerciseId, name, nameEn, ku: !custom, custom, isMain: tier ? tier !== 'accessory' : r.isMain }
          : r),
      }),
    }))
  }
  const handleNameBlur = (wnum: number, dow: number, rowId: string) => {
    cancelPendingBlur(wnum, dow, rowId)
    const key = blurTimerKey(wnum, dow, rowId)
    const id = window.setTimeout(() => {
      blurTimersRef.current.delete(key)
      const row = latestWeeks.current.find((wk) => wk.num === wnum)
        ?.days.find((day) => day.dow === dow)
        ?.rows.find((item) => item.id === rowId)
      if (row && !row.exerciseId && row.name.trim()) {
        // Strict resolver only: fuzzy inference is for import/paste, never for silent auto-bind.
        const resolved = props.exerciseIndex?.resolveExact(row.name)
        if (resolved) {
          props.exerciseIndex?.bump(resolved.id)
          bindRowAt({ wnum, dow, rowId }, resolved.id, resolved.name, false, null, resolved.name_en)
        }
      }
      setPop((current) => current.wnum === wnum && current.dow === dow && current.rowId === rowId
        ? { ...current, visible: false }
        : current)
    }, 160)
    blurTimersRef.current.set(key, id)
  }
  const editRow = (wnum: number, dow: number, rowId: string, updater: (r: ExerciseRow) => ExerciseRow) => {
    setWeeksWithHistory((prev) => prev.map((wk) => wk.num !== wnum ? wk : {
      ...wk,
      days: wk.days.map((d) => d.dow !== dow ? d : {
        ...d,
        rows: d.rows.map((r) => r.id === rowId && !r.hasLogs ? updater(materializeIntensityRow(r)) : r),
      }),
    }))
  }
  const deleteRow = (wnum: number, dow: number, rowId: string) => {
    setWeeksWithHistory((prev) => prev.map((wk) => wk.num !== wnum ? wk : {
      ...wk,
      days: wk.days.map((d) => {
        if (d.dow !== dow) return d
        const removed = d.rows.find((r) => r.id === rowId && !r.hasLogs)
        if (!removed) return d
        const released = new Set(d.releasedSortOrders ?? [])
        if (removed.serverSortOrder != null) released.add(removed.serverSortOrder)
        return {
          ...d,
          releasedSortOrders: [...released].sort((a, b) => a - b),
          rows: d.rows.filter((r) => r.id !== rowId),
        }
      }),
    }))
    setPop((p) => (p.rowId === rowId ? { ...p, visible: false } : p))
    setCellSelection((cell) => (
      cell?.weekNumber === wnum && cell.dow === dow && cell.rowId === rowId ? null : cell
    ))
  }
  const weeklySummaries = useMemo(() => {
    const derived: Array<{
      summary: ReturnType<typeof summarizeWeek>
      totalSetsTrend: ReturnType<typeof compareWeekMetric> | null
      tonnageTrend: ReturnType<typeof compareWeekMetric> | null
    }> = []
    for (const week of weeks) {
      const summary = summarizeWeek(
        week,
        (exerciseId) => props.exerciseIndex?.classificationById(exerciseId) ?? null,
      )
      const previous = derived[derived.length - 1]?.summary
      derived.push({
        summary,
        totalSetsTrend: previous ? compareWeekMetric(summary.totalSets, previous.totalSets) : null,
        tonnageTrend: previous ? compareWeekMetric(summary.tonnage, previous.tonnage) : null,
      })
    }
    return derived
  }, [props.exerciseIndex, weeks])

  const weekBandBadge = useCallback((row: ExerciseRow): WeekBandBadge | null => {
    const metadata = row.exerciseId ? props.exerciseIndex?.bandMetadataById(row.exerciseId) : null
    if (metadata && metadata.exercise_type !== 'accessory' && metadata.main_lift_family) {
      const labels = S.editor.liftBadges
      return { label: labels[metadata.main_lift_family], tone: metadata.main_lift_family }
    }
    const primaryMuscle = metadata?.muscle_groups[0]
    if (metadata?.exercise_type === 'accessory' && primaryMuscle) {
      return { label: MUSCLE_LABEL[primaryMuscle], tone: 'muscle' }
    }
    return null
  }, [props.exerciseIndex])

  const reorderRow = (
    wnum: number,
    dow: number,
    dragRowId: string,
    targetRowId: string,
    position: 'before' | 'after',
  ) => {
    if (dragRowId === targetRowId) return
    setWeeksWithHistory((prev) => (
      reorderRowsInWeek(prev, rowTier, wnum, dow, dragRowId, targetRowId, position) ?? prev
    ))
    setSel({ wnum, dow })
    setDaySelection(singleDaySelection({ wnum, dow }))
    setRowSelection(singleRowSelection({ wnum, dow, rowId: dragRowId }))
    setPop((p) => ({ ...p, visible: false }))
  }

  const onPickHit = (hit: ExerciseHit) => {
    props.exerciseIndex?.bump(hit.id)
    bindRowAt({ wnum: pop.wnum, dow: pop.dow, rowId: pop.rowId }, hit.id, hit.name, false, null, hit.name_en)
    setPop((p) => ({ ...p, visible: false }))
  }
  // Seed the create dialog's 分类 from the section the blank row lives in, so a
  // row added under 主项及变式 defaults to a main-lift variation.
  const tierOfTarget = (target: RowTarget | null): 'main' | 'aux' | undefined => {
    if (!target) return undefined
    const row = weeks.find((wk) => wk.num === target.wnum)
      ?.days.find((d) => d.dow === target.dow)
      ?.rows.find((r) => r.id === target.rowId)
    return row ? rowTier(row) : undefined
  }
  const openCreateExercise = (initialName = '', bindTarget: RowTarget | null = null) => {
    if (!props.onCreateExercise) return
    setCreateExerciseError('')
    setCreateExercise({ open: true, initialName, bindTarget })
  }
  const closeCreateExercise = () => {
    if (creatingExercise) return
    setCreateExercise((s) => ({ ...s, open: false }))
    setCreateExerciseError('')
  }
  const onCreateCustom = async (name: string) => {
    const target = { wnum: pop.wnum, dow: pop.dow, rowId: pop.rowId }
    setPop((p) => ({ ...p, visible: false }))
    openCreateExercise(name, target)
  }
  const submitCreateExercise = async (input: CreateCustomExerciseInput) => {
    if (!props.onCreateExercise || creatingExercise) return
    setCreatingExercise(true)
    setCreateExerciseError('')
    try {
      const e = await props.onCreateExercise(input)
      // Only a create that actually lands in a plan row counts as usage — the toolbar
      // "new exercise" flow (bindTarget null) just adds to the catalog.
      if (createExercise.bindTarget) {
        const createdType = input.exerciseType === 'main_lift_variation' && input.mainLiftFamily != null
          ? 'main_lift_variation' as const
          : 'accessory' as const
        bindRowAt(createExercise.bindTarget, e.id, e.name, true, createdType)
        props.exerciseIndex?.bump(e.id)
      }
      setStatusText(S.editor.exerciseCreated(e.name))
      setCreateExercise({ open: false, initialName: '', bindTarget: null })
    } catch (e) {
      const code = e instanceof ApiException ? e.code : ''
      setCreateExerciseError(code ? S.editor.createFailedCode(code) : S.editor.createFailedRetry)
    } finally {
      setCreatingExercise(false)
    }
  }

  const useExistingFromCreate = (hit: ExerciseHit) => {
    props.exerciseIndex?.bump(hit.id)
    if (createExercise.bindTarget) {
      bindRowAt(createExercise.bindTarget, hit.id, hit.name, false, null, hit.name_en)
    }
    setCreateExercise({ open: false, initialName: '', bindTarget: null })
    setCreateExerciseError('')
  }

  const historyVideoOpen = useRef(false)
  const handleNameKeyDown = (
    wnum: number,
    dow: number,
    rowId: string,
    event: React.KeyboardEvent<HTMLInputElement>,
  ) => {
    // The video layer owns Escape before the name picker while it is open.
    if (event.key === 'Escape' && historyVideoOpen.current) return
    if (event.nativeEvent.isComposing || event.keyCode === 229 || nameComposingRef.current) return
    if (!pop.visible || pop.wnum !== wnum || pop.dow !== dow || pop.rowId !== rowId || !pop.query.trim()) return
    const hits = props.exerciseIndex?.search(pop.query) ?? []
    const selectableCount = hits.length + (props.onCreateExercise ? 1 : 0)
    if (event.key === 'Escape') {
      event.preventDefault()
      setPop((current) => ({ ...current, visible: false }))
      return
    }
    if (selectableCount === 0) return
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      const direction = event.key === 'ArrowDown' ? 1 : -1
      setActiveIndex((current) => (current + direction + selectableCount) % selectableCount)
      return
    }
    if (event.key !== 'Enter' && event.key !== 'Tab') return
    const selectedIndex = Math.min(activeIndex, selectableCount - 1)
    const hit = hits[selectedIndex]
    if (hit) onPickHit(hit)
    else if (props.onCreateExercise && selectedIndex === hits.length) void onCreateCustom(pop.query.trim())
    if (event.key === 'Enter') event.preventDefault()
  }

  const patchSelDay = (updater: (d: DayCol) => DayCol) => {
    if (!sel) return
    setWeeksWithHistory((prev) => prev.map((wk) => wk.num !== sel.wnum ? wk : {
      ...wk, days: wk.days.map((d) => d.dow !== sel.dow ? d : updater(d)),
    }))
  }

  const selectedDay = useCallback((): DayCol | null => {
    if (!sel) return null
    return weeks.find((week) => week.num === sel.wnum)?.days.find((day) => day.dow === sel.dow) ?? null
  }, [sel, weeks])

  const selectedRowsValue = useCallback((): ExerciseRow[] => {
    if (!selectedRow) return []
    const day = displayWeeks.find((week) => week.num === selectedRow.wnum)?.days.find((d) => d.dow === selectedRow.dow)
    return day
      ? orderRowsForDisplay(day.rows, rowTier).filter((row) => selectedRowIds.has(row.id))
      : []
  }, [displayWeeks, rowTier, selectedRow, selectedRowIds])

  const selectedDaysValue = useCallback(() => weeks.flatMap((week) => (
    week.days
      .filter((day) => daySelection.days.has(planDayKey({ wnum: week.num, dow: day.dow })))
      .map((day) => ({ wnum: week.num, weekNum2: week.num2, day }))
  )).sort((left, right) => (
    absoluteDayIndex({ wnum: left.wnum, dow: left.day.dow })
      - absoluteDayIndex({ wnum: right.wnum, dow: right.day.dow })
  )), [daySelection.days, weeks])

  const copySelectedDays = useCallback(async () => {
    const selected = selectedDaysValue()
    if (selected.length < 2) return
    const firstAbs = absoluteDayIndex({ wnum: selected[0].wnum, dow: selected[0].day.dow })
    const text = selected.map(({ weekNum2, day }) => (
      `# W${weekNum2} ${day.dowLabel} ${day.dateLabel}\n${serializeRowsForClipboard(day.rows)}`
    )).join('\n')
    daysClipboardRef.current = {
      days: selected.map(({ wnum, day }) => ({
        offset: absoluteDayIndex({ wnum, dow: day.dow }) - firstAbs,
        ...cloneDayClipboard(day),
      })),
    }
    dayClipboardRef.current = null
    rowClipboardRef.current = null
    clipboardKindRef.current = 'days'
    clipboardTextRef.current = text
    try { await navigator.clipboard?.writeText(text) } catch { /* internal clipboard still works */ }
    setStatusText(S.editor.copiedDays(selected.length))
  }, [selectedDaysValue])

  const copySelectedDay = useCallback(async () => {
    const day = selectedDay()
    const week = sel ? weeks.find((candidate) => candidate.num === sel.wnum) : null
    if (!day || !week) return
    const text = serializeDayForClipboard(day)
    dayClipboardRef.current = cloneDayClipboard(day)
    rowClipboardRef.current = null
    clipboardKindRef.current = 'day'
    clipboardTextRef.current = text
    try { await navigator.clipboard?.writeText(text) } catch { /* internal clipboard still works */ }
    setStatusText(S.editor.copiedDay(dayDisplay(week, day)))
  }, [sel, selectedDay, weeks])

  const copySelectedRow = useCallback(async () => {
    const rows = selectedRowsValue()
    if (rows.length === 0) {
      setStatusText(S.editor.selectExerciseFirst)
      return
    }
    const text = serializeRowsForClipboard(rows)
    rowClipboardRef.current = cloneRows(rows, 'clip-row')
    clipboardKindRef.current = 'row'
    clipboardTextRef.current = text
    try { await navigator.clipboard?.writeText(text) } catch { /* internal clipboard still works */ }
    setStatusText(rows.length === 1
      ? S.editor.copiedExercise(
        fmt.exerciseName({ name: rows[0].name, name_en: rows[0].nameEn }).trim() || S.common.unnamed)
      : S.editor.copiedExercises(rows.length))
  }, [selectedRowsValue])

  const pasteRowsIntoSelection = useCallback((rows: ExerciseRow[]) => {
    if (!sel || rows.length === 0) return
    const inserted = cloneRows(rows, 'paste-row')
    setWeeksWithHistory((prev) => prev.map((wk) => wk.num !== sel.wnum ? wk : {
      ...wk,
      days: wk.days.map((day) => {
        if (day.dow !== sel.dow) return day
        return { ...day, rest: false, rows: (['main', 'aux'] as const).flatMap(tier => [...day.rows.filter(row => rowTier(row) === tier), ...inserted.filter(row => rowTier(row) === tier)]) }
      }),
    }))
    setDaySelection(singleDaySelection(sel))
    setRowSelection(singleRowSelection({ wnum: sel.wnum, dow: sel.dow, rowId: inserted[0].id }))
    const target = weeks.find((week) => week.num === sel.wnum)?.days.find((day) => day.dow === sel.dow)
    const targetWeek = weeks.find((week) => week.num === sel.wnum)
    const displayedWeek = target && targetWeek ? {
      ...targetWeek,
      days: targetWeek.days.map((day) => day.dow === target.dow
        ? { ...day, rows: [...day.rows, ...inserted] }
        : day),
    } : null
    setStatusText(target && displayedWeek ? S.editor.pastedExerciseTo(dayDisplay(displayedWeek, target)) : S.editor.pastedExercise)
  }, [sel, setWeeksWithHistory, weeks])

  const pasteSelectedRows = useCallback(async () => {
    if (!sel) return
    let externalRows: ExerciseRow[] | null = null
    try {
      const text = await navigator.clipboard?.readText()
      if (text && text !== clipboardTextRef.current) externalRows = parseClipboardRows(text, props.exerciseIndex)
    } catch { /* use internal clipboard below */ }

    const rows = externalRows ?? (clipboardKindRef.current === 'row' ? rowClipboardRef.current : null)
    if (!rows) {
      setStatusText(S.editor.nothingToPasteExercise)
      return
    }
    pasteRowsIntoSelection(rows)
  }, [pasteRowsIntoSelection, props.exerciseIndex, sel])

  const pasteSelectedDay = useCallback(async () => {
    if (!sel) return
    let externalRows: ExerciseRow[] | null = null
    try {
      const text = await navigator.clipboard?.readText()
      if (
        text
        && text.replace(/\r/g, '') !== clipboardTextRef.current.replace(/\r/g, '')
      ) externalRows = parseClipboardRows(text, props.exerciseIndex)
    } catch { /* use internal clipboard below */ }

    if (externalRows) {
      pasteRowsIntoSelection(externalRows)
      return
    }

    if (clipboardKindRef.current === 'days' && daysClipboardRef.current) {
      const { inRange, skipped } = placePlanDayOffsets(daysClipboardRef.current.days, sel, weeks)
      if (inRange.length === 0) {
        setWeeksWithHistory((prev) => applyPlanDayPlacements(prev, inRange, (day) => day))
        setStatusText(formatTranslatedDaysPasteStatus(0, skipped))
        return
      }
      const occupied = inRange.filter(({ target }) => {
        const day = weeks.find((week) => week.num === target.wnum)?.days.find((item) => item.dow === target.dow)
        return !!day && !isRestDay(day)
      }).length
      if (
        occupied > 0
        && !window.confirm(S.editor.overwriteDaysConfirm(occupied))
      ) return
      setWeeksWithHistory((prev) => applyPlanDayPlacements(
        prev,
        inRange,
        (day, source) => replaceUnlockedRows(day, source.rows),
      ))
      setRowSelection(singleRowSelection(null))
      setCellSelection(null)
      setStatusText(formatTranslatedDaysPasteStatus(inRange.length, skipped))
      return
    }

    const clip = dayClipboardRef.current
    if (!clip) {
      setStatusText(S.editor.nothingToPaste)
      return
    }

    if (selectedDay()?.rows.length && !window.confirm(S.editor.overwriteDaysConfirm(1))) return
    setWeeksWithHistory((prev) => prev.map((wk) => wk.num !== sel.wnum ? wk : {
      ...wk,
      days: wk.days.map((day) => day.dow !== sel.dow ? day : replaceUnlockedRows(
        day,
        clip.rows,
      )),
    }))
    setRowSelection(singleRowSelection(null))
    const target = weeks.find((week) => week.num === sel.wnum)?.days.find((day) => day.dow === sel.dow)
    const targetWeek = weeks.find((week) => week.num === sel.wnum)
    const displayedTarget = target ? {
      ...target,
      rows: [...target.rows.filter((row) => row.hasLogs), ...clip.rows],
    } : null
    const displayedWeek = displayedTarget && targetWeek ? {
      ...targetWeek,
      days: targetWeek.days.map((day) => day.dow === displayedTarget.dow ? displayedTarget : day),
    } : null
    setStatusText(displayedTarget && displayedWeek ? S.editor.pastedTo(dayDisplay(displayedWeek, displayedTarget)) : S.editor.pasted)
  }, [pasteRowsIntoSelection, props.exerciseIndex, sel, setWeeksWithHistory, weeks])

  const restoreHistoryDayDeletions = useCallback((target: Week[], historical: TrackedDayDeletion[]) => {
    const targetDay = (weekNumber: number, dow: number) => target.find(week => week.num === weekNumber)?.days.find(day => day.dow === dow)
    // Consecutive undo/redo must retain pending removals while their days remain
    // absent, but restoring a day cancels its pending removal.
    const retained = deletedDaysRef.current.filter(deleted => {
      const day = targetDay(deleted.weekNumber, deleted.dow)
      return !day || !isBlockTrainingDay(day)
    })
    deletedDaysRef.current = [...new Map([...historical, ...retained].map(deleted => [deleted.sourceToken, deleted])).values()]
    // Undoing a day insertion is an explicit removal too. Keep its identity for
    // the existing save adapter, including an autosave response still in flight.
    for (const week of latestWeeks.current) for (const day of week.days) {
      const restored = targetDay(week.num, day.dow)
      if (!isBlockTrainingDay(day) || (restored && isBlockTrainingDay(restored)) || blockDayDeletionLocked(day)
        || (day.serverDayId && studentAddedByDay.get(day.serverDayId)?.length)) continue
      const sourceToken = daySourceToken(day.rows)
      if (!deletedDaysRef.current.some(deleted => deleted.sourceToken === sourceToken)) {
        deletedDaysRef.current.push({ id: day.serverDayId ?? null, weekNumber: week.num, dow: day.dow, sourceToken })
      }
    }
  }, [daySourceToken, studentAddedByDay])

  const undoWeeks = useCallback(() => {
    const prev = historyRef.current.pop()
    if (!prev) {
      setStatusText(S.editor.nothingToUndo)
      return
    }
    redoDeletedDaysRef.current = [...redoDeletedDaysRef.current.slice(-49), deletedDaysRef.current]
    restoreHistoryDayDeletions(prev, historyDeletedDaysRef.current.pop() ?? [])
    const prevStart = historyStartRef.current.pop() ?? null
    const currentStart = currentPlanStart.current
    currentPlanStart.current = prevStart
    setPlanStartDate(prevStart)
    pendingPlanStart.current = prevStart === persistedPlanStart.current ? null : prevStart
    setWeeks((current) => {
      redoRef.current = [...redoRef.current.slice(-49), current]
      redoStartRef.current = [...redoStartRef.current.slice(-49), currentStart]
      return prev
    })
    setStatusText(S.editor.undone)
  }, [restoreHistoryDayDeletions])

  const redoWeeks = useCallback(() => {
    const next = redoRef.current.pop()
    if (!next) return
    historyDeletedDaysRef.current = [...historyDeletedDaysRef.current.slice(-49), deletedDaysRef.current]
    restoreHistoryDayDeletions(next, redoDeletedDaysRef.current.pop() ?? [])
    const nextStart = redoStartRef.current.pop() ?? null
    const currentStart = currentPlanStart.current
    currentPlanStart.current = nextStart
    setPlanStartDate(nextStart)
    pendingPlanStart.current = nextStart === persistedPlanStart.current ? null : nextStart
    setWeeks((current) => {
      historyRef.current = [...historyRef.current.slice(-49), current]
      historyStartRef.current = [...historyStartRef.current.slice(-49), currentStart]
      return next
    })
    setStatusText(S.editor.redone)
  }, [restoreHistoryDayDeletions])

  const moveCellSelection = (move: 'next' | 'previous' | 'up' | 'down') => {
    const next = movePlanCell(latestDisplayWeeks.current, cellSelection, move)
    if (!next) return
    if (visibleWeekRef.current !== next.weekNumber) {
      setVisibleWeek(next.weekNumber)
      window.requestAnimationFrame(() => {
        const sc = scrollerRef.current
        const slot = weeksRef.current?.querySelector<HTMLElement>(`[data-week-slot][data-wnum="${next.weekNumber}"]`)
        if (sc && slot) slot.scrollIntoView?.({ block: 'nearest', inline: 'nearest', behavior: 'smooth' })
      })
    }
    setEditingDay({ wnum: next.weekNumber, dow: next.dow })
    setSel({ wnum: next.weekNumber, dow: next.dow })
    setDaySelection(singleDaySelection({ wnum: next.weekNumber, dow: next.dow }))
    setRowSelection(singleRowSelection({ wnum: next.weekNumber, dow: next.dow, rowId: next.rowId }))
    setCellSelection(next)
    setPop((current) => ({ ...current, visible: false }))
    window.setTimeout(() => {
      const key = planCellKey(next)
      const cell = [...(rootRef.current?.querySelectorAll<HTMLElement>('[data-plan-cell-key]') ?? [])]
        .find((candidate) => candidate.dataset.planCellKey === key)
      if (!cell) return
      cell.scrollIntoView?.({ block: 'nearest', inline: 'nearest' })
      if (readOnly) return
      const focusTarget = cell instanceof HTMLInputElement || cell instanceof HTMLSelectElement
        ? cell
        : cell.querySelector<HTMLInputElement | HTMLSelectElement>('input:not(:disabled), select:not(:disabled)')
      focusTarget?.focus()
    }, 0)
  }

  const fillSelectedIntensityDown = () => {
    if (readOnly || !cellSelection || !['intensity', 'weight'].includes(cellSelection.field) || cellSelection.setIndex == null) return false
    const resolved = resolvePlanCell(latestDisplayWeeks.current, cellSelection)
    const fillsIntensity = cellSelection.field === 'intensity'
    const source = resolved
      ? (fillsIntensity ? rowIntensityBoxes(resolved.row) : rowWeightBoxes(resolved.row))[cellSelection.setIndex]
      : undefined
    if (fillsIntensity && (!resolved || !isSingleValueIntensity(rowIntensity(resolved.row)))) return false
    if (!resolved || !source || resolved.row.hasLogs || resolved.row.mode === 'bodyweight') return false
    const sourceIndex = cellSelection.setIndex
    setWeeksWithHistory((current) => current.map((week) => {
      if (week.num !== cellSelection.weekNumber) return week
      return {
        ...week,
        days: week.days.map((day) => {
          if (day.dow !== cellSelection.dow) return day
          return {
            ...day,
            rows: day.rows.map((row) => row.id !== cellSelection.rowId ? row : (() => {
              const materialized = materializeIntensityRow(row)
              if (fillsIntensity) {
                const intensity = rowIntensity(materialized)
                if (!isSingleValueIntensity(intensity)) return materialized
                const intensityBoxes = rowIntensityBoxes(materialized).map((box, index) => (
                  index > sourceIndex ? { ...source } : box
                ))
                return {
                  ...materialized,
                  intensity: { ...intensity, value: intensityBoxes[0]?.val ?? '' },
                  intensityMode: 'per_set',
                  intensityBoxes,
                }
              }
              return {
                ...materialized,
                weightMode: 'per_set',
                boxes: materialized.boxes.map((box, index) => (
                  index > sourceIndex ? { ...source } : box
                )),
              }
            })()),
          }
        }),
      }
    }))
    setStatusText(S.editor.filledDown(Math.max(0, resolved.row.boxes.length - sourceIndex - 1)))
    return true
  }

  useGlobalKeyboardHandler(({ event: e, editable }) => {
    if (suspendedRef.current) return false
    const target = e.target instanceof HTMLElement ? e.target : null
    if (target?.closest('.block-history,[role="dialog"],[role="menu"],.block-topbar')) return false
    const gridInput = !!target?.closest('[data-plan-cell-key]')

    // Escape only clears the inspection selection — allowed even on
    // read-only historical plans and while a selected grid input has focus.
    if (e.key === 'Escape') {
      if (document.activeElement instanceof HTMLElement) document.activeElement.blur()
      setEditingDay(null)
      setBlockMenu(null)
      setPop(current => ({ ...current, visible: false }))
      setCellSelection(null)
      setDaySelection((current) => current.anchor && current.days.size > 1
        ? singleDaySelection(current.anchor)
        : current)
      setRowSelection((current) => current.anchor && current.rowIds.size > 1
        ? singleRowSelection(current.anchor)
        : current)
      return true
    }

    const mod = e.metaKey || e.ctrlKey
    const key = e.key.toLowerCase()
    if (mod && key === 's' && !e.altKey && !e.shiftKey) {
      e.preventDefault()
      if (!readOnly && props.onSave) void handleSave()
      return true
    }
    const weekStep = e.altKey && !mod && !e.shiftKey && (
      e.key === 'ArrowLeft' || e.key === 'ArrowRight'
    )
    if (weekStep) {
      e.preventDefault()
      jumpToAdjacentWeek(e.key === 'ArrowLeft' ? -1 : 1)
      return true
    }

    if (mod && key === 'd' && !e.altKey && !e.shiftKey && (!editable || gridInput)) {
      if (readOnly) {
        e.preventDefault()
        return true
      }
      if (fillSelectedIntensityDown()) {
        e.preventDefault()
        return true
      }
      return false
    }

    const navigation = !mod && !e.altKey && (
      e.key === 'Tab'
      || e.key === 'Enter'
      || e.key === 'ArrowLeft'
      || e.key === 'ArrowRight'
      || e.key === 'ArrowUp'
      || e.key === 'ArrowDown'
    )
    if (
      pop.visible
      && !!pop.query.trim()
      && gridInput
      && (e.key === 'Enter' || e.key === 'ArrowUp' || e.key === 'ArrowDown')
    ) return false
    if (navigation && (!editable || gridInput)) {
      e.preventDefault()
      // Blurring is the existing commit boundary for set-count drafts and name
      // auto-binding. It also lets GuardedInput finish through its normal
      // onChange/composition path before selection moves.
      if (gridInput && document.activeElement instanceof HTMLElement) document.activeElement.blur()
      if (e.key === 'Tab') moveCellSelection(e.shiftKey ? 'previous' : 'next')
      else if (e.key === 'ArrowLeft') moveCellSelection('previous')
      else if (e.key === 'ArrowRight') moveCellSelection('next')
      else if (e.key === 'ArrowUp') moveCellSelection('up')
      else moveCellSelection('down')
      return true
    }

    if (!readOnly && !editable && (key === 'delete' || key === 'backspace')) {
      e.preventDefault()
      if (selectedRowIds.size > 0 && selectedRow) {
        setWeeksWithHistory(prev => prev.map(week => week.num !== selectedRow.wnum ? week : { ...week,
          days: week.days.map(day => {
            if (day.dow !== selectedRow.dow) return day
            const removed = day.rows.filter(row => selectedRowIds.has(row.id) && !row.hasLogs)
            return { ...day, rows: day.rows.filter(row => !removed.includes(row)),
              releasedSortOrders: [...new Set([...(day.releasedSortOrders ?? []), ...removed.flatMap(row => row.serverSortOrder == null ? [] : [row.serverSortOrder])])] }
          }),
        }))
        setRowSelection(singleRowSelection(null))
      } else if (daySelection.days.size > 1) handleClearDay()
      else handleDeleteDay()
      return true
    }
    if (readOnly || !mod) return false
    if (key === 'c' && selectedRowIds.size > 1) {
      e.preventDefault()
      void copySelectedRow()
      return true
    }
    if (editable) return false
    if (key === 'c') {
      e.preventDefault()
      if (selectedRow) void copySelectedRow()
      else if (daySelection.days.size > 1) void copySelectedDays()
      else void copySelectedDay()
      return true
    } else if (key === 'v') {
      e.preventDefault()
      if (clipboardKindRef.current === 'days') void pasteSelectedDay()
      else if (selectedRow || clipboardKindRef.current === 'row') void pasteSelectedRows()
      else void pasteSelectedDay()
      return true
    } else if (key === 'z' && e.shiftKey) {
      e.preventDefault()
      redoWeeks()
      return true
    } else if (key === 'z') {
      e.preventDefault()
      undoWeeks()
      return true
    } else if (key === 'y') {
      e.preventDefault()
      redoWeeks()
      return true
    }
    return false
  }, 10)

  const blankRow = (): ExerciseRow => ({
    id: `n${Date.now()}-${Math.round(performance.now())}`,
    serverRowId: null, serverSortOrder: null, hasLogs: false, conflictMessage: null,
    exerciseId: null, name: '', ku: false, custom: false, isMain: false,
    aux: false, reps: '—', mode: 'kg', intensity: null, weightMode: 'uniform', boxes: [], note: '',
  })
  // A blank row can't resolve its tier from the catalog yet, so seed isMain from
  // the section whose ＋ 加动作 was clicked; bindRowAt re-derives it once a name binds.
  const addRowToDay = (wnum: number, dow: number, tier: 'main' | 'aux' = 'aux') => {
    const row = blankRow()
    row.isMain = tier === 'main'
    setWeeksWithHistory((prev) => prev.map((wk) => wk.num !== wnum ? wk : {
      ...wk, days: wk.days.map((d) => {
        if (d.dow !== dow) return d
        const released = [...(d.releasedSortOrders ?? [])].sort((a, b) => a - b)
        const reusable = released.shift() ?? null
        row.serverSortOrder = reusable
        if (reusable == null) return { ...d, rest: false, rows: [...d.rows, row], releasedSortOrders: released }
        const insertAt = d.rows.findIndex((item) => (item.serverSortOrder ?? Number.MAX_SAFE_INTEGER) > reusable)
        const rows = [...d.rows]
        rows.splice(insertAt < 0 ? rows.length : insertAt, 0, row)
        return { ...d, rest: false, rows, releasedSortOrders: released }
      }),
    }))
    setSel({ wnum, dow })
    setDaySelection(singleDaySelection({ wnum, dow }))
    setRowSelection(singleRowSelection({ wnum, dow, rowId: row.id }))
    setCellSelection({ weekNumber: wnum, dow, rowId: row.id, field: 'name' })
  }

  const handleDeleteDay = () => {
    if (readOnly || !sel) return
    const grid = buildBlockGrid(weeks, planStartDate, blockWeekdays, extraWeekdays)
    const targets = daySelection.days.size > 1 ? daySelection.days : new Set([planDayKey(sel)])
    const cells = grid.rows.flatMap(row => row.cells).filter(cell => cell.day && targets.has(planDayKey({ wnum: cell.weekNumber, dow: cell.day.dow })))
    if (!cells.length) return
    if (cells.some(cell => blockDayDeletionLocked(cell.day!) || (cell.day!.serverDayId && studentAddedByDay.get(cell.day!.serverDayId!)?.length))) {
      setStatusText(S.editor.blockDeleteLocked); return
    }
    const message = cells.map(cell => S.editor.blockDeleteConfirm(cell.weekNumber, cell.dayNumber!, `${cell.day!.dowLabel} ${cell.day!.dateLabel}`, cell.day!.rows.length)).join('\n')
    if (!window.confirm(message)) return
    setWeeksWithHistory(prev => cells.reduce((result, cell) => deleteBlockDay(result, cell.weekNumber, cell.day!.dow), prev),
      cells.map(cell => ({ id: cell.day!.serverDayId ?? null, weekNumber: cell.weekNumber, dow: cell.day!.dow, sourceToken: daySourceToken(cell.day!.rows) })))
    setEditingDay(null); setSel(null)
    setDaySelection(singleDaySelection(null)); setRowSelection(singleRowSelection(null)); setCellSelection(null)
  }
  const selectedBlockDay = sel ? weeks.find(week => week.num === sel.wnum)?.days.find(day => day.dow === sel.dow) : null
  const deleteBlockLocked = !!selectedBlockDay && (blockDayDeletionLocked(selectedBlockDay)
    || !!(selectedBlockDay.serverDayId && studentAddedByDay.get(selectedBlockDay.serverDayId)?.length))

  const handleClearDay = () => {
    if (daySelection.days.size > 1) {
      const targets = new Set(daySelection.days)
      if (!window.confirm(S.editor.clearDaysConfirm(targets.size))) return
      const selected = selectedDaysValue()
      const changed = selected.filter(({ day }) => day.rows.some((row) => !row.hasLogs)).length
      const retainedLogs = selected.filter(({ day }) => day.rows.some((row) => row.hasLogs)).length
      setWeeksWithHistory((prev) => {
        if (changed === 0) return prev
        return prev.map((week) => ({
          ...week,
          days: week.days.map((day) => {
            if (!targets.has(planDayKey({ wnum: week.num, dow: day.dow }))) return day
            const released = new Set(day.releasedSortOrders ?? [])
            for (const row of day.rows) {
              if (!row.hasLogs && row.serverSortOrder != null) released.add(row.serverSortOrder)
            }
            return {
              ...day,
              rows: day.rows.filter((row) => row.hasLogs),
              releasedSortOrders: [...released].sort((a, b) => a - b),
            }
          }),
        }))
      })
      setRowSelection(singleRowSelection(null))
      setCellSelection(null)
      setStatusText(retainedLogs > 0
        ? S.editor.clearedDaysWithLogs(changed, retainedLogs)
        : S.editor.clearedDays(changed))
      return
    }
    patchSelDay((d) => {
    const released = new Set(d.releasedSortOrders ?? [])
    for (const row of d.rows) if (!row.hasLogs && row.serverSortOrder != null) released.add(row.serverSortOrder)
    return {
      ...d,
      rows: d.rows.filter((row) => row.hasLogs),
      releasedSortOrders: [...released].sort((a, b) => a - b),
    }
    })
    setRowSelection(singleRowSelection(null))
    setCellSelection(null)
  }

  const [saving, setSaving] = useState(false)
  const [draftSaveFailed, setDraftSaveFailed] = useState(false)

  // --- 保存与草稿自动保存 --------------------------------------------------------------------
  // All persistence funnels through one serialized controller: the manual button, the debounced
  // draft autosave, and the leave-plan flush share a single in-flight queue, so concurrent triggers
  // never drop an edit or double-reconcile.
  //
  // A published plan is live to the student, so it NEVER autosaves — that would silently overwrite
  // what the student sees, the exact thing the publish guard prevents. Only drafts autosave; a
  // published plan persists only via the explicit「更新计划」+ confirm path (handleSave).
  const saveMode = useRef<'auto' | 'manual'>('auto')
  const publishing = useRef(false) // latched across a publish round-trip so nothing autosaves mid-publish
  const publishedRef = useRef(published) // fresh published for the unmount cleanup (which closes over [] deps)
  publishedRef.current = published
  const planHasLockedRows = weeks.some((week) => (
    week.days.some((day) => day.rows.some((row) => row.hasLogs))
  ))
  const calendarLocked = statusCalendarLocked || planHasLockedRows
  const calendarLockedHint = statusCalendarLocked
    ? S.editor.calendarLocked
    : S.editor.calendarLoggedLocked

  const applyStartDate = useCallback(async (nextStart: string) => {
    if (!props.onChangeStartDate || readOnly || saving || publishing.current
      || calendarLocked) throw new Error('CALENDAR_LOCKED')
    if (nextStart === currentPlanStart.current) return
    if (!(await saver.current.flush())) throw new Error('SAVE_FAILED')
    const weeksAtRequest = latestWeeks.current
    const hadUnsavedContent = unsavedRef.current
    setSaving(true)
    setStatusText(S.editor.updatingStartDate)
    try {
      await props.onChangeStartDate(nextStart)
      const nextWeeks = relabelWeeksForStartDate(latestWeeks.current, nextStart)
      const contentChangedDuringRequest = latestWeeks.current !== weeksAtRequest
      skipNextAutosave.current = !hadUnsavedContent && !contentChangedDuringRequest
      setWeeks(nextWeeks)
      currentPlanStart.current = nextStart
      persistedPlanStart.current = nextStart
      setPlanStartDate(nextStart)
      pendingPlanStart.current = null
      // The metadata PATCH does not persist row edits. Only advance the mirror's
      // server baseline when the calendar change is the sole outstanding change.
      if (!hadUnsavedContent && !contentChangedDuringRequest
        && findDetailedIssueRows(nextWeeks).length === 0) {
        markMirrorCovered(mirrorContent(nextWeeks, nextStart, nextWeeks.length || props.weeksCount))
      }
      setStatusText(S.editor.startDateUpdated(published ? S.common.published : S.common.draft, nextStart))
    } catch (error) {
      setStatusText(S.editor.startDateUpdateFailed)
      throw error
    } finally {
      setSaving(false)
    }
  }, [calendarLocked, markMirrorCovered, props.onChangeStartDate, props.weeksCount, published, readOnly, saving])

  const handleChangeStartDate = useCallback(
    (nextStart: string) => applyStartDate(nextStart),
    [applyStartDate],
  )

  const applyPlanSettings = async (_name: string, count: number, start: string, _anchor: number, pattern: number[]) => {
    if (readOnly || saving || publishing.current) throw new Error('SETTINGS_BUSY')
    if (count < latestWeeks.current.length) {
      const removed = latestWeeks.current.filter(week => week.num > count).flatMap(week => week.days.filter(day => day.rows.length || day.serverDayId))
      if (!window.confirm(S.editor.removalWarning(count, latestWeeks.current.length, removed.length, removed.reduce((sum, day) => sum + day.rows.length, 0)))) return
    }
    // Validate against the final calendar before issuing any metadata requests.
    const startDelta = currentPlanStart.current ? ((addDays(start, 0).getDay() - addDays(currentPlanStart.current, 0).getDay()) + 7) % 7 : 0
    const previousPattern = blockWeekdays.map(day => (day + startDelta) % 7)
    const preview = resizeWeeksForCount(relabelWeeksForStartDate(latestWeeks.current, start), count, start)
    if (JSON.stringify(pattern) !== JSON.stringify(previousPattern) && !changeBlockPattern(preview, pattern, start, previousPattern, extraWeekdays)) throw new Error('PATTERN_CONFLICT')
    if (start !== currentPlanStart.current) await handleChangeStartDate(start)
    if (count !== latestWeeks.current.length) {
      if (calendarLocked || !props.onChangePlanWeeks) throw new Error('CALENDAR_LOCKED')
      if (!(await saver.current.flush())) throw new Error('SAVE_FAILED')
      setSaving(true)
      try {
        await props.onChangePlanWeeks(count)
        const resized = resizeWeeksForCount(latestWeeks.current, count, start)
        latestWeeks.current = resized
        skipNextAutosave.current = true
        setWeeks(resized)
        historyRef.current = []; historyStartRef.current = []; redoRef.current = []; redoStartRef.current = []
        historyDeletedDaysRef.current = []; redoDeletedDaysRef.current = []
        if (!unsavedRef.current) markMirrorCovered(mirrorContent(resized, start, count))
        setStatusText(S.editor.cycleUpdated(count))
      } finally { setSaving(false) }
    }
    if (!saveBlockWeekdays(props.currentPlanId, pattern)) throw new Error('PATTERN_STORAGE_FAILED')
    if (JSON.stringify(pattern) !== JSON.stringify(previousPattern)) {
      const next = changeBlockPattern(latestWeeks.current, pattern, start, previousPattern, extraWeekdays)
      if (!next) throw new Error('PATTERN_CONFLICT')
      if (next !== latestWeeks.current) { skipNextAutosave.current = false; setWeeksWithHistory(next) }
    }
    lastBlockWeekdays.current = pattern
    setColumnWeekdays(Object.fromEntries(pattern.map((weekday, dx) => [dx, weekday])))
    setSettingsOpen(false)
  }

  // Rows the coach still has to deal with, in grid order:
  //  - unbound: has a name or filled sets but no catalog binding — save reconciliation drops
  //    these (and delete+recreate can erase them from a changed day), so they are a data-loss
  //    risk. The explicit save/publish paths warn before that loss; autosave can't block on a
  //    confirm, so there it's only surfaced in the status line via skippedRows.
  //  - noSets: bound but without a single filled set — persists as a zero-set exercise, which
  //    the backend's publish completeness gate rejects (PLAN_PUBLISH_INCOMPLETE).
  // The ⚠ chip in the top bar counts both and jumps the coach to the next one.
  const countUnbound = (wks: Week[]) => wks.reduce(
    (n, wk) => n + wk.days.reduce((m, d) => (
      isRestDay(d) ? m : m + d.rows.filter((row) => !row.hasLogs && isContentfulUnbound(row)).length
    ), 0),
    0,
  )

  // The save queue is DRAFT-ONLY. Reassigned every render so it always persists the latest weeks.
  // A published plan is refused here so no queued, latched, or flushed write
  // can ever rewrite a plan the student is watching.
  const persistRef = useRef<() => Promise<boolean>>(async () => true)
  const lastSaveFailureAlert = useRef<string | null>(null)
  const applyingSavedWeeks = useRef(false)
  const applyReconciledWeeks = (reconciled: Week[], replaceContent = true) => {
    if (published) {
      applyScheduleUpdate(
        (snapshot) => projectWeekSchedule(snapshot, reconciled),
        replaceContent ? { currentWeeks: reconciled } : undefined,
      )
    } else {
      // Draft calendar edits stay undoable; saved identities must still survive
      // those histories when the same editor session is later published.
      updateScheduleHistory((snapshot) => projectWeekSchedule(snapshot, reconciled, true))
      if (replaceContent) setWeeks(reconciled)
    }
  }
  const applySuccessfulSave = (res: SaveResult, savedWeeks: Week[]) => {
    for (const week of savedWeeks) for (const source of week.days) {
      if (source.rest) continue
      const saved = res.weeks.find(candidate => candidate.num === week.num)?.days.find(day => day.dow === source.dow)
      if (saved && !saved.rest) daySourceTokens.current.set(saved.rows, daySourceToken(source.rows))
    }
    // Undo can restore and save a deleted day under a fresh ID. Redo must refer
    // to that restored identity, rather than the ID consumed by the first save.
    const rebind = (deletions: TrackedDayDeletion[]) => deletions.map(deleted => {
      const source = savedWeeks.find(week => week.num === deleted.weekNumber)?.days.find(day => day.dow === deleted.dow)
      if (!source || source.rest || daySourceToken(source.rows) !== deleted.sourceToken) return deleted
      const day = res.weeks.find(week => week.num === deleted.weekNumber)?.days.find(day => day.dow === deleted.dow)
      return day?.serverDayId ? { ...deleted, id: day.serverDayId } : deleted
    })
    deletedDaysRef.current = rebind(deletedDaysRef.current)
    historyDeletedDaysRef.current = historyDeletedDaysRef.current.map(rebind)
    redoDeletedDaysRef.current = redoDeletedDaysRef.current.map(rebind)
    const sameContent = latestWeeks.current === savedWeeks
    if (sameContent) {
      applyingSavedWeeks.current = true
      unsavedRef.current = false
    }
    // Even when an edit arrived during the request, the returned day identities
    // and schedule are authoritative. Only prescription replacement is conditional.
    applyReconciledWeeks(res.weeks, sameContent)
  }
  const applySaveFailure = (error: unknown): string | null => {
    if (error instanceof ReconcileConflict) {
      applyReconciledWeeks(error.weeks)
      unsavedRef.current = true
      return error.topMessage ?? (error.code === 'DAY_HISTORY_IMMUTABLE'
        ? S.editor.athleteCompletedDuringSave
        : S.editor.athleteLoggedDuringSave)
    }
    if (error instanceof LockedRowMutationError) {
      applyReconciledWeeks(error.weeks)
      unsavedRef.current = true
      return S.editor.lockedRowRetry
    }
    return null
  }
  persistRef.current = async () => {
    if (!props.onSave || published || readOnly) return true
    const auto = saveMode.current === 'auto' && !publishing.current
    const importStart = pendingPlanStart.current
    const markPastAsAssumedComplete = importedPastHistory.current
    const verb = auto ? S.editor.autosaving : S.editor.saving
    setSaving(true); setStatusText(verb); setDegradedSaveStatus(null)
    setDraftSaveFailed(false)
    try {
      // Big saves (imports) crawl through the backend rate limit for minutes — show real
      // per-day movement so the coach can tell progress from a hang. Tiny saves stay quiet.
      const onProgress = (done: number, total: number) => {
        if (total > 3) setStatusText(S.editor.progressDays(verb, done, total))
      }
      const savedWeeks = latestWeeks.current
      const savedDeletedIds = requestedDeletedDayIds(savedWeeks)
      const savedPlanStart = importStart ?? currentPlanStart.current
      const res = await props.onSave(savedWeeks, importStart, markPastAsAssumedComplete, onProgress, savedDeletedIds)
      lastSaveFailureAlert.current = null
      // Clear only the token this save consumed: an import landing mid-flight writes a fresh
      // token, and the drain loop's next pass must still deliver it via reconcileImportedPlan —
      // clearing unconditionally would strand the imported start_date/plan_weeks client-side.
      if (pendingPlanStart.current === importStart) {
        pendingPlanStart.current = null
        if (importStart !== null) persistedPlanStart.current = importStart
        importedPastHistory.current = false
      }
      // Same generation rule for the unsaved flag: edits typed while this save was in flight
      // are NOT in what we just persisted, so they must keep the leave guards armed.
      const savedContent = mirrorContent(
        res.weeks,
        res.planStartDate ?? savedPlanStart,
        res.planWeeks ?? savedWeeks.length,
      )
      lastSavedDraftContent.current = savedContent
      if (res.skippedRows === 0 && res.degradedRows === 0) markMirrorCovered(savedContent)
      applySuccessfulSave(res, savedWeeks)
      if (res.skippedRows > 0 || res.degradedRows > 0) {
        // The tree write just advanced updated_at without covering half-filled or
        // unbound editor content. Refresh the snapshot after that write so load-time
        // timestamp arbitration cannot mistake the lossy tree for the newer copy.
        // Snapshot the CURRENT editor state (after applySuccessfulSave), never the
        // save's input: edits typed during the round-trip must not be clobbered by
        // a stale copy riding this refresh.
        remoteHasDirtyContent.current = true
        remoteWriter.current?.schedule(mirrorContent(
          latestWeeks.current,
          currentPlanStart.current,
          latestWeeks.current.length || props.weeksCount,
        ))
        remoteWriter.current?.flush()
      }
      const base = importStart && markPastAsAssumedComplete
        ? S.editor.historyBackfilledLocked
        : (auto ? S.editor.draftAutosaved : S.editor.draftSaved)
      const coveredBase = res.skippedRows > 0 ? S.editor.skippedUnboundRows(base, res.skippedRows) : base
      setStatusText(coveredBase)
      setDegradedSaveStatus(res.degradedRows > 0 ? { base: coveredBase, count: res.degradedRows } : null)
      return true
    }
    catch (error) {
      const scoped = applySaveFailure(error)
      if (scoped) {
        lastSaveFailureAlert.current = S.editor.publishScopedSaveFailure(scoped)
        setStatusText(scoped)
      } else if (error instanceof ReconciliationError) {
        // Client-side refusals are permanent for this plan state — a generic
        // "重试" both misleads and hides the way out.
        const explain: Record<ReconciliationError['code'], [string, string]> = {
          PLAN_SET_SPEC_INCOMPLETE: [S.editor.incompleteSaveTitle, S.editor.incompleteSaveDetail],
        }
        const [status, detail] = explain[error.code]
        setStatusText(status)
        lastSaveFailureAlert.current = auto ? S.editor.publishScopedSaveFailure(status) : null
        if (!auto) window.alert(detail)
      } else {
        const failure = classifySaveFailure(error)
        const reason = S.editor.saveFailureReasons[failure.kind]
          + (error instanceof ApiException && (failure.kind === 'rejected' || failure.kind === 'serverError')
            ? ` ${error.status}` : '')
        setStatusText(auto ? S.editor.autosaveFailedReason(reason) : S.editor.saveFailedReason(reason))
        setDraftSaveFailed(true)
        lastSaveFailureAlert.current = S.editor.publishSaveFailure[failure.kind]
          + (failure.kind === 'network' ? '' : `\n${S.editor.saveFailureTech(failure.tech)}`)
      }
      return false
    }
    finally { setSaving(false) }
  }
  const saver = useRef(createSaveController({ delay: 1500, persist: () => persistRef.current() }))

  // Content edited but not yet confirmed persisted — drives the leave guards below.
  const unsavedRef = useRef(false)
  const prevWeeksRef = useRef(weeks)
  const skipFirstAutosave = useRef(true)
  const skipNextAutosave = useRef(false)
  useEffect(() => {
    const weeksChanged = prevWeeksRef.current !== weeks
    prevWeeksRef.current = weeks
    if (skipFirstAutosave.current) { skipFirstAutosave.current = false; return } // ignore the initial load
    if (applyingSavedWeeks.current) { applyingSavedWeeks.current = false; return }
    if (skipNextScheduleAutosave.current) { skipNextScheduleAutosave.current = false; return }
    if (skipNextAutosave.current) { skipNextAutosave.current = false; return }
    // Only a real edit marks content unsaved — this effect also fires when `published`
    // flips (same weeks identity), which must not re-arm the guard.
    if (weeksChanged && props.onSave) unsavedRef.current = true
    if (published || readOnly || publishing.current || !props.onSave) { saver.current.cancelAutosave(); return }
    saveMode.current = 'auto'
    saver.current.scheduleAutosave()
  }, [weeks, published, readOnly]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const s = saver.current
    // Leaving this plan: persist any pending DRAFT edits to it. Never flush a published plan — its
    // writes are explicit-confirm only, never a silent background reconcile.
    return () => { if (!publishedRef.current && !readOnly) void s.flush() }
  }, [readOnly])

  // Unbound contentful rows can't be persisted at all (reconcile skips them), so autosave's
  //「已自动保存」can lull the coach while those rows still live only in this tab. The loss becomes
  // real exactly at the exits — closing/reloading the page, or switching plan/student/logout (the
  // editor unmounts and the flush skips them too) — so every exit is guarded. Closing while a
  // save is scheduled/in flight would strand a partial write too, so that blocks as well.
  // Sample mode (no onSave) has nothing persistable to lose and stays quiet.
  const canPersist = useRef(!!props.onSave && !readOnly)
  canPersist.current = !!props.onSave && !readOnly
  const savingRef = useRef(saving)
  savingRef.current = saving
  useEffect(() => registerReloadBlocker(() => {
    if (!canPersist.current) return false
    return savingRef.current
      || unsavedRef.current
      || publishedDirtyRef.current
      || countUnbound(latestWeeks.current) > 0
  }), [])
  useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (!canPersist.current) return
      mirrorWriter.current.flush()
      remoteWriter.current?.flush({ keepalive: true })
      const atRisk = savingRef.current || unsavedRef.current || countUnbound(latestWeeks.current) > 0
      if (!atRisk) return
      e.preventDefault()
      e.returnValue = '' // Chrome still needs returnValue for the native leave prompt
    }
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  const confirmLeaveUnbound = () => {
    if (!canPersist.current) return true
    const unbound = countUnbound(latestWeeks.current)
    if (unbound > 0 && !window.confirm(S.editor.leaveUnboundConfirm(unbound))) return false
    // Published changes require an explicit confirmed update and are never flushed on leave.
    if (publishedRef.current && publishedDirtyRef.current) {
      const message = remoteMirrorStateRef.current.status === 'saved'
        ? S.editor.leavePublishedDirtyStashedConfirm
        : S.editor.leavePublishedDirtyConfirm
      if (!window.confirm(message)) return false
    }
    return true
  }
  const confirmLeave = async () => {
    mirrorWriter.current.flush()
    remoteWriter.current?.flush()
    if (!confirmLeaveUnbound()) return false
    if (!canPersist.current || publishedRef.current) return true
    if (!unsavedRef.current && !savingRef.current) return true
    setStatusText(S.editor.savingBeforeLeave)
    if (await saver.current.flush()) return true
    window.alert(S.editor.saveBeforeLeaveFailed)
    return false
  }
  const guardLeave = (fn?: () => void | Promise<void>) => fn ? async () => {
    if (await confirmLeave()) await fn()
  } : undefined
  const guardLeaveId = (fn?: (id: string) => void | Promise<void>) => fn ? async (id: string) => {
    if (await confirmLeave()) await fn(id)
  } : undefined
  const confirmLeaveRef = useRef(confirmLeave)
  confirmLeaveRef.current = confirmLeave
  useEffect(() => {
    const guard = () => confirmLeaveRef.current()
    props.onLeaveGuardChange?.(guard)
    return () => props.onLeaveGuardChange?.(null)
  }, [props.onLeaveGuardChange])

  // ---- ⚠ 待核对 chip: cycle through problem rows --------------------------------------------
  const issueCursor = useRef(0)
  const issues = findDetailedIssueRows(weeks)
  const emptyDays = emptyTrainingDays(weeks, planStartDate)
  const issueHint = (() => {
    const unbound = issues.filter((i) => i.kind === 'unbound').length
    const inputIssues = issues.filter((i) => i.inputIssue != null)
    const incomplete = inputIssues.filter((i) => i.inputIssue?.hasIncomplete).length
    const invalid = inputIssues.filter((i) => (i.inputIssue?.reasons.length ?? 0) > 0).length
    const reasons = [...new Set(inputIssues.flatMap((i) => i.inputIssue?.reasons ?? []))]
    const parts = []
    if (emptyDays.length) parts.push(S.editor.emptyDaysIssue(emptyDays.length))
    if (unbound) parts.push(S.editor.unboundIssue(unbound))
    if (incomplete) parts.push(S.editor.incompleteIssue(incomplete, published))
    if (invalid) parts.push(S.editor.invalidIssue(invalid, reasons.join(' / ')))
    return S.editor.issueHint(parts.join('；'))
  })()
  const jumpToNextIssue = () => {
    const cur = findIssueRows(latestWeeks.current)
    const empty = emptyTrainingDays(latestWeeks.current, currentPlanStart.current)
    const count = cur.length + empty.length
    if (count === 0) return
    const index = issueCursor.current++ % count
    if (index >= cur.length) {
      const cell = empty[index - cur.length]
      handleSelect(cell.weekNumber, cell.day!.dow)
      setEditingDay({ wnum: cell.weekNumber, dow: cell.day!.dow })
      window.requestAnimationFrame(() => rootRef.current?.querySelector(`[data-block-week="${cell.weekNumber}"][data-dow="${cell.day!.dow}"]`)?.scrollIntoView?.({ block: 'center', inline: 'center' }))
      return
    }
    const issue = cur[index]
    const focusRow = () => {
      const rowEl = rootRef.current?.querySelector<HTMLElement>(`[data-rowid="${issue.rowId}"]`)
      if (!rowEl) return
      rowEl.scrollIntoView?.({ block: 'center', inline: 'center' })
      // For prescriptions, filled-but-invalid cells win over empty cells; the set-count
      // box is only the fallback when no editable prescription cell exists yet.
      const input = issue.kind === 'unbound'
        ? rowEl.querySelector<HTMLInputElement>('input:not([inputmode])')
        : rowEl.querySelector<HTMLInputElement>('[data-input-invalid="true"]')
          ?? [...rowEl.querySelectorAll<HTMLInputElement>('[data-guard-field]')].find((field) => field.value === '')
          ?? rowEl.querySelector<HTMLInputElement>('input[inputmode="numeric"]')
      window.setTimeout(() => input?.focus(), 60)
    }
    const targetWeek = latestWeeks.current.find(week => week.days.some(day => day.rows.some(row => row.id === issue.rowId)))
    const targetDay = targetWeek?.days.find(day => day.rows.some(row => row.id === issue.rowId))
    if (!targetWeek || !targetDay) return
    handleSelect(targetWeek.num, targetDay.dow)
    setEditingDay({ wnum: targetWeek.num, dow: targetDay.dow })
    window.requestAnimationFrame(focusRow)
  }

  // ---- week-tab navigation -------------------------------------------------------------------
  const jumpToWeek = (num: number) => {
    setVisibleWeek(num)
    window.requestAnimationFrame(() => {
      const sc = scrollerRef.current
      const slot = weeksRef.current?.querySelector<HTMLElement>(`[data-week-slot][data-wnum="${num}"]`)
      if (sc && slot) slot.scrollIntoView?.({ block: 'nearest', inline: 'nearest', behavior: 'smooth' })
    })
  }

  const jumpToAdjacentWeek = (delta: -1 | 1) => {
    const currentIndex = latestWeeks.current.findIndex((week) => week.num === visibleWeekRef.current)
    const target = latestWeeks.current[(currentIndex >= 0 ? currentIndex : visibleWeekIndex) + delta]
    if (target) jumpToWeek(target.num)
  }

  const blockEmptyDayDelivery = () => {
    const first = emptyTrainingDays(latestWeeks.current, currentPlanStart.current)[0]
    if (!first) return false
    window.alert(S.editor.emptyDayDelivery(first.weekNumber, first.dayNumber!, `${first.day!.dowLabel} ${first.day!.dateLabel}`))
    return true
  }

  const handleSave = async () => {
    if (!props.onSave || readOnly || saving || publishing.current) return
    if (published) {
      if (blockEmptyDayDelivery()) return
      if (!recoveryReady) {
        window.alert(S.editor.checkingRemoteBeforeUpdate)
        return
      }
      // 更新计划: reconciles in place, changing what the student sees right now — confirm first.
      // This is the ONLY way a published plan is persisted: an explicit, confirmed, one-shot write
      // that never enters the autosave queue, so nothing can later replay it (e.g. an unmount flush).
      // Unbound rows are silently skipped by reconcile, so that risk is folded into the same confirm.
      const unboundRows = countUnbound(latestWeeks.current)
      const unboundLine = unboundRows > 0
        ? S.editor.updateUnboundNote(unboundRows)
        : ''
      const recoveryLine = recoveryMirror ? `\n${S.editor.updateRecoveryOverwriteNote}` : ''
      if (!window.confirm(S.editor.updatePublishedConfirm(planName, studentName, `${unboundLine}${recoveryLine}`))) return
      setSaving(true); setStatusText(S.editor.updating)
      // Transient failures (network, 5xx, exhausted 429 back-off) get ONE automatic
      // retry; reconcile re-baselines against the server first, so replaying it is
      // safe. Anything still failing is surfaced in a modal, not just the status
      // line — a coach who misses the status line is exactly how W7 went missing.
      const savedWeeks = latestWeeks.current
      const savedDeletedIds = requestedDeletedDayIds(savedWeeks)
      const onProgress = (done: number, total: number) => {
        if (total > 3) setStatusText(S.editor.progressDays(S.editor.updating, done, total))
      }
      try {
        for (let attempt = 1; ; attempt++) {
          try {
            const res = await props.onSave(savedWeeks, null, false, onProgress, savedDeletedIds)
            // Edits typed during the round-trip aren't in what was pushed — keep the guards armed.
            // A published update never writes calendar metadata, so the covered
            // hash must use the server-persisted date/weeks, not local values.
            // A published update reconciles with degrade disabled (spec 039 §1.2), so
            // degradedRows is structurally 0 here — the pre-039 covered-mark rule stands.
            if (res.skippedRows === 0) {
              markMirrorCovered(mirrorContent(res.weeks, persistedPlanStart.current, props.weeksCount))
              setRecoveryMirror(null)
            }
            applySuccessfulSave(res, savedWeeks)
            if (res.skippedRows > 0) {
              setStatusText(S.editor.updatedStudentPlanSkipped(studentName, res.skippedRows))
              window.alert(S.editor.updatePartialAlert(studentName, res.skippedRows))
            } else {
              setStatusText(S.editor.updatedStudentPlan(studentName))
            }
            break
          }
          catch (error) {
            const scoped = applySaveFailure(error)
            if (scoped) {
              setStatusText(scoped)
              // History/lock conflicts are just as terminal as transport errors for
              // this click. A status-line-only failure lets the coach mistake the
              // confirmation dialog for delivery, so every unsuccessful published
              // update must end with an explicit "student has not received it" modal.
              const stashed = remoteMirrorStateRef.current.status === 'saved'
              window.alert(S.editor.updateFailedAlert(studentName, scoped, stashed))
              break
            }
            if (error instanceof ReconciliationError) {
              const explain: Record<ReconciliationError['code'], [string, string]> = {
                PLAN_SET_SPEC_INCOMPLETE: [S.editor.incompleteSaveTitle, S.editor.incompleteUpdateDetail],
              }
              const [status, detail] = explain[error.code]
              setStatusText(status)
              const stashed = remoteMirrorStateRef.current.status === 'saved'
              window.alert(S.editor.updateFailedAlert(studentName, `${status} — ${detail}`, stashed))
              break
            }
            if (attempt < 2) {
              setStatusText(S.editor.updateRetrying)
              await new Promise((resolve) => setTimeout(resolve, UPDATE_RETRY_DELAY))
              if (!aliveRef.current) break // editor unmounted meanwhile: never replay a stale closure
              continue
            }
            setStatusText(S.editor.updateFailedRetry)
            const reason = error instanceof ApiException
              ? `${error.status} ${error.code}`
              : error instanceof Error ? error.message : String(error)
            // Only promise cloud safety when the remote mirror actually confirmed a write.
            const stashed = remoteMirrorStateRef.current.status === 'saved'
            window.alert(S.editor.updateFailedAlert(studentName, reason, stashed))
            break
          }
        }
      }
      finally { setSaving(false) }
      return
    }
    const unbound = countUnbound(latestWeeks.current)
    if (unbound > 0 && !window.confirm(S.editor.saveUnboundConfirm(unbound))) return
    saveMode.current = 'manual'
    await saver.current.saveNow() // draft: goes through the shared queue
  }

  const handleImport = async (file: File) => {
    if (readOnly) return
    const currentStart = currentPlanStart.current
    if (!props.exerciseIndex || !currentStart) {
      setStatusText(S.editor.importNotReady)
      return
    }
    // No importing inside the publish round-trip (client `published` is still false there): if
    // the publish wins, the plan flips to published and the imported weeks are stranded — never
    // autosaved, never carried by「更新计划」. Refuse instead of racing; also covers in-flight saves.
    if (publishing.current || saving) {
      setStatusText(S.editor.importWhileSaving)
      return
    }
    // Never import over a published plan — saving would silently overwrite what the
    // student is already seeing. Direct the coach to a fresh draft instead.
    if (published) {
      window.alert(S.editor.importPublishedAlert(planName, studentName))
      return
    }
    if (hasGridContent(weeks) && !window.confirm(S.editor.importOverwriteConfirm)) return

    setStatusText(S.editor.importing)
    try {
      const importer = await import('./import')
      const sheets = importer.readWorkbook(await file.arrayBuffer())
      const grid = importer.selectSheet(sheets)
      if (!grid) {
        window.alert(S.editor.noTrainingWeeks)
        setStatusText(S.editor.importNoPlan)
        return
      }

      const offset = importer.detectDayOffset(grid)
      const parsedWeeks: ParsedWeek[] = importer.weekBlocks(grid, offset).map((block, blockIndex) => ({
        blockIndex,
        dateSerials: block.dateSerials,
        days: Array.from({ length: 7 }, (_, day) => importer.parseDay(grid, block.contentRows, day, offset)),
      }))
      const sourceWeekCount = parsedWeeks.filter(hasParsedWeekContent).length
      const { weeks: nextWeeks, startDate: importStart } = importer.buildWeeks(parsedWeeks, props.exerciseIndex, currentStart)

      if (nextWeeks.length === 0) {
        window.alert(S.editor.noTrainingWeeks)
        setStatusText(S.editor.importNoPlan)
        return
      }

      // Past sessions in an imported plan default to assumed-complete (2026-07-09
      // decision): they enter rep-PR / e1RM baselines tagged「导」so a returning
      // lifter's history anchors PR detection, while completion stats ignore them.
      const markPastAsAssumedComplete = isPastISODate(importStart)
      setWeeksWithHistory(nextWeeks)
      currentPlanStart.current = importStart
      setPlanStartDate(importStart)
      pendingPlanStart.current = importStart
      importedPastHistory.current = markPastAsAssumedComplete
      const targetWeek = nextWeeks.find((week) => week.isCurrent) ?? nextWeeks[0]
      const firstTrain = targetWeek?.days.find((day) => !isRestDay(day))
      const target = targetWeek && firstTrain ? { wnum: targetWeek.num, dow: firstTrain.dow } : null
      setSel(target)
      setDaySelection(singleDaySelection(target))
      if (targetWeek) {
        window.setTimeout(() => jumpToWeek(targetWeek.num), 80)
      }
      setPop((p) => ({ ...p, visible: false }))
      // Name the plan after the file (usually the student), so the plan switcher stops
      // filling up with indistinguishable「新计划」s. The coach can rename via the dropdown.
      const fileBase = file.name.replace(/\.[^.]+$/, '').trim()
      // Best-effort: a failed rename must not fail the import (the coach can rename manually).
      if (fileBase && props.onRename) void Promise.resolve(props.onRename(fileBase)).catch(() => {})
      const imported = nextWeeks.length
      const dropped = sourceWeekCount - imported
      let truncation: string
      if (dropped > 0) {
        truncation = S.editor.importTruncated(sourceWeekCount, imported)
      } else {
        truncation = S.editor.importedUnsaved(imported)
      }
      const range = importRangeLabel(nextWeeks)
      if (range) truncation += `（${range}）`
      setStatusText(truncation)
      if (dropped > 0) window.alert(truncation)
    } catch (e) {
      const code = e instanceof Error ? e.message : ''
      if (code === 'WORKBOOK_TOO_LARGE' || code === 'SHEET_TOO_LARGE') {
        window.alert(S.editor.importTooLargeAlert)
        setStatusText(S.editor.importTooLarge)
      } else {
        window.alert(S.editor.importInvalidFile)
        setStatusText(S.editor.importFailedRetry)
      }
    }
  }

  const handlePublish = async () => {
    // 发布后不可撤回，且当前编辑器不就地覆盖已发布树，避免破坏历史 set log。
    // saving 时也不发布:避免在后台 reconcile 半途翻页发布,发布按钮已 disabled,这里再兜底。
    if (readOnly || published || publishing.current || saving) return
    if (blockEmptyDayDelivery()) return
    // Pre-flight: rows the publish would lose or that the backend will refuse. Zero-set bound
    // rows make the server reject with PLAN_PUBLISH_INCOMPLETE — block up front with a pointer
    // to the ⚠ chip instead of letting the coach discover it as an opaque failure.
    const noSets = findIssueRows(latestWeeks.current).filter((i) => i.kind === 'noSets').length
    if (noSets > 0) {
      window.alert(S.editor.cannotPublishIncomplete(noSets))
      return
    }
    // Publishing flushes the draft via saveNow below, which skips unbound rows just like a manual
    // save — but here the loss lands in the plan the student is about to see. Warn before latching.
    const unbound = countUnbound(latestWeeks.current)
    if (unbound > 0 && !window.confirm(S.editor.publishUnboundConfirm(unbound))) return
    // Latch publishing so nothing autosaves while the client still thinks this is a draft — client
    // `published` only flips true after the round-trip below, and an autosave in that window would
    // silently overwrite the just-published plan.
    publishing.current = true
    saver.current.cancelAutosave()
    const snapshot = latestWeeks.current // to detect edits typed during the publish round-trip
    let becamePublished = false
    try {
      // saveNow persists the latest draft AND awaits any in-flight autosave reconcile, so no
      // background draft write is still running when the plan flips to published (so-所见即所发).
      if (!(await saver.current.saveNow())) {
        if (lastSaveFailureAlert.current) window.alert(lastSaveFailureAlert.current)
        saver.current.scheduleAutosave() // dirty is still set — re-arm so the save retries itself
        return
      }
      const publishedBaseline = props.onSave
        ? lastSavedDraftContent.current
        : mirrorContent(latestWeeks.current, currentPlanStart.current)
      setStatusText(S.editor.publishing)
      if (onPublish) await onPublish()
      // Draft calendar history stops at publication. Keep prescription undo/redo,
      // but anchor every snapshot to the exact calendar that was just published.
      applyScheduleUpdate((snapshot) => projectWeekSchedule(
        publishedBaseline.weeks.map((week) => {
          const historical = snapshot.find((candidate) => candidate.num === week.num)
          return historical ? {
            ...historical,
            days: week.days.map((day) => historical.days.find((candidate) => candidate.dow === day.dow) ?? day),
          } : week
        }),
        publishedBaseline.weeks,
      ))
      historyStartRef.current = historyStartRef.current.map(() => publishedBaseline.planStartDate)
      redoStartRef.current = redoStartRef.current.map(() => publishedBaseline.planStartDate)
      currentPlanStart.current = publishedBaseline.planStartDate
      persistedPlanStart.current = publishedBaseline.planStartDate
      pendingPlanStart.current = null
      setPlanStartDate(publishedBaseline.planStartDate)
      setPublished(true); becamePublished = true
      // Edits typed during the round-trip aren't in the published plan — surface them, never drop silently.
      setStatusText(latestWeeks.current !== snapshot
        ? S.editor.publishedDirty(studentName)
        : S.editor.publishedTo(studentName))
    } catch (e) {
      // The status line gets repainted by later saves — a publish failure must explain itself
      // in a dialog the coach actually reads, in coach language, not a machine code.
      const code = e instanceof ApiException ? e.code : ''
      const detail = e instanceof ApiException ? e.details : {}
      if (code === 'PLAN_PUBLISH_INCOMPLETE') {
        const n = Number(detail.empty_exercise_count ?? 0) || S.editor.several
        window.alert(S.editor.publishEmptyExercises(n))
      } else if (code === 'PLAN_DAYS_EXCEED_WEEKS') {
        window.alert(S.editor.publishWeeksOverflow(weeksCount))
      } else if (code === 'EVALUATION_IN_PROGRESS') {
        window.alert(S.editor.assessmentPublishRejected)
      } else if (code === 'PLAN_NOT_DRAFT') {
        window.alert(S.editor.alreadyPublishedAlert)
      } else {
        window.alert(S.editor.publishFailedAlert(code))
      }
      setStatusText(S.editor.publishFailedRetry)
    } finally {
      publishing.current = false // always unlatch so 更新计划 / autosave work afterwards
      // Re-arm only if the coach actually edited during the round-trip — a blanket re-arm
      // triggers a no-op save whose「已自动保存」repaints over the failure status above.
      if (!becamePublished && latestWeeks.current !== snapshot) saver.current.scheduleAutosave()
    }
  }

  const visibleStatusText = published && publishedDirty
    ? remoteMirrorState.status === 'saved'
      ? S.editor.publishedDirtyStashed(studentName, savedClock(remoteMirrorState.savedAt))
      : remoteMirrorState.status === 'stashing'
        ? S.editor.publishedDirtyStashing(studentName)
        : S.editor.publishedDirtyLocal(studentName)
    : !published && degradedSaveStatus
      // "已云端暂存" is a completion claim — only the writer's `saved` state may
      // make it; in-flight/idle shows progress, local-only degrades honestly.
      ? remoteMirrorState.status === 'saved'
        ? S.editor.degradedSaved(degradedSaveStatus.base, degradedSaveStatus.count)
        : remoteMirrorState.status === 'local-only'
          ? S.editor.degradedSavedLocal(degradedSaveStatus.base, degradedSaveStatus.count)
          : S.editor.degradedSavedStashing(degradedSaveStatus.base, degradedSaveStatus.count)
      : statusText
  const moveStateForDay = (wnum: number, dow: number): 'source' | 'target' | 'invalid' | undefined => {
    if (!dayMoveVisual) return undefined
    if (dayMoveVisual.fromWnum === wnum && dayMoveVisual.fromDow === dow) return 'source'
    if (dayMoveVisual.targetWnum === wnum && dayMoveVisual.targetDow === dow) {
      return dayMoveVisual.targetValid ? 'target' : 'invalid'
    }
    return undefined
  }
  const shiftControlForDay = (week: Week, day: DayCol) => {
    if (
      readOnly
      || props.planStatus !== 'published'
      || sel?.wnum !== week.num
      || sel.dow !== day.dow
      || !day.serverDayId
      || !planStartDate
    ) return undefined
    const dayOrdinal = trainingDayOrdinal(week, day.dow)
    if (dayOrdinal == null) return undefined
    const anchorDate = recommendedDateForDay(planStartDate, week.num, day)
    const trainingDays = weeks.flatMap((candidateWeek) => candidateWeek.days
      .filter((candidateDay) => !!candidateDay.serverDayId)
      .map((candidateDay) => ({
        day: candidateDay,
        date: recommendedDateForDay(planStartDate, candidateWeek.num, candidateDay),
      })))
    const affectedDays = trainingDays.filter(({ day: candidateDay, date }) => (
      candidateDay.completedAt == null && date >= anchorDate
    )).length
    const completedDays = trainingDays.filter(({ day: candidateDay, date }) => (
      candidateDay.completedAt != null && date >= anchorDate
    )).length
    const periodEndDate = trainingDays.reduce(
      (latest, candidate) => candidate.date > latest ? candidate.date : latest,
      anchorDate,
    )
    const periodEndDateAfterShift = (offsetDays: number) => trainingDays.reduce((latest, candidate) => {
      const date = candidate.day.completedAt == null && candidate.date >= anchorDate
        ? isoDate(addDays(candidate.date, offsetDays))
        : candidate.date
      return date > latest ? date : latest
    }, anchorDate)
    return {
      anchorDate,
      weekNumber: week.num,
      dayOrdinal,
      affectedDays,
      completedDays,
      periodEndDate,
      periodEndDateAfterShift,
      onShift: (offsetDays: number) => handlePlanShift(anchorDate, offsetDays),
    }
  }

  const closeBlockEditor = () => {
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur()
    setEditingDay(null)
    setCellSelection(null)
    setPop(current => ({ ...current, visible: false }))
  }
  const fillBlock = (source: BlockAddress, endWeek: number) => {
    if (readOnly) return
    const grid = buildBlockGrid(weeks, planStartDate, blockWeekdays, extraWeekdays)
    const occupied = grid.rows.filter(row => row.week.num > source.weekNumber && row.week.num <= endWeek)
      .filter(row => blockTargetDay(grid, { weekNumber: row.week.num, dx: source.dx }, planStartDate)?.rows.length).length
    if (occupied && !window.confirm(S.editor.overwriteDaysConfirm(occupied))) return
    setWeeksWithHistory(prev => fillBlockDays(prev, source, endWeek, planStartDate, blockWeekdays, extraWeekdays))
  }

  return (
    <div ref={rootRef} onMouseDownCapture={event => {
      const target = event.target as HTMLElement
      if (!target.closest('.block-history,.block-cell,.block-context-menu,.ex-popover,[data-popover],[role="dialog"]')) {
        closeBlockEditor(); setBlockMenu(null)
      }
    }} className="plan-editor" style={{
      position: 'relative', height: '100%', display: 'flex', flexDirection: 'column',
      overflow: 'hidden', background: 'var(--page-bg)', color: 'var(--txt)',
      fontFamily: 'var(--font-sans)', fontSize: 13, WebkitFontSmoothing: 'antialiased',
    }}>
      <TopBar
        studentName={studentName} planName={planName} published={published} publishedDirty={publishedDirty}
        readOnly={readOnly} statusText={visibleStatusText} onPublish={handlePublish}
        students={props.students} currentStudentId={props.currentStudentId} onSwitchStudent={guardLeaveId(props.onSwitchStudent)}
        plans={props.plans} currentPlanId={props.currentPlanId} onSwitchPlan={guardLeaveId(props.onSwitchPlan)}
        onNewPlan={guardLeave(props.onNewPlan)}
        onBackToBoard={props.onBackToBoard}
        currentPlanStatus={props.planStatus ?? (published ? 'published' : 'draft')}
        onDeleteCurrentDraft={guardLeave(props.onDeleteCurrentDraft)}
        onMarkComplete={props.onMarkComplete}
        onBackfillHistory={props.onBackfillHistory}
        onRenamePlan={!readOnly && props.onRename ? () => {
          const name = window.prompt(S.editor.planNamePrompt, planName)?.trim()
          if (name && name !== planName) void props.onRename!(name)
        } : undefined}
        onRenameStudent={props.onRenameStudent ? () => {
          const name = window.prompt(S.editor.studentNamePrompt, studentName)?.trim()
          if (name && name !== studentName) {
            void Promise.resolve(props.onRenameStudent!(name)).catch(() => {
              window.alert(S.editor.renameStudentFailed)
            })
          }
        } : undefined}
          onSave={!readOnly && props.onSave ? handleSave : undefined} saving={saving} draftSaveFailed={draftSaveFailed}
        onImport={!readOnly && props.exerciseIndex && planStartDate ? handleImport : undefined}
        planStartDate={planStartDate ?? undefined}
        calendarLocked={calendarLocked || !props.onChangeStartDate}
        calendarLockedHint={calendarLocked ? calendarLockedHint : S.editor.calendarUnavailable}
        onChangeStartDate={planStartDate ? (props.onChangeStartDate ? handleChangeStartDate : async () => {}) : undefined}
        onNewExercise={!readOnly && props.onCreateExercise ? () => openCreateExercise() : undefined}
        issueCount={readOnly ? 0 : issues.length + emptyDays.length} issueHint={issueHint} onJumpIssue={jumpToNextIssue}
        totalShiftDays={totalShiftDays}
        latestShift={latestShift}
        undoingShift={undoingShift}
        undoNeedsRefresh={undoNeedsRefresh}
        onUndoShift={!readOnly && props.planStatus === 'published' && latestShift ? handleUndoPlanShift : undefined}
        studentPlanCursor={props.studentPlanCursor}
        weeksCount={weeks.length}
        onPlanSettings={!readOnly && planStartDate ? () => setSettingsOpen(true) : undefined}
      />
      {planStartDate && <NewPlanDialog open={settingsOpen} studentName={studentName}
        settings={{ name: planName, weeks: weeks.length, startDate: planStartDate, weekdays: blockWeekdays }}
        calendarLocked={calendarLocked || !props.onChangeStartDate}
        calendarLockedHint={calendarLockedHint}
        weeksLocked={calendarLocked || !props.onChangePlanWeeks}
        onClose={() => setSettingsOpen(false)} onCreate={applyPlanSettings} />}

      {recoveryMirror && (
        <DraftMirrorBanner
          savedAt={recoveryMirror.mirror.savedAt}
          source={recoveryMirror.source}
          onRestore={restoreDraftMirror}
          onDiscard={discardDraftMirror}
        />
      )}
      <div className="plan-with-rail block-layout">
        <div className="scroller" ref={scrollerRef} aria-readonly={readOnly || undefined}>
          {readOnly && <div role="status" className="block-readonly">{S.editor.historyReadOnlyBanner}</div>}
          <div ref={weeksRef}>
            <BlockGrid weeks={weeks} startDate={planStartDate} weekdays={blockWeekdays} extraWeekdays={extraWeekdays} editing={editingDay}
              selectedDays={daySelection.days} selectedRows={selectedRowIds} readOnly={readOnly}
              rowTier={rowTier} onClose={closeBlockEditor}
              renderCapacity={(_week, index) => <WeekCapacitySummary weekNumber={_week.num} {...weeklySummaries[index]} />}
              onOpen={(week, day, event) => {
                setBlockMenu(null)
                handleDayClick(week.num, day.dow, event)
                if (!event.shiftKey && !event.metaKey && !event.ctrlKey) setEditingDay({ wnum: week.num, dow: day.dow })
              }}
              onSelectRow={(week, day, rowId, modifiers) => handleSelectRow(week.num, day.dow, rowId, modifiers)}
              onSelectRectangle={(days, rows) => {
                if (!days.length) return
                setSel(days[0])
                setDaySelection({ anchor: days[0], days: new Set(days.map(planDayKey)) })
                setRowSelection(rows.length ? { anchor: { ...days[0], rowId: rows[0] }, rowIds: new Set(rows) } : singleRowSelection(null))
                setCellSelection(null)
                if (days.length > 1) setEditingDay(null)
              }}
              onInsert={(weekNumber, date) => {
                if (readOnly || !planStartDate) return
                const next = insertBlockDay(weeks, weekNumber, date, planStartDate)
                if (next === weeks) return
                const weekday = (addDays(date, 0).getDay() + 6) % 7
                const extras = [...new Set([...extraWeekdays, weekday])].filter(day => !blockWeekdays.includes(day))
                if (!saveBlockWeekdays(props.currentPlanId, blockWeekdays) || !saveBlockExtraWeekdays(props.currentPlanId, extras)) {
                  window.alert(S.block.patternFailed); return
                }
                setColumnWeekdays(Object.fromEntries(blockWeekdays.map((value, index) => [index, value])))
                setExtraWeekdays(extras)
                setWeeksWithHistory(next)
                const dow = (weekday - (addDays(planStartDate, 0).getDay() + 6) % 7 + 7) % 7
                handleSelect(weekNumber, dow)
                setEditingDay(null)
              }}
              onFill={fillBlock}
              onWeekday={(dx, weekday) => {
                if (!planStartDate || readOnly) return
                const column = buildBlockGrid(weeks, planStartDate, blockWeekdays, extraWeekdays).columns[dx]
                const nextPattern = blockWeekdays.map((value, index) => index === column.patternIndex ? weekday : value)
                const extras = column.patternIndex === null ? [...new Set([...extraWeekdays, weekday])].filter(day => !nextPattern.includes(day)) : extraWeekdays
                if (!saveBlockWeekdays(props.currentPlanId, nextPattern) || !saveBlockExtraWeekdays(props.currentPlanId, extras)) { window.alert(S.block.patternFailed); return }
                setColumnWeekdays(Object.fromEntries(nextPattern.map((value, index) => [index, value])))
                setExtraWeekdays(extras)
                setWeeksWithHistory(prev => changeBlockWeekday(prev, dx, weekday, planStartDate, blockWeekdays, extraWeekdays))
                closeBlockEditor()
              }}
              onContext={(event, week, day) => {
                event.preventDefault(); handleSelect(week.num, day.dow)
                setBlockMenu({ x: event.clientX, y: event.clientY })
              }}
              renderDay={(wk, day, dx, dayNumber) => (
                      <DayColumn
                        key={day.dow}
                        weekNumber={wk.num}
                        blockView={{ dx: dayNumber - 1, date: planStartDate ? recommendedDateForDay(planStartDate, wk.num, day) : '',
                          minDate: planStartDate ? isoDate(addDays(planStartDate, (wk.num - 1) * 7)) : undefined,
                          maxDate: planStartDate ? isoDate(addDays(planStartDate, wk.num * 7 - 1)) : undefined,
                          onClose: closeBlockEditor,
                          onDate: date => {
                            if (!planStartDate) return
                            const next = changeBlockDate(weeks, { weekNumber: wk.num, dx }, date, planStartDate, blockWeekdays, extraWeekdays)
                            if (next === weeks) { setStatusText(S.editor.blockDateUnavailable); return }
                            const moved = next.find(week => week.num === wk.num)?.days.find(candidate => candidate.rows === day.rows)
                            const column = buildBlockGrid(weeks, planStartDate, blockWeekdays, extraWeekdays).columns[dx]
                            if (column.patternIndex === null) {
                              const weekday = (addDays(date, 0).getDay() + 6) % 7
                              const extras = [...new Set([...extraWeekdays, weekday])].filter(value => !blockWeekdays.includes(value))
                              if (!saveBlockExtraWeekdays(props.currentPlanId, extras)) { window.alert(S.block.patternFailed); return }
                              setExtraWeekdays(extras)
                            }
                            setColumnWeekdays(Object.fromEntries(blockWeekdays.map((value, index) => [index, value])))
                            setWeeksWithHistory(next)
                            if (moved) { setEditingDay({ wnum: wk.num, dow: moved.dow }); handleSelect(wk.num, moved.dow) }
                          },
                        }}
                        day={day}
                        colW={colW[day.dow]}
                        selected={daySelection.days.has(planDayKey({ wnum: wk.num, dow: day.dow }))}
                        selectedRowId={selectedRow?.wnum === wk.num && selectedRow.dow === day.dow ? selectedRow.rowId : null}
                        selectedRowIds={selectedRow?.wnum === wk.num && selectedRow.dow === day.dow ? selectedRowIds : undefined}
                        cellSelection={cellSelection}
                        readOnly={readOnly}
                        rowTier={rowTier}
                        onSelect={() => {}}
                        onSelectRow={(rowId, modifiers) => handleSelectRow(wk.num, day.dow, rowId, modifiers)}
                        onSelectCell={(rowId, field, setIndex) => handleSelectCell(wk.num, day.dow, rowId, field, setIndex)}
                        dayMoveState={moveStateForDay(wk.num, day.dow)}
                        dayMoveDisabledHint={dayMoveDisabledReason(day, dayMoveLocked)}
                        onDayMoveStart={(e) => handleDayMoveStart(wk.num, day, e)}
                        onResizeStart={(col, e) => handleResizeStart(day.dow, col, e)}
                        onSetsDraftChange={(rowId, value) => setSetsDraft({ rowId, value })}
                        onNameFocus={(rowId, name, el) => handleNameFocus(wk.num, day.dow, rowId, name, el)}
                        onNameChange={(rowId, value, el) => handleNameChange(wk.num, day.dow, rowId, value, el)}
                        onNameKeyDown={(rowId, event) => handleNameKeyDown(wk.num, day.dow, rowId, event)}
                        onNameCompositionStart={() => { nameComposingRef.current = true }}
                        onNameCompositionEnd={() => { nameComposingRef.current = false }}
                        onNameBlur={(rowId) => handleNameBlur(wk.num, day.dow, rowId)}
                        onAddRow={(tier) => addRowToDay(wk.num, day.dow, tier)}
                        onEditRow={(rowId, updater) => editRow(wk.num, day.dow, rowId, updater)}
                        onReorderRow={(dragRowId, targetRowId, position) => reorderRow(wk.num, day.dow, dragRowId, targetRowId, position)}
                        onDeleteRow={(rowId) => deleteRow(wk.num, day.dow, rowId)}
                        weekBand={{
                          badgeFor: weekBandBadge,
                          trainingDayOrdinal: trainingDayOrdinal(wk, day.dow),
                          weekdayLabel: day.dowLabel,
                        }}
                        studentAdded={day.serverDayId ? studentAddedByDay.get(day.serverDayId) : undefined}
                        exerciseName={(id) => {
                          const names = props.exerciseIndex?.namesById(id)
                          return names ? fmt.exerciseName(names) : id
                        }}
                        actualsForRow={actualsForRow}
                        e1rmForRow={e1rmForRow}
                        shiftControl={shiftControlForDay(wk, day)}
                      />
              )}
            />
          </div>
        </div>
        <BlockHistory studentId={props.studentId} studentName={studentName}
          row={(() => {
            const row = editingDay && cellSelection ? resolvePlanCell(displayWeeks, cellSelection)?.row ?? null : null
            return row && setsDraft?.rowId === row.id && setsDraft.value === '' ? { ...row, boxes: [] } : row
          })()}
          profile={props.onboardingProfile} overview={props.exerciseStatsOverview} onVideos={props.onOpenVideos}
          onVideoVisibilityChange={open => {
            historyVideoOpen.current = open
            setPop(current => ({ ...current, visible: false }))
          }} />
      </div>
      {blockMenu && <div className="block-context-menu" role="menu" style={{ left: blockMenu.x, top: blockMenu.y }}>
        <button type="button" role="menuitem" onClick={() => { void copySelectedDay(); setBlockMenu(null) }}>{S.editor.blockCopy}</button>
        <button type="button" role="menuitem" disabled={readOnly} onClick={() => { if (clipboardKindRef.current === 'row') void pasteSelectedRows(); else void pasteSelectedDay(); setBlockMenu(null) }}>{S.editor.blockPaste}</button>
        <button type="button" role="menuitem" disabled={readOnly} onClick={() => { handleClearDay(); setBlockMenu(null) }}>{S.editor.blockClear}</button>
        <button type="button" role="menuitem" disabled={readOnly || !selectedBlockDay || !isBlockTrainingDay(selectedBlockDay) || deleteBlockLocked}
          title={deleteBlockLocked ? S.editor.blockDeleteLocked : undefined}
          onClick={() => { handleDeleteDay(); setBlockMenu(null) }}>{S.editor.blockDeleteDay}</button>
      </div>}

      <ExercisePopover
        visible={pop.visible} x={pop.x} y={pop.y}
        index={props.exerciseIndex ?? null} query={pop.query}
        activeIndex={activeIndex} onActiveIndexChange={setActiveIndex}
        onPick={onPickHit} onCreateCustom={props.onCreateExercise ? onCreateCustom : undefined}
      />
      <CustomExerciseDialog
        open={createExercise.open}
        initialName={createExercise.initialName}
        initialTier={tierOfTarget(createExercise.bindTarget)}
        saving={creatingExercise}
        error={createExerciseError}
        index={props.exerciseIndex}
        onClose={closeCreateExercise}
        onSubmit={submitCreateExercise}
        onUseExisting={useExistingFromCreate}
      />
    </div>
  )
}
