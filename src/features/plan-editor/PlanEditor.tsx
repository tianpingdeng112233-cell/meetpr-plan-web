import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ColKey, ColWidths, Week, DayCol, ExerciseRow } from './types'
import { COL_DEFAULTS, COL_MIN, isContentfulUnbound, isRestDay } from './types'
import { getBoundRowInputIssue, type BoundRowInputIssue } from './inputGuard'
import { groupActualsByExercise, type ActualSet } from './actuals'
import { getStudentSetLogs } from '../../api/coach'
import {
  isSingleValueIntensity,
  materializeIntensityRow,
  rowIntensity,
  rowIntensityBoxes,
  rowWeightBoxes,
} from './intensityModel'
import { ApiException } from '../../api/client'
import { TopBar } from './components/TopBar'
import { Toolbar } from './components/Toolbar'
import { ContextBar } from './components/ContextBar'
import { DayColumn } from './components/DayColumn'
import { DayHeaderContext } from './components/ContextRail'
import { ExercisePopover } from './components/ExercisePopover'
import { CustomExerciseDialog } from './components/CustomExerciseDialog'
import type { ExerciseIndex, ExerciseHit } from './exerciseIndex'
import type { CreateCustomExerciseInput } from '../../api/exercises'
import type { ExerciseResponse, ExerciseStatsOverview, PlanStatus, StudentOnboardingProfile } from '../../api/types'
import type { ParsedWeek } from './import'
import {
  LockedRowMutationError, ReconcileConflict, ReconciliationError, type SaveResult,
} from './reconcile'
import { createSaveController } from './autosave'
import { parseClipboardRows, serializeDayForClipboard, serializeRowsForClipboard } from './clipboard'
import { isoDate, relabelWeeksForStartDate, resizeWeeksForCount, type StudentPlanCursor } from './mapping'
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
import { FormulaBar } from './components/FormulaBar'
import {
  movePlanCell,
  orderRowsForDisplay,
  planCellKey,
  resolvePlanCell,
  samePlanCell,
  type PlanCellField,
  type PlanCellSelection,
} from './selectionModel'
import { useGlobalKeyboardHandler } from '../workspace/globalKeyboard'
import { S, fmt, resolveLocale } from '../../i18n/strings'
import { MUSCLE_LABEL } from '../catalog/catalogModel'
import {
  closestWeekToViewportCenter,
  reorderRowsInWeek,
  trainingDayOrdinal,
} from './weekBandModel'
import type { WeekBandBadge } from './components/DayColumn'

interface Sel { wnum: number; dow: number }
interface PopState { visible: boolean; x: number; y: number; wnum: number; dow: number; rowId: string; query: string }
interface RowTarget { wnum: number; dow: number; rowId: string }
interface RowSelection { anchor: RowTarget | null; rowIds: Set<string> }
interface RowSelectionModifiers { toggle: boolean; range: boolean }
interface FormulaCellDraft { selection: PlanCellSelection; rawValue: string }
interface CreateExerciseState { open: boolean; initialName: string; bindTarget: RowTarget | null }
type ClipboardKind = 'day' | 'row'
interface DayMoveVisual {
  fromWnum: number
  fromDow: number
  targetWnum: number | null
  targetDow: number | null
  targetValid: boolean
}

const COPY_LABEL = S.editor.copyLastWeek
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
  onBackToBoard?: () => void | Promise<void>
  /** Registers the guarded-leave path used by workspace navigation and account controls. */
  onLeaveGuardChange?: (guard: (() => Promise<boolean>) | null) => void
  /** Keeps the parent-owned plan switcher tag synchronized with remote mirror writes/deletes. */
  onPendingRevisionSavedAtChange?: (savedAt: string | null) => void
  /** While true (guarded view switch in flight) global shortcuts must not mutate weeks. */
  suspended?: boolean
  /** Current plan start date; enables xlsx import date remapping. */
  planStartDate?: string
  onChangeStartDate?: (startDate: string) => Promise<void>
  onChangePlanWeeks?: (planWeeks: number) => Promise<void>
}

function hasGridContent(weeks: Week[]): boolean {
  return weeks.some((week) => week.days.some((day) => day.rows.length > 0))
}

function mirrorContent(weeks: Week[], planStartDate: string | null, weeksCount = weeks.length): DraftMirrorContent {
  return { weeks, planStartDate, weeksCount }
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

function weekLabel(num: number): string {
  return S.editor.weekTab(num)
}

function scrollElementLeft(element: HTMLElement, left: number, behavior?: ScrollBehavior) {
  if (typeof element.scrollTo === 'function') element.scrollTo({ left, behavior })
  else element.scrollLeft = left
}

const WEEK_BAND_GAP_PX = 28

function snapScrollerToNearestWeek(scroller: HTMLElement) {
  const slots = [...scroller.querySelectorAll<HTMLElement>('[data-week-slot][data-wnum]')]
  const nearest = slots.reduce<HTMLElement | null>((best, slot) => {
    if (!best) return slot
    return Math.abs(slot.offsetLeft - scroller.scrollLeft) < Math.abs(best.offsetLeft - scroller.scrollLeft)
      ? slot
      : best
  }, null)
  if (nearest) scrollElementLeft(scroller, nearest.offsetLeft, 'smooth')
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
  const serverMirrorHash = useRef(draftContentHash(initialServerMirrorContent.current))
  const mountedMirror = useRef<DraftMirror | null>(readOnly ? null : loadDraftMirror(mirrorPlanId))
  const waitsForRemoteRecovery = !!mirrorPlanId && initialPublished && !readOnly
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
        const localCandidate = local && local.contentHash !== serverMirrorHash.current ? local : null
        setRecoveryMirror(localCandidate ? { mirror: localCandidate, source: 'local' } : null)
        setRecoveryReady(true)
      })
    return () => { cancelled = true }
  }, [mirrorPlanId, waitsForRemoteRecovery])
  const suspendedRef = useRef(false)
  suspendedRef.current = !!props.suspended
  // Keep the displayed start date separate from the metadata change waiting to
  // be persisted. Clearing a pending save must never make a second date shift
  // calculate from the old parent prop, and undo/redo needs the real date too.
  const currentPlanStart = useRef<string | null>(props.planStartDate ?? null)
  const persistedPlanStart = useRef<string | null>(props.planStartDate ?? null)
  const pendingPlanStart = useRef<string | null>(null)
  const [planStartDate, setPlanStartDate] = useState<string | null>(props.planStartDate ?? null)
  // Kept with the import token so an autosave retry reuses the coach's explicit
  // answer rather than prompting again or silently changing historical data.
  const importedPastHistory = useRef(false)
  const [colW, setColW] = useState<ColWidths[]>(() => Array.from({ length: 7 }, () => ({ ...COL_DEFAULTS })))
  const [sel, setSel] = useState<Sel | null>(null)
  // SPEC-038:学员实际完成组,serverRowId → sets。失败静默(编排主流程不受影响)。
  const [actualsByExercise, setActualsByExercise] = useState<Map<string, ActualSet[]>>(() => new Map())
  const anyRowHasLogs = weeks.some((week) => week.days.some((day) => day.rows.some((row) => row.hasLogs)))
  useEffect(() => {
    const studentId = props.studentId
    const from = planStartDate
    const today = isoDate(new Date())
    if (!studentId || !from || !anyRowHasLogs || from > today) return
    let cancelled = false
    void getStudentSetLogs(studentId, from, today)
      .then((logs) => { if (!cancelled) setActualsByExercise(groupActualsByExercise(logs)) })
      .catch(() => {})
    return () => { cancelled = true }
  }, [props.studentId, planStartDate, anyRowHasLogs])
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
  const [rowSelection, setRowSelection] = useState<RowSelection>(() => singleRowSelection(null))
  const selectedRow = rowSelection.anchor
  const selectedRowIds = rowSelection.rowIds
  const [cellSelection, setCellSelection] = useState<PlanCellSelection | null>(null)
  const [formulaCellDraft, setFormulaCellDraft] = useState<FormulaCellDraft | null>(null)
  // Authoritative published state, initialized from the backend plan status. Monotonic:
  // set true on a real publish and never cleared — there is no backend unpublish, so 发布后不可撤回.
  // Published plans remain editable, but only through explicit confirmed updates;
  // rows with server-authoritative history are locked individually.
  const [published, setPublished] = useState(initialPublished)
  const [statusText, setStatusText] = useState(readOnly
    ? S.editor.readOnlyStatus(props.planStatus === 'completed' ? S.common.completed : S.common.paused)
    : initialPublished ? S.editor.publishedTo(studentName) : S.editor.draftSavedInitial)
  // W1 calendar/delete controls are draft-only. Keep this separate from main's
  // `published` flag, which drives explicit in-place updates for spec 004.
  const statusCalendarLocked = props.planStatus != null ? props.planStatus !== 'draft' : published
  // Day dragging is allowed on live plans too (David 2026-07-18): a published
  // plan never autosaves, so a move only reaches the student after the
  // explicit「更新计划」confirm. Logged days stay frozen via dayMoveDisabledReason.
  const dayMoveLocked = props.planStatus != null
    ? props.planStatus !== 'draft' && props.planStatus !== 'published'
    : false
  const [copyDone, setCopyDone] = useState(false)
  const [hasRowClipboard, setHasRowClipboard] = useState(false)
  const [curWeekLabel, setCurWeekLabel] = useState('—')
  const [pop, setPop] = useState<PopState>({ visible: false, x: 0, y: 0, wnum: 0, dow: 0, rowId: '', query: '' })
  const [activeIndex, setActiveIndex] = useState(0)
  const [createExercise, setCreateExercise] = useState<CreateExerciseState>({ open: false, initialName: '', bindTarget: null })
  const [creatingExercise, setCreatingExercise] = useState(false)
  const [createExerciseError, setCreateExerciseError] = useState('')
  const [dayMoveVisual, setDayMoveVisual] = useState<DayMoveVisual | null>(null)
  const initialVisibleWeekIndex = Math.max(0, initialWeeks.findIndex((week) => week.isCurrent))
  const [visibleWeekIndex, setVisibleWeekIndex] = useState(initialVisibleWeekIndex)

  const rootRef = useRef<HTMLDivElement>(null)
  const scrollerRef = useRef<HTMLDivElement>(null)
  const weeksRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef<{ dow: number; col: ColKey; startX: number; startW: number; el: HTMLElement } | null>(null)
  const panRef = useRef<{ x: number; y: number; sl: number; st: number } | null>(null)
  const historyRef = useRef<Week[][]>([])
  const redoRef = useRef<Week[][]>([])
  const historyStartRef = useRef<(string | null)[]>([])
  const redoStartRef = useRef<(string | null)[]>([])
  const dayClipboardRef = useRef<DayClipboard | null>(null)
  const rowClipboardRef = useRef<ExerciseRow[] | null>(null)
  const clipboardKindRef = useRef<ClipboardKind | null>(null)
  const clipboardTextRef = useRef('')
  const nameComposingRef = useRef(false)
  const suppressDayClickRef = useRef(false)
  const dayMoveCleanupRef = useRef<((updateVisual?: boolean) => void) | null>(null)
  const visibleWeekRef = useRef<number | null>(null)
  useEffect(() => () => dayMoveCleanupRef.current?.(false), [])

  useEffect(() => {
    setFormulaCellDraft((current) => (
      current && samePlanCell(current.selection, cellSelection) ? current : null
    ))
  }, [cellSelection])

  useEffect(() => {
    setRowSelection((current) => convergeRowSelection(current, displayWeeks, rowTier))
    setCellSelection((current) => current && !resolvePlanCell(displayWeeks, current) ? null : current)
  }, [displayWeeks, rowTier])

  useEffect(() => {
    // Parent metadata is authoritative after loading/saving. Do not overwrite a
    // local date while it is still waiting to be reconciled.
    if (pendingPlanStart.current === null) {
      currentPlanStart.current = props.planStartDate ?? null
      persistedPlanStart.current = props.planStartDate ?? null
      setPlanStartDate(props.planStartDate ?? null)
    }
  }, [props.planStartDate])

  const setWeeksWithHistory = useCallback((update: WeeksUpdate) => {
    if (readOnly) return
    const startSnapshot = currentPlanStart.current
    setWeeks((prev) => {
      const next = typeof update === 'function' ? update(prev) : update
      if (next === prev) return prev
      historyRef.current = [...historyRef.current.slice(-49), prev]
      historyStartRef.current = [...historyStartRef.current.slice(-49), startSnapshot]
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
    if (published) {
      remoteWriter.current?.markCovered(hash)
      pendingRevisionChangeRef.current?.(null)
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
    if (published && !recoveryReady) {
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
        if (published && remoteHasDirtyContent.current) {
          remoteWriter.current?.clear()
          remoteHasDirtyContent.current = false
          pendingRevisionChangeRef.current?.(null)
        }
      }
      return
    }
    if (published) {
      setPublishedDirty(true)
      if (!mirrorPlanId) return
      remoteHasDirtyContent.current = true
      remoteWriter.current?.schedule(content)
    }
    if (!mirrorPlanId) return
    mirrorWriter.current.schedule(content)
  }, [mirrorPlanId, props.weeksCount, published, readOnly, recoveryMirror, recoveryReady, weeks])

  useEffect(() => {
    const writer = mirrorWriter.current
    return () => {
      writer.cancel()
    }
  }, [])

  const restoreDraftMirror = useCallback(() => {
    if (!recoveryMirror || readOnly) return
    const { content } = recoveryMirror.mirror
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
      const merged = latestWeeks.current.map((wk) => (
        content.weeks.find((mirrored) => mirrored.num === wk.num) ?? wk
      ))
      setWeeksWithHistory(merged)
      saveDraftMirror(mirrorPlanId, mirrorContent(
        merged, currentPlanStart.current, merged.length || props.weeksCount,
      ))
      setRecoveryMirror(null)
      return
    }
    // History first: setWeeksWithHistory snapshots currentPlanStart at call
    // time, so undo must capture the pre-restore date, not the mirror's.
    setWeeksWithHistory(content.weeks)
    const metadataChanged = content.planStartDate !== persistedPlanStart.current
      || content.weeksCount !== initialServerMirrorContent.current.weeksCount
    currentPlanStart.current = content.planStartDate
    setPlanStartDate(content.planStartDate)
    pendingPlanStart.current = metadataChanged ? content.planStartDate : null
    saveDraftMirror(mirrorPlanId, content)
    setRecoveryMirror(null)
  }, [mirrorPlanId, props.weeksCount, published, readOnly, recoveryMirror, setWeeksWithHistory])

  const discardDraftMirror = useCallback(() => {
    clearDraftMirror(mirrorPlanId)
    remoteWriter.current?.clear()
    remoteHasDirtyContent.current = false
    pendingRevisionChangeRef.current?.(null)
    setRecoveryMirror(null)
  }, [mirrorPlanId])

  const setVisibleWeek = useCallback((weekNumber: number) => {
    setCurWeekLabel(weekLabel(weekNumber))
    const index = latestWeeks.current.findIndex((week) => week.num === weekNumber)
    if (index >= 0) setVisibleWeekIndex(index)
    if (visibleWeekRef.current === weekNumber) return
    visibleWeekRef.current = weekNumber

    // Once the horizontal week anchor changes, selections from another
    // week are cleared so day/row/cell context and the formula bar cannot keep
    // describing a week that the toolbar no longer identifies as visible.
    setSel((current) => current?.wnum === weekNumber ? current : null)
    setRowSelection((current) => current.anchor?.wnum === weekNumber ? current : singleRowSelection(null))
    setCellSelection((current) => current?.weekNumber === weekNumber ? current : null)
    setPop((current) => (
      current.visible && current.wnum !== weekNumber
        ? { ...current, visible: false }
        : current
    ))
  }, [])

  // ---- horizontal scroll-spy (also drives virtualisation) ----
  const updateCur = useCallback(() => {
    const sc = scrollerRef.current
    if (!sc) return
    const viewportLeft = sc.getBoundingClientRect().left
    const candidates = [...sc.querySelectorAll<HTMLElement>('[data-week-slot][data-wnum]')].flatMap((band, index) => {
      const rect = band.getBoundingClientRect()
      const week = Number(band.dataset.wnum)
      return Number.isInteger(week)
        ? [{ weekNumber: week, index, left: rect.left, width: rect.width }]
        : []
    })
    const bestWeek = closestWeekToViewportCenter(viewportLeft, sc.clientWidth, candidates)
    if (bestWeek != null) setVisibleWeek(bestWeek)
  }, [setVisibleWeek])

  // Land on the current week on first mount without mounting the whole plan.
  useEffect(() => {
    const current = weeks[initialVisibleWeekIndex]
    if (!current) return
    setVisibleWeek(current.num)
    const id = window.requestAnimationFrame(() => {
      const slot = weeksRef.current?.querySelector<HTMLElement>(`[data-week-slot][data-wnum="${current.num}"]`)
      const scroller = scrollerRef.current
      if (scroller) scrollElementLeft(scroller, slot?.offsetLeft ?? 0)
      const firstTrain = current.days.find((day) => !isRestDay(day))
      if (firstTrain) setSel({ wnum: current.num, dow: firstTrain.dow })
    })
    return () => window.cancelAnimationFrame(id)
    // mount-only initial positioning
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
          scroller.style.scrollSnapType = 'x mandatory'
          snapScrollerToNearestWeek(scroller)
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
    sc.addEventListener('scroll', updateCur)
    // Viewport resizes move the band centre without a scroll event; re-run the
    // same centre rule so the active tab and virtualisation window track it.
    const resizeObserver = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(updateCur)
    resizeObserver?.observe(sc)
    window.addEventListener('resize', updateCur)
    return () => {
      sc.removeEventListener('wheel', onWheel)
      sc.removeEventListener('mousedown', onDown)
      sc.removeEventListener('scroll', updateCur)
      resizeObserver?.disconnect()
      window.removeEventListener('resize', updateCur)
    }
  }, [updateCur])

  // ---- handlers ----
  const handleResizeStart = (dow: number, col: ColKey, e: React.MouseEvent) => {
    e.preventDefault(); e.stopPropagation()
    const el = e.currentTarget as HTMLElement
    el.classList.add('dragging')
    dragRef.current = { dow, col, startX: e.clientX, startW: colW[dow][col], el }
    document.body.style.cursor = 'col-resize'
  }

  const handleSelect = (wnum: number, dow: number) => {
    setSel({ wnum, dow })
    setRowSelection(singleRowSelection(null))
    setCellSelection(null)
    setPop((p) => ({ ...p, visible: false }))
  }
  const handleDayClick = (wnum: number, dow: number) => {
    if (suppressDayClickRef.current) return
    handleSelect(wnum, dow)
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
    setRowSelection((current) => (
      current.anchor?.wnum === wnum
      && current.anchor.dow === dow
      && current.rowIds.has(rowId)
        ? current
        : singleRowSelection({ wnum, dow, rowId })
    ))
    setCellSelection(selection)
    setFormulaCellDraft((current) => (
      current && samePlanCell(current.selection, selection) ? current : null
    ))
  }
  const handleSetsDraftChange = (
    wnum: number,
    dow: number,
    rowId: string,
    rawValue: string | null,
  ) => {
    const selection: PlanCellSelection = { weekNumber: wnum, dow, rowId, field: 'sets' }
    setFormulaCellDraft((current) => {
      if (rawValue !== null) return { selection, rawValue }
      return current && samePlanCell(current.selection, selection) ? null : current
    })
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

  const handleNameKeyDown = (
    wnum: number,
    dow: number,
    rowId: string,
    event: React.KeyboardEvent<HTMLInputElement>,
  ) => {
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

  const handleCopyPrev = (targetSelection: Sel | null = sel) => {
    if (!targetSelection || targetSelection.wnum <= 1) return
    const targetWeek = weeks.find((week) => week.num === targetSelection.wnum)
    if (targetWeek?.days.some((day) => day.rows.some((row) => row.hasLogs))) return
    const occupiedDays = targetWeek?.days.filter((day) => !isRestDay(day)).length ?? 0
    if (
      occupiedDays > 0
      && !window.confirm(S.editor.overwriteWeekConfirm(occupiedDays))
    ) return

    setWeeksWithHistory((prev) => {
      const srcWeek = prev.find((w) => w.num === targetSelection.wnum - 1)
      if (!srcWeek) return prev
      const sourceDays = new Map(srcWeek.days.map((day) => [day.dow, day]))
      return prev.map((wk) => wk.num !== targetSelection.wnum ? wk : {
        ...wk,
        days: wk.days.map((day) => {
          const source = sourceDays.get(day.dow)
          if (!source) return day
          return {
            ...day,
            rest: isRestDay(source),
            rows: cloneRows(source.rows, 'copy-week'),
            releasedSortOrders: [],
          }
        }),
      })
    })
    setRowSelection(singleRowSelection(null))
    setCopyDone(true)
    window.setTimeout(() => setCopyDone(false), 1300)
  }

  const selectedDay = useCallback((): DayCol | null => {
    if (!sel) return null
    return weeks.find((week) => week.num === sel.wnum)?.days.find((day) => day.dow === sel.dow) ?? null
  }, [sel, weeks])

  const selectedRowValue = useCallback((): ExerciseRow | null => {
    if (!selectedRow) return null
    const day = weeks.find((week) => week.num === selectedRow.wnum)?.days.find((d) => d.dow === selectedRow.dow)
    return day?.rows.find((row) => row.id === selectedRow.rowId) ?? null
  }, [selectedRow, weeks])

  const selectedRowsValue = useCallback((): ExerciseRow[] => {
    if (!selectedRow) return []
    const day = displayWeeks.find((week) => week.num === selectedRow.wnum)?.days.find((d) => d.dow === selectedRow.dow)
    return day
      ? orderRowsForDisplay(day.rows, rowTier).filter((row) => selectedRowIds.has(row.id))
      : []
  }, [displayWeeks, rowTier, selectedRow, selectedRowIds])

  const copySelectedDay = useCallback(async () => {
    const day = selectedDay()
    const week = sel ? weeks.find((candidate) => candidate.num === sel.wnum) : null
    if (!day || !week) return
    const text = serializeDayForClipboard(day)
    dayClipboardRef.current = cloneDayClipboard(day)
    rowClipboardRef.current = null
    clipboardKindRef.current = 'day'
    clipboardTextRef.current = text
    setHasRowClipboard(false)
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
    setHasRowClipboard(true)
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
        return { ...day, rest: false, rows: [...day.rows, ...inserted] }
      }),
    }))
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
      if (text && text !== clipboardTextRef.current) externalRows = parseClipboardRows(text, props.exerciseIndex)
    } catch { /* use internal clipboard below */ }

    if (externalRows) {
      pasteRowsIntoSelection(externalRows)
      return
    }

    const clip = dayClipboardRef.current
    if (!clip) {
      setStatusText(S.editor.nothingToPaste)
      return
    }

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

  const undoWeeks = useCallback(() => {
    const prev = historyRef.current.pop()
    if (!prev) {
      setStatusText(S.editor.nothingToUndo)
      return
    }
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
  }, [])

  const redoWeeks = useCallback(() => {
    const next = redoRef.current.pop()
    if (!next) return
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
  }, [])

  const moveCellSelection = (move: 'next' | 'previous' | 'up' | 'down') => {
    const next = movePlanCell(latestDisplayWeeks.current, cellSelection, move)
    if (!next) return
    if (visibleWeekRef.current !== next.weekNumber) {
      setVisibleWeek(next.weekNumber)
      window.requestAnimationFrame(() => {
        const sc = scrollerRef.current
        const slot = weeksRef.current?.querySelector<HTMLElement>(`[data-week-slot][data-wnum="${next.weekNumber}"]`)
        if (sc && slot) scrollElementLeft(sc, slot.offsetLeft, 'smooth')
      })
    }
    setSel({ wnum: next.weekNumber, dow: next.dow })
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
    const gridInput = !!target?.closest('[data-plan-cell-key]')

    // Escape only clears the inspection selection — allowed even on
    // read-only historical plans and while a selected grid input has focus.
    if (e.key === 'Escape' && (!editable || gridInput)) {
      setCellSelection(null)
      setRowSelection((current) => current.anchor && current.rowIds.size > 1
        ? singleRowSelection(current.anchor)
        : current)
      return true
    }

    const mod = e.metaKey || e.ctrlKey
    const key = e.key.toLowerCase()
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
      else void copySelectedDay()
      return true
    } else if (key === 'v') {
      e.preventDefault()
      if (selectedRow || clipboardKindRef.current === 'row') void pasteSelectedRows()
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
    setRowSelection(singleRowSelection({ wnum, dow, rowId: row.id }))
    setCellSelection({ weekNumber: wnum, dow, rowId: row.id, field: 'name' })
  }

  const handleClearDay = () => {
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
      if (!hadUnsavedContent && !contentChangedDuringRequest) {
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

  const handleChangePlanWeeks = useCallback(async (nextCount: number) => {
    if (!props.onChangePlanWeeks || calendarLocked || saving || publishing.current) throw new Error('CALENDAR_LOCKED')
    if (!(await saver.current.flush())) throw new Error('SAVE_FAILED')
    const startDate = currentPlanStart.current
    if (!startDate) throw new Error('PLAN_DATE_MISSING')
    setSaving(true)
    setStatusText(S.editor.updatingCycle)
    try {
      await props.onChangePlanWeeks(nextCount)
      skipNextAutosave.current = true
      const nextWeeks = resizeWeeksForCount(latestWeeks.current, nextCount, startDate)
      setWeeks(nextWeeks)
      const clampedVisibleIndex = Math.min(visibleWeekIndex, Math.max(0, nextWeeks.length - 1))
      const clampedWeek = nextWeeks[clampedVisibleIndex]
      if (clampedWeek) {
        setVisibleWeek(clampedWeek.num)
        window.requestAnimationFrame(() => {
          const scroller = scrollerRef.current
          const slot = weeksRef.current?.querySelector<HTMLElement>(
            `[data-week-slot][data-wnum="${clampedWeek.num}"]`,
          )
          if (scroller) scrollElementLeft(scroller, slot?.offsetLeft ?? 0)
        })
      }
      setSel((current) => current && current.wnum > nextCount ? null : current)
      setRowSelection((current) => current.anchor && current.anchor.wnum > nextCount
        ? singleRowSelection(null)
        : current)
      markMirrorCovered(mirrorContent(nextWeeks, startDate, nextCount))
      setStatusText(S.editor.cycleUpdated(nextCount))
    } catch (error) {
      setStatusText(S.editor.cycleUpdateFailed)
      throw error
    } finally {
      setSaving(false)
    }
  }, [calendarLocked, markMirrorCovered, props.onChangePlanWeeks, saving, setVisibleWeek, visibleWeekIndex])

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
  const applyingSavedWeeks = useRef(false)
  const applySuccessfulSave = (res: SaveResult, savedWeeks: Week[]) => {
    if (res.weeks && latestWeeks.current === savedWeeks) {
      applyingSavedWeeks.current = true
      setWeeks(res.weeks)
      unsavedRef.current = false
    }
  }
  const applySaveFailure = (error: unknown): string | null => {
    if (error instanceof ReconcileConflict) {
      setWeeks(error.weeks)
      unsavedRef.current = true
      return error.topMessage ?? (error.code === 'DAY_HISTORY_IMMUTABLE'
        ? S.editor.athleteCompletedDuringSave
        : S.editor.athleteLoggedDuringSave)
    }
    if (error instanceof LockedRowMutationError) {
      setWeeks(error.weeks)
      unsavedRef.current = true
      return S.editor.lockedRowRetry
    }
    return null
  }
  persistRef.current = async () => {
    if (!props.onSave || published || readOnly) return true
    const auto = saveMode.current === 'auto'
    const importStart = pendingPlanStart.current
    const markPastAsAssumedComplete = importedPastHistory.current
    const verb = auto ? S.editor.autosaving : S.editor.saving
    setSaving(true); setStatusText(verb)
    try {
      // Big saves (imports) crawl through the backend rate limit for minutes — show real
      // per-day movement so the coach can tell progress from a hang. Tiny saves stay quiet.
      const onProgress = (done: number, total: number) => {
        if (total > 3) setStatusText(S.editor.progressDays(verb, done, total))
      }
      const savedWeeks = latestWeeks.current
      const savedPlanStart = importStart ?? currentPlanStart.current
      const res = await props.onSave(savedWeeks, importStart, markPastAsAssumedComplete, onProgress)
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
      if (res.skippedRows === 0) {
        markMirrorCovered(mirrorContent(
          res.weeks,
          res.planStartDate ?? savedPlanStart,
          res.planWeeks ?? savedWeeks.length,
        ))
      }
      applySuccessfulSave(res, savedWeeks)
      const base = importStart && markPastAsAssumedComplete
        ? S.editor.historyBackfilledLocked
        : (auto ? S.editor.draftAutosaved : S.editor.draftSaved)
      setStatusText(res.skippedRows > 0 ? S.editor.skippedUnboundRows(base, res.skippedRows) : base)
      return true
    }
    catch (error) {
      const scoped = applySaveFailure(error)
      if (scoped) {
        setStatusText(scoped)
      } else if (error instanceof ReconciliationError) {
        // Client-side refusals are permanent for this plan state — a generic
        // "重试" both misleads and hides the way out.
        const explain: Record<ReconciliationError['code'], [string, string]> = {
          PLAN_REQUIRES_NATIVE_EDITOR: [S.editor.nativeEditorSaveTitle, S.editor.nativeEditorDetail],
          PLAN_SET_SPEC_INCOMPLETE: [S.editor.incompleteSaveTitle, S.editor.incompleteSaveDetail],
        }
        const [status, detail] = explain[error.code]
        setStatusText(status)
        if (!auto) window.alert(detail)
      } else {
        setStatusText(auto ? S.editor.autosaveFailed : S.editor.saveFailedRetry)
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
  const issueHint = (() => {
    const unbound = issues.filter((i) => i.kind === 'unbound').length
    const inputIssues = issues.filter((i) => i.inputIssue != null)
    const incomplete = inputIssues.filter((i) => i.inputIssue?.hasIncomplete).length
    const invalid = inputIssues.filter((i) => (i.inputIssue?.reasons.length ?? 0) > 0).length
    const reasons = [...new Set(inputIssues.flatMap((i) => i.inputIssue?.reasons ?? []))]
    const parts = []
    if (unbound) parts.push(S.editor.unboundIssue(unbound))
    if (incomplete) parts.push(S.editor.incompleteIssue(incomplete))
    if (invalid) parts.push(S.editor.invalidIssue(invalid, reasons.join(' / ')))
    return S.editor.issueHint(parts.join('；'))
  })()
  const jumpToNextIssue = () => {
    const cur = findIssueRows(latestWeeks.current)
    if (cur.length === 0) return
    const issue = cur[issueCursor.current % cur.length]
    issueCursor.current++
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
    const targetWeek = latestWeeks.current.find((week) => week.days.some((day) => day.rows.some((row) => row.id === issue.rowId)))
    if (!targetWeek || rootRef.current?.querySelector(`[data-rowid="${issue.rowId}"]`)) {
      focusRow()
      return
    }
    setVisibleWeek(targetWeek.num)
    window.requestAnimationFrame(() => {
      const sc = scrollerRef.current
      const slot = weeksRef.current?.querySelector<HTMLElement>(`[data-week-slot][data-wnum="${targetWeek.num}"]`)
      if (sc && slot) scrollElementLeft(sc, slot.offsetLeft, 'smooth')
      window.requestAnimationFrame(focusRow)
    })
  }

  // ---- week-tab navigation -------------------------------------------------------------------
  const jumpToWeek = (num: number) => {
    setVisibleWeek(num)
    window.requestAnimationFrame(() => {
      const sc = scrollerRef.current
      const slot = weeksRef.current?.querySelector<HTMLElement>(`[data-week-slot][data-wnum="${num}"]`)
      if (sc && slot) scrollElementLeft(sc, slot.offsetLeft, 'smooth')
    })
  }

  const jumpToAdjacentWeek = (delta: -1 | 1) => {
    const currentIndex = latestWeeks.current.findIndex((week) => week.num === visibleWeekRef.current)
    const target = latestWeeks.current[(currentIndex >= 0 ? currentIndex : visibleWeekIndex) + delta]
    if (target) jumpToWeek(target.num)
  }

  const handleSave = async () => {
    if (!props.onSave || readOnly || saving || publishing.current) return
    if (published) {
      if (!recoveryReady) {
        window.alert(S.editor.checkingRemoteBeforeUpdate)
        return
      }
      if (recoveryMirror) {
        window.confirm(S.editor.resolveRecoveryBeforeUpdate)
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
      if (!window.confirm(S.editor.updatePublishedConfirm(planName, studentName, unboundLine))) return
      setSaving(true); setStatusText(S.editor.updating)
      // Transient failures (network, 5xx, exhausted 429 back-off) get ONE automatic
      // retry; reconcile re-baselines against the server first, so replaying it is
      // safe. Anything still failing is surfaced in a modal, not just the status
      // line — a coach who misses the status line is exactly how W7 went missing.
      const savedWeeks = latestWeeks.current
      const onProgress = (done: number, total: number) => {
        if (total > 3) setStatusText(S.editor.progressDays(S.editor.updating, done, total))
      }
      try {
        for (let attempt = 1; ; attempt++) {
          try {
            const res = await props.onSave(savedWeeks, null, false, onProgress)
            // Edits typed during the round-trip aren't in what was pushed — keep the guards armed.
            // A published update never writes calendar metadata, so the covered
            // hash must use the server-persisted date/weeks, not local values.
            if (res.skippedRows === 0) {
              markMirrorCovered(mirrorContent(res.weeks, persistedPlanStart.current, props.weeksCount))
            }
            applySuccessfulSave(res, savedWeeks)
            setStatusText(res.skippedRows > 0 ? S.editor.updatedStudentPlanSkipped(studentName, res.skippedRows) : S.editor.updatedStudentPlan(studentName))
            break
          }
          catch (error) {
            const scoped = applySaveFailure(error)
            if (scoped) {
              setStatusText(scoped)
              break
            }
            if (error instanceof ReconciliationError) {
              const explain: Record<ReconciliationError['code'], [string, string]> = {
                PLAN_REQUIRES_NATIVE_EDITOR: [S.editor.nativeEditorUpdateTitle, S.editor.nativeEditorDetail],
                PLAN_SET_SPEC_INCOMPLETE: [S.editor.incompleteSaveTitle, S.editor.incompleteUpdateDetail],
              }
              const [status, detail] = explain[error.code]
              setStatusText(status)
              window.alert(detail)
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
      setSel(targetWeek && firstTrain ? { wnum: targetWeek.num, dow: firstTrain.dow } : null)
      if (targetWeek) {
        setCurWeekLabel(weekLabel(targetWeek.num))
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
        window.alert(S.editor.publishIncompleteAlert)
        setStatusText(S.editor.publishPlanNotSaved)
        saver.current.scheduleAutosave() // dirty is still set — re-arm so the save retries itself
        return
      }
      setStatusText(S.editor.publishing)
      if (onPublish) await onPublish()
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

  const selDayLabel = (() => {
    if (!sel) return ''
    const wk = weeks.find((w) => w.num === sel.wnum)
    const d = wk?.days.find((x) => x.dow === sel.dow)
    return d && wk ? S.editor.selectedDayInWeek(dayDisplay(wk, d), sel.wnum) : ''
  })()
  const copyTargetHasLockedRows = (() => {
    if (!sel) return false
    return weeks.find((week) => week.num === sel.wnum)?.days
      .some((day) => day.rows.some((row) => row.hasLogs)) ?? false
  })()
  const selectedRowForBar = selectedRowValue()
  const selectedCellInfo = useMemo(() => {
    const resolved = resolvePlanCell(displayWeeks, cellSelection)
    if (
      !resolved
      || !formulaCellDraft
      || !samePlanCell(resolved.selection, formulaCellDraft.selection)
    ) return resolved
    return {
      ...resolved,
      value: formulaCellDraft.rawValue === '' ? '/' : S.common.countSets(formulaCellDraft.rawValue),
    }
  }, [cellSelection, displayWeeks, formulaCellDraft])
  const selectedRowLabel = selectedRowForBar
    ? S.editor.currentRow(
      fmt.exerciseName({ name: selectedRowForBar.name, name_en: selectedRowForBar.nameEn }).trim()
        || S.common.unnamedExercise)
    : ''
  const visibleStatusText = published && publishedDirty
    ? remoteMirrorState.status === 'saved'
      ? S.editor.publishedDirtyStashed(studentName, savedClock(remoteMirrorState.savedAt))
      : remoteMirrorState.status === 'stashing'
        ? S.editor.publishedDirtyStashing(studentName)
        : S.editor.publishedDirtyLocal(studentName)
    : statusText
  const moveStateForDay = (wnum: number, dow: number): 'source' | 'target' | 'invalid' | undefined => {
    if (!dayMoveVisual) return undefined
    if (dayMoveVisual.fromWnum === wnum && dayMoveVisual.fromDow === dow) return 'source'
    if (dayMoveVisual.targetWnum === wnum && dayMoveVisual.targetDow === dow) {
      return dayMoveVisual.targetValid ? 'target' : 'invalid'
    }
    return undefined
  }

  return (
    <div ref={rootRef} className="plan-editor" style={{
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
        onSave={!readOnly && props.onSave ? handleSave : undefined} saving={saving}
        onImport={!readOnly && props.exerciseIndex && planStartDate ? handleImport : undefined}
        planStartDate={planStartDate ?? undefined}
        calendarLocked={calendarLocked || !props.onChangeStartDate}
        calendarLockedHint={calendarLocked ? calendarLockedHint : S.editor.calendarUnavailable}
        onChangeStartDate={planStartDate ? (props.onChangeStartDate ? handleChangeStartDate : async () => {}) : undefined}
        onNewExercise={!readOnly && props.onCreateExercise ? () => openCreateExercise() : undefined}
        issueCount={readOnly ? 0 : issues.length} issueHint={issueHint} onJumpIssue={jumpToNextIssue}
        totalShiftDays={props.totalShiftDays}
        studentPlanCursor={props.studentPlanCursor}
      />
      {recoveryMirror && (
        <DraftMirrorBanner
          savedAt={recoveryMirror.mirror.savedAt}
          source={recoveryMirror.source}
          onRestore={restoreDraftMirror}
          onDiscard={discardDraftMirror}
        />
      )}
      <Toolbar weeksCount={weeks.length || weeksCount} calendarLocked={calendarLocked} calendarLockedHint={calendarLockedHint}
        onChangeWeeks={props.onChangePlanWeeks ? handleChangePlanWeeks : undefined}
        removalSummary={(nextCount) => weeks.filter((week) => week.num > nextCount).reduce((summary, week) => {
          for (const day of week.days) {
            if (isRestDay(day)) continue
            summary.days++
            summary.exercises += day.rows.length
          }
          return summary
        }, { days: 0, exercises: 0 })}
        curWeekLabel={curWeekLabel}
        previousWeekDisabled={visibleWeekIndex <= 0}
        nextWeekDisabled={visibleWeekIndex >= weeks.length - 1}
        onPreviousWeek={() => jumpToAdjacentWeek(-1)}
        onNextWeek={() => jumpToAdjacentWeek(1)} />
      <nav className="week-tabs" aria-label={S.editor.planWeeksAria}>
        <div className="week-tab-list">
          {weeks.map((week, index) => (
            <button
              type="button"
              key={week.num}
              className={`week-tab${index === visibleWeekIndex ? ' active' : ''}`}
              aria-current={index === visibleWeekIndex ? 'page' : undefined}
              onClick={() => jumpToWeek(week.num)}
            >
              W{week.num2}
            </button>
          ))}
          <button
            type="button"
            className="week-tab-add"
            disabled={calendarLocked || saving || weeks.length >= 52 || !props.onChangePlanWeeks}
            title={calendarLocked ? calendarLockedHint : S.editor.addWeek}
            onClick={() => {
              const nextCount = weeks.length + 1
              void handleChangePlanWeeks(nextCount).then(() => {
                setVisibleWeekIndex(nextCount - 1)
                window.requestAnimationFrame(() => jumpToWeek(nextCount))
              }).catch(() => undefined)
            }}
          >
            {S.editor.addWeekButton}
          </button>
        </div>
      </nav>
      <ContextBar
        visible={!!sel && !readOnly}
        dayLabel={selDayLabel}
        canCopyPrev={!!sel && sel.wnum > 1 && !copyTargetHasLockedRows}
        copyDisabledHint={copyTargetHasLockedRows ? S.editor.copyTargetLogged : undefined}
        copyLabel={copyDone ? S.editor.copiedLastWeek : COPY_LABEL}
        copyDone={copyDone}
        selectedRowLabel={selectedRowLabel}
        hasRowClipboard={hasRowClipboard}
        onCopyPrev={handleCopyPrev}
        onPasteRow={pasteSelectedRows}
        onClearDay={handleClearDay}
        onClose={() => {
          setSel(null)
          setRowSelection(singleRowSelection(null))
          setCellSelection(null)
          setPop((p) => ({ ...p, visible: false }))
        }}
      />
      <FormulaBar cell={selectedCellInfo} />

      {/* v1.3 页眉集成试验：ContextRail 与视口钳制实现保留作回滚，编辑器渲染入口暂时下线。 */}
      <div className="plan-with-rail">
      <div className="scroller" ref={scrollerRef} aria-readonly={readOnly || undefined} style={{ flex: 1, overflow: 'auto', position: 'relative', background: 'var(--page-bg)', scrollSnapType: 'x mandatory' }}>
        {readOnly && <div role="status" style={{ position: 'sticky', top: 0, zIndex: 12, padding: '8px 16px', background: 'var(--panel-bg)', borderBottom: '1px solid var(--bd)', color: 'var(--sec)', fontSize: 12 }}>{S.editor.historyReadOnlyBanner}</div>}
        <div style={{ pointerEvents: readOnly ? 'none' : undefined }}>
            <div ref={weeksRef} className="week-band-track" style={{ gap: WEEK_BAND_GAP_PX }}>
              {weeks.map((wk, weekIndex) => (
                Math.abs(weekIndex - visibleWeekIndex) > 1 ? (
                  <div
                    key={wk.num}
                    className="week-band-slot weekband-spacer"
                    data-week-slot=""
                    data-wnum={wk.num}
                    aria-hidden="true"
                    style={{ scrollSnapAlign: 'start' }}
                  />
                ) : <div key={wk.num} className="weekband week-band-slot" data-week-slot="" data-wnum={wk.num} style={{ scrollSnapAlign: 'start' }}>
                  <div className="weekband-head">
                    <kbd>W{wk.num2}</kbd>
                    <span className="weekband-name">{S.common.weekN(wk.num)}</span>
                    <span className="weekband-range">{wk.range}</span>
                    <WeekCapacitySummary weekNumber={wk.num} {...weeklySummaries[weekIndex]} />
                    {wk.isCurrent && (
                      <span className="weekband-current">
                        <span />{S.editor.currentWeek}
                      </span>
                    )}
                  </div>
                  <div className="weekrow" data-weekrow="">
                    {wk.days.map((day, dayIndex) => (
                      <DayColumn
                        key={day.dow}
                        weekNumber={wk.num}
                        columnLetter={String.fromCharCode(65 + dayIndex)}
                        day={day}
                        colW={colW[day.dow]}
                        selected={sel?.wnum === wk.num && sel?.dow === day.dow}
                        selectedRowId={selectedRow?.wnum === wk.num && selectedRow.dow === day.dow ? selectedRow.rowId : null}
                        selectedRowIds={selectedRow?.wnum === wk.num && selectedRow.dow === day.dow ? selectedRowIds : undefined}
                        cellSelection={cellSelection}
                        headerContext={sel?.wnum === wk.num && sel?.dow === day.dow && props.studentId ? (
                          <DayHeaderContext
                            studentId={props.studentId}
                            studentName={studentName}
                            row={selectedRowForBar}
                            profile={props.onboardingProfile}
                          />
                        ) : undefined}
                        readOnly={readOnly}
                        rowTier={rowTier}
                        onSelect={() => handleDayClick(wk.num, day.dow)}
                        onSelectRow={(rowId, modifiers) => handleSelectRow(wk.num, day.dow, rowId, modifiers)}
                        onSelectCell={(rowId, field, setIndex) => handleSelectCell(wk.num, day.dow, rowId, field, setIndex)}
                        onSetsDraftChange={(rowId, draft) => handleSetsDraftChange(wk.num, day.dow, rowId, draft)}
                        dayMoveState={moveStateForDay(wk.num, day.dow)}
                        dayMoveDisabledHint={dayMoveDisabledReason(day, dayMoveLocked)}
                        onDayMoveStart={(e) => handleDayMoveStart(wk.num, day, e)}
                        onResizeStart={(col, e) => handleResizeStart(day.dow, col, e)}
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
                        actualsForRow={actualsForRow}
                        e1rmForRow={e1rmForRow}
                      />
                    ))}
                  </div>
                </div>
              ))}
            </div>
        </div>
      </div>

      </div>

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
