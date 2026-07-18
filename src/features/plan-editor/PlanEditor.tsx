import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { ColKey, ColWidths, Week, DayCol, ExerciseRow } from './types'
import { COL_DEFAULTS, COL_MIN, isContentfulUnbound } from './types'
import { getBoundRowInputIssue, type BoundRowInputIssue } from './inputGuard'
import { ApiException } from '../../api/client'
import { TopBar } from './components/TopBar'
import { Toolbar } from './components/Toolbar'
import { ContextBar } from './components/ContextBar'
import { DayColumn } from './components/DayColumn'
import { ExercisePopover } from './components/ExercisePopover'
import { CustomExerciseDialog } from './components/CustomExerciseDialog'
import type { ExerciseIndex, ExerciseHit } from './exerciseIndex'
import type { CreateCustomExerciseInput } from '../../api/exercises'
import type { PlanStatus, StudentOnboardingProfile } from '../../api/types'
import { WritingContextPanel } from './components/WritingContextPanel'
import type { ParsedWeek } from './import'
import {
  LockedRowMutationError, ReconcileConflict, ReconciliationError, type SaveResult,
} from './reconcile'
import { createSaveController } from './autosave'
import { parseClipboardRows, serializeDayForClipboard, serializeRowsForClipboard } from './clipboard'
import { relabelWeeksForStartDate, resizeWeeksForCount } from './mapping'
import { dayMoveDisabledReason, moveDayInWeek } from './dayMove'
import { compareWeekMetric, summarizeWeek } from './weeklySummary'
import { WeekCapacitySummary } from './components/WeekCapacitySummary'
import { loadJtsPhase, saveJtsPhase, type JtsPhaseSelection } from './jtsVolumeBands'
import {
  clearDraftMirror, clearDraftMirrorIfHash, createDraftMirrorWriter, draftContentHash,
  loadDraftMirror, saveDraftMirror, type DraftMirror, type DraftMirrorContent,
} from './draftMirror'
import { DraftMirrorBanner } from './components/DraftMirrorBanner'

interface Sel { wnum: number; dow: number }
interface PopState { visible: boolean; x: number; y: number; wnum: number; dow: number; rowId: string; query: string }
interface RowTarget { wnum: number; dow: number; rowId: string }
interface CreateExerciseState { open: boolean; initialName: string; bindTarget: RowTarget | null }
type ClipboardKind = 'day' | 'row'
interface DayMoveVisual {
  fromWnum: number
  fromDow: number
  targetWnum: number | null
  targetDow: number | null
  targetValid: boolean
}

const COPY_LABEL = '⎘ 复制上周计划到本周'
const DAY_MOVE_THRESHOLD = 5

interface Switcher { id: string; label: string; tag?: string }

export interface PlanEditorProps {
  initialWeeks: Week[]
  weeksCount: number
  studentName: string
  studentId?: string
  onboardingProfile?: StudentOnboardingProfile | null
  planName: string
  initialPublished?: boolean
  planStatus?: PlanStatus
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
  onLogout?: () => void | Promise<void>
  /** Registers the same guarded-leave path used by the editor's own plan/student/logout controls. */
  onLeaveGuardChange?: (guard: (() => Promise<boolean>) | null) => void
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
    if (d.rest) continue
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
  return `W${String(num).padStart(2, '0')} · 第 ${num} 周`
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
interface DayClipboard { rest: boolean; rows: ExerciseRow[] }

function isEditableTarget(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null
  if (!el) return false
  return el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el.isContentEditable
}

function cloneRow(row: ExerciseRow, prefix: string, index: number): ExerciseRow {
  return {
    ...row,
    id: `${prefix}-${index}-${Date.now()}-${Math.round(performance.now())}`,
    serverRowId: null,
    serverSortOrder: null,
    hasLogs: false,
    conflictMessage: null,
    boxes: row.boxes.map((box) => ({ ...box })),
  }
}

function cloneRows(rows: ExerciseRow[], prefix: string): ExerciseRow[] {
  return rows.map((row, index) => cloneRow(row, prefix, index))
}

function cloneDayClipboard(day: DayCol): DayClipboard {
  return { rest: day.rest, rows: cloneRows(day.rows, 'clip') }
}

function dayDisplay(day: DayCol): string {
  return `${day.dowLabel} ${day.dateLabel}`
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
  const [weeks, setWeeks] = useState<Week[]>(initialWeeks)
  const latestWeeks = useRef(weeks)
  latestWeeks.current = weeks
  const mirrorPlanId = props.currentPlanId
  const initialServerMirrorContent = useRef(mirrorContent(
    initialWeeks,
    props.planStartDate ?? null,
    initialWeeks.length || weeksCount,
  ))
  const serverMirrorHash = useRef(draftContentHash(initialServerMirrorContent.current))
  const mountedMirror = useRef<DraftMirror | null>(loadDraftMirror(mirrorPlanId))
  const [recoveryMirror, setRecoveryMirror] = useState<DraftMirror | null>(() => {
    const mirror = mountedMirror.current
    return mirror && mirror.contentHash !== serverMirrorHash.current ? mirror : null
  })
  const mirrorWriter = useRef(createDraftMirrorWriter({ planId: mirrorPlanId }))
  const suspendedRef = useRef(false)
  suspendedRef.current = !!props.suspended
  // Keep the displayed start date separate from the metadata change waiting to
  // be persisted. Clearing a pending save must never make a second date shift
  // calculate from the old parent prop, and undo/redo needs the real date too.
  const currentPlanStart = useRef<string | null>(props.planStartDate ?? null)
  const persistedPlanStart = useRef<string | null>(props.planStartDate ?? null)
  const pendingPlanStart = useRef<string | null>(null)
  // Kept with the import token so an autosave retry reuses the coach's explicit
  // answer rather than prompting again or silently changing historical data.
  const importedPastHistory = useRef(false)
  const [colW, setColW] = useState<ColWidths[]>(() => Array.from({ length: 7 }, () => ({ ...COL_DEFAULTS })))
  const [sel, setSel] = useState<Sel | null>(null)
  const [selectedRow, setSelectedRow] = useState<RowTarget | null>(null)
  const [dismissedContextDays, setDismissedContextDays] = useState<Set<string>>(() => new Set())
  const [zoom, setZoom] = useState(100)
  const [volumePhase, setVolumePhase] = useState<JtsPhaseSelection>(() => loadJtsPhase(props.currentPlanId))
  // Authoritative published state, initialized from the backend plan status. Monotonic:
  // set true on a real publish and never cleared — there is no backend unpublish, so 发布后不可撤回.
  // Published plans remain editable, but only through explicit confirmed updates;
  // rows with server-authoritative history are locked individually.
  const [published, setPublished] = useState(initialPublished)
  const [statusText, setStatusText] = useState(initialPublished ? `已发布给 ${studentName}` : '草稿 · 已存')
  // W1 calendar/delete controls are draft-only. Keep this separate from main's
  // `published` flag, which drives explicit in-place updates for spec 004.
  const statusCalendarLocked = props.planStatus != null ? props.planStatus !== 'draft' : published
  const [copyDone, setCopyDone] = useState(false)
  const [rowCopyDone, setRowCopyDone] = useState(false)
  const [hasRowClipboard, setHasRowClipboard] = useState(false)
  const [curWeekLabel, setCurWeekLabel] = useState('—')
  const [pop, setPop] = useState<PopState>({ visible: false, x: 0, y: 0, wnum: 0, dow: 0, rowId: '', query: '' })
  const [createExercise, setCreateExercise] = useState<CreateExerciseState>({ open: false, initialName: '', bindTarget: null })
  const [creatingExercise, setCreatingExercise] = useState(false)
  const [createExerciseError, setCreateExerciseError] = useState('')
  const [dayMoveVisual, setDayMoveVisual] = useState<DayMoveVisual | null>(null)

  const rootRef = useRef<HTMLDivElement>(null)
  const scrollerRef = useRef<HTMLDivElement>(null)
  const zoomwrapRef = useRef<HTMLDivElement>(null)
  const sizerRef = useRef<HTMLDivElement>(null)
  const weeksRef = useRef<HTMLDivElement>(null)
  const fitScaleRef = useRef(1)
  const zoomRef = useRef(100)
  const dragRef = useRef<{ dow: number; col: ColKey; startX: number; startW: number; el: HTMLElement } | null>(null)
  const panRef = useRef<{ x: number; y: number; sl: number; st: number } | null>(null)
  const gzRef = useRef(100)
  const historyRef = useRef<Week[][]>([])
  const redoRef = useRef<Week[][]>([])
  const historyStartRef = useRef<(string | null)[]>([])
  const redoStartRef = useRef<(string | null)[]>([])
  const dayClipboardRef = useRef<DayClipboard | null>(null)
  const rowClipboardRef = useRef<ExerciseRow | null>(null)
  const clipboardKindRef = useRef<ClipboardKind | null>(null)
  const clipboardTextRef = useRef('')
  const suppressDayClickRef = useRef(false)
  const dayMoveCleanupRef = useRef<((updateVisual?: boolean) => void) | null>(null)

  useEffect(() => () => dayMoveCleanupRef.current?.(false), [])

  useEffect(() => {
    setVolumePhase(loadJtsPhase(props.currentPlanId))
  }, [props.currentPlanId])

  const changeVolumePhase = useCallback((phase: JtsPhaseSelection) => {
    setVolumePhase(phase)
    saveJtsPhase(props.currentPlanId, phase)
  }, [props.currentPlanId])

  useEffect(() => {
    // Parent metadata is authoritative after loading/saving. Do not overwrite a
    // local date while it is still waiting to be reconciled.
    if (pendingPlanStart.current === null) {
      currentPlanStart.current = props.planStartDate ?? null
      persistedPlanStart.current = props.planStartDate ?? null
    }
  }, [props.planStartDate])

  const setWeeksWithHistory = useCallback((update: WeeksUpdate) => {
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
  }, [])

  const markMirrorCovered = useCallback((content: DraftMirrorContent) => {
    const hash = draftContentHash(content)
    serverMirrorHash.current = hash
    mirrorWriter.current.dropPendingIfHash(hash)
    clearDraftMirrorIfHash(mirrorPlanId, hash)
  }, [mirrorPlanId])

  useEffect(() => {
    // The writer keeps running while the recovery banner is open: the banner's
    // candidate lives in React state, so edits typed before the coach decides
    // still reach storage instead of going unprotected.
    if (!mirrorPlanId) return
    const content = mirrorContent(
      weeks,
      currentPlanStart.current,
      weeks.length || props.weeksCount,
    )
    const hash = draftContentHash(content)
    if (hash === serverMirrorHash.current) {
      // Content is back at the server baseline (e.g. undo): there is no draft
      // left to protect, so drop ANY pending write and wipe the stored mirror
      // outright — a hash-conditional clean would leave the undone draft to
      // resurrect on reload. An open banner still owns its stored candidate.
      mirrorWriter.current.cancel()
      if (!recoveryMirror) clearDraftMirror(mirrorPlanId)
      return
    }
    mirrorWriter.current.schedule(content)
  }, [mirrorPlanId, props.weeksCount, recoveryMirror, weeks])

  useEffect(() => {
    const writer = mirrorWriter.current
    return () => writer.cancel()
  }, [])

  const restoreDraftMirror = useCallback(() => {
    if (!recoveryMirror) return
    const { content } = recoveryMirror
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
    pendingPlanStart.current = metadataChanged ? content.planStartDate : null
    saveDraftMirror(mirrorPlanId, content)
    setRecoveryMirror(null)
  }, [mirrorPlanId, props.weeksCount, published, recoveryMirror, setWeeksWithHistory])

  const discardDraftMirror = useCallback(() => {
    // Only the discarded candidate is removed; a newer mirror written while
    // the banner was open (edits keep mirroring) must survive the discard.
    clearDraftMirrorIfHash(mirrorPlanId, recoveryMirror?.contentHash ?? '')
    setRecoveryMirror(null)
  }, [mirrorPlanId, recoveryMirror])

  useEffect(() => { zoomRef.current = zoom }, [zoom])

  // ---- zoom / fit ----
  const natW = useCallback(() => {
    const r = weeksRef.current?.querySelector<HTMLElement>('[data-weekrow]')
    return r ? r.offsetWidth : 1
  }, [])

  const applyZoom = useCallback(() => {
    const zw = zoomwrapRef.current, sz = sizerRef.current, we = weeksRef.current
    if (!zw || !sz || !we) return
    const scale = fitScaleRef.current * (zoomRef.current / 100)
    zw.style.transform = `scale(${scale})`
    sz.style.width = `${natW() * scale}px`
    sz.style.height = `${we.offsetHeight * scale}px`
  }, [natW])

  const computeFit = useCallback(() => {
    const sc = scrollerRef.current
    // Mid-layout resizes can sample a 0-width scroller; a 0 fit scale collapses the whole
    // grid to nothing and never recovers — keep the last good fit instead.
    if (!sc || sc.clientWidth === 0) return
    fitScaleRef.current = Math.min(1.15, sc.clientWidth / natW())
  }, [natW])

  // Re-apply zoom whenever widths / data / zoom change (after DOM commit).
  useLayoutEffect(() => { applyZoom() }, [colW, weeks, zoom, applyZoom])

  // ---- current-week indicator ----
  const updateCur = useCallback(() => {
    const sc = scrollerRef.current
    if (!sc) return
    const top = sc.getBoundingClientRect().top
    let cur: string | null = null
    sc.querySelectorAll<HTMLElement>('.weekband').forEach((b) => {
      if (b.getBoundingClientRect().top - top <= 12) cur = b.dataset.wnum ?? null
    })
    if (cur) setCurWeekLabel(weekLabel(Number(cur)))
  }, [])

  // ---- initial fit + scroll to current week ----
  useEffect(() => {
    const id = window.setTimeout(() => {
      computeFit()
      applyZoom()
      const sc = scrollerRef.current
      const bands = sc?.querySelectorAll<HTMLElement>('.weekband')
      const curIdx = Math.max(0, weeks.findIndex((w) => w.isCurrent))
      const band = bands?.[curIdx]
      if (sc && band) {
        const br = band.getBoundingClientRect(), sr = sc.getBoundingClientRect()
        sc.scrollTop += (br.top - sr.top) - 6
        const cur = weeks[curIdx]
        const firstTrain = cur?.days.find((d) => !d.rest)
        if (cur && firstTrain) setSel({ wnum: cur.num, dow: firstTrain.dow })
      }
      updateCur()
    }, 60)
    const onResize = () => { computeFit(); applyZoom(); updateCur() }
    window.addEventListener('resize', onResize)
    return () => { window.clearTimeout(id); window.removeEventListener('resize', onResize) }
    // run once on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ---- global drag (column resize) + pan ----
  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      const d = dragRef.current
      if (d) {
        const scale = fitScaleRef.current * (zoomRef.current / 100)
        const dx = (e.clientX - d.startX) / scale
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
      if (panRef.current) { panRef.current = null; scrollerRef.current?.classList.remove('panning') }
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp) }
  }, [])

  // ---- scroller native listeners: wheel zoom, middle-mouse pan, gestures ----
  useEffect(() => {
    const sc = scrollerRef.current
    if (!sc) return
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey) return
      e.preventDefault()
      setZoom((z) => Math.max(100, Math.min(220, z - e.deltaY * 0.4)))
    }
    const onDown = (e: MouseEvent) => {
      if (e.button !== 1) return
      e.preventDefault()
      panRef.current = { x: e.clientX, y: e.clientY, sl: sc.scrollLeft, st: sc.scrollTop }
      sc.classList.add('panning')
    }
    const onGestureStart = (e: Event) => { e.preventDefault(); gzRef.current = zoomRef.current }
    const onGestureChange = (e: Event) => {
      e.preventDefault()
      const scale = (e as unknown as { scale: number }).scale
      setZoom(Math.max(100, Math.min(220, gzRef.current * scale)))
    }
    sc.addEventListener('wheel', onWheel, { passive: false })
    sc.addEventListener('mousedown', onDown)
    sc.addEventListener('gesturestart', onGestureStart as EventListener)
    sc.addEventListener('gesturechange', onGestureChange as EventListener)
    sc.addEventListener('scroll', updateCur)
    return () => {
      sc.removeEventListener('wheel', onWheel)
      sc.removeEventListener('mousedown', onDown)
      sc.removeEventListener('gesturestart', onGestureStart as EventListener)
      sc.removeEventListener('gesturechange', onGestureChange as EventListener)
      sc.removeEventListener('scroll', updateCur)
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
    setSelectedRow(null)
    setPop((p) => ({ ...p, visible: false }))
  }
  const handleDayClick = (wnum: number, dow: number) => {
    if (suppressDayClickRef.current) return
    handleSelect(wnum, dow)
  }
  const handleDayMoveStart = (wnum: number, day: DayCol, e: React.MouseEvent) => {
    if (e.button !== 0 || dayMoveDisabledReason(day, statusCalendarLocked)) return
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
            const swapped = !targetDay.rest && targetDay.rows.length > 0
            setWeeksWithHistory((previous) => {
              const index = previous.findIndex((week) => week.num === wnum)
              if (index < 0) return previous
              const moved = moveDayInWeek(previous[index], day.dow, currentTarget!.dow)
              if (moved === previous[index]) return previous
              const next = [...previous]
              next[index] = moved
              return next
            })
            handleSelect(wnum, currentTarget.dow)
            setStatusText(swapped
              ? `已交换 ${dayDisplay(sourceDay)} 与 ${dayDisplay(targetDay)}`
              : `已移动 ${dayDisplay(sourceDay)} 至 ${dayDisplay(targetDay)}`)
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
  const handleSelectRow = (wnum: number, dow: number, rowId: string) => {
    setSel({ wnum, dow })
    setSelectedRow({ wnum, dow, rowId })
    setPop((p) => ({ ...p, visible: false }))
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
  const handleNameFocus = (wnum: number, dow: number, rowId: string, name: string, el: HTMLElement) => {
    positionPopAt(el, wnum, dow, rowId, name)
  }
  const handleNameChange = (wnum: number, dow: number, rowId: string, value: string, el: HTMLElement) => {
    editRow(wnum, dow, rowId, (r) => ({ ...r, name: value, exerciseId: null, ku: false, custom: false }))
    positionPopAt(el, wnum, dow, rowId, value)
  }
  const handleNameBlur = () => { window.setTimeout(() => setPop((p) => ({ ...p, visible: false })), 160) }

  const bindRowAt = (target: { wnum: number; dow: number; rowId: string }, exerciseId: string, name: string, custom: boolean) => {
    // Backfill is_main_lift from the catalog tier so manually picked rows persist
    // the same flag the xlsx-import path infers (main lift or variation → true).
    const tier = props.exerciseIndex?.typeById(exerciseId) ?? null
    setWeeksWithHistory((prev) => prev.map((wk) => wk.num !== target.wnum ? wk : {
      ...wk,
      days: wk.days.map((d) => d.dow !== target.dow ? d : {
        ...d, rows: d.rows.map((r) => r.id === target.rowId && !r.hasLogs
          ? { ...r, exerciseId, name, ku: !custom, custom, isMain: tier ? tier !== 'accessory' : r.isMain }
          : r),
      }),
    }))
  }
  const editRow = (wnum: number, dow: number, rowId: string, updater: (r: ExerciseRow) => ExerciseRow) => {
    setWeeksWithHistory((prev) => prev.map((wk) => wk.num !== wnum ? wk : {
      ...wk,
      days: wk.days.map((d) => d.dow !== dow ? d : { ...d, rows: d.rows.map((r) => r.id === rowId && !r.hasLogs ? updater(r) : r) }),
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
    setSelectedRow((row) => (row?.wnum === wnum && row.dow === dow && row.rowId === rowId ? null : row))
  }
  /** Display tier for a row: catalog exercise_type is authoritative (main lift +
   *  variations vs accessories); unbound/unknown rows fall back to is_main_lift. */
  const rowTier = useCallback((row: ExerciseRow): 'main' | 'aux' => {
    if (row.exerciseId && props.exerciseIndex) {
      const t = props.exerciseIndex.typeById(row.exerciseId)
      if (t) return t === 'accessory' ? 'aux' : 'main'
    }
    return row.isMain ? 'main' : 'aux'
  }, [props.exerciseIndex])

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

  const reorderRow = (
    wnum: number,
    dow: number,
    dragRowId: string,
    targetRowId: string,
    position: 'before' | 'after',
  ) => {
    if (dragRowId === targetRowId) return
    setWeeksWithHistory((prev) => prev.map((wk) => wk.num !== wnum ? wk : {
      ...wk,
      days: wk.days.map((d) => {
        if (d.dow !== dow) return d
        if (d.rows.some((row) => row.hasLogs)) return d
        const sourceIndex = d.rows.findIndex((r) => r.id === dragRowId)
        if (sourceIndex < 0) return d
        const moving = d.rows[sourceIndex]
        const rows = d.rows.filter((r) => r.id !== dragRowId)
        const targetIndex = rows.findIndex((r) => r.id === targetRowId)
        if (targetIndex < 0) return d
        const insertAt = position === 'after' ? targetIndex + 1 : targetIndex
        rows.splice(insertAt, 0, moving)
        return { ...d, rows }
      }),
    }))
    setSel({ wnum, dow })
    setSelectedRow({ wnum, dow, rowId: dragRowId })
    setPop((p) => ({ ...p, visible: false }))
  }

  const onPickHit = (hit: ExerciseHit) => {
    bindRowAt({ wnum: pop.wnum, dow: pop.dow, rowId: pop.rowId }, hit.id, hit.name, false)
    setPop((p) => ({ ...p, visible: false }))
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
      if (createExercise.bindTarget) bindRowAt(createExercise.bindTarget, e.id, e.name, true)
      setStatusText(`已创建动作「${e.name}」`)
      setCreateExercise({ open: false, initialName: '', bindTarget: null })
    } catch (e) {
      const code = e instanceof ApiException ? e.code : ''
      setCreateExerciseError(code ? `创建失败（${code}）` : '创建失败，请重试')
    } finally {
      setCreatingExercise(false)
    }
  }

  const patchSelDay = (updater: (d: DayCol) => DayCol) => {
    if (!sel) return
    setWeeksWithHistory((prev) => prev.map((wk) => wk.num !== sel.wnum ? wk : {
      ...wk, days: wk.days.map((d) => d.dow !== sel.dow ? d : updater(d)),
    }))
  }

  const handleCopyPrev = () => {
    if (!sel || sel.wnum <= 1) return
    const targetWeek = weeks.find((week) => week.num === sel.wnum)
    if (targetWeek?.days.some((day) => day.rows.some((row) => row.hasLogs))) return
    const occupiedDays = targetWeek?.days.filter((day) => !day.rest && day.rows.length > 0).length ?? 0
    if (
      occupiedDays > 0
      && !window.confirm(`本周已有 ${occupiedDays} 天训练内容，复制上周会覆盖整周计划。是否继续？`)
    ) return

    setWeeksWithHistory((prev) => {
      const srcWeek = prev.find((w) => w.num === sel.wnum - 1)
      if (!srcWeek) return prev
      const sourceDays = new Map(srcWeek.days.map((day) => [day.dow, day]))
      return prev.map((wk) => wk.num !== sel.wnum ? wk : {
        ...wk,
        days: wk.days.map((day) => {
          const source = sourceDays.get(day.dow)
          if (!source) return day
          return {
            ...day,
            rest: source.rest,
            rows: source.rest ? [] : cloneRows(source.rows, 'copy-week'),
            releasedSortOrders: [],
          }
        }),
      })
    })
    setSelectedRow(null)
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

  const copySelectedDay = useCallback(async () => {
    const day = selectedDay()
    if (!day) return
    const text = serializeDayForClipboard(day)
    dayClipboardRef.current = cloneDayClipboard(day)
    rowClipboardRef.current = null
    clipboardKindRef.current = 'day'
    clipboardTextRef.current = text
    setHasRowClipboard(false)
    try { await navigator.clipboard?.writeText(text) } catch { /* internal clipboard still works */ }
    setStatusText(`已复制 ${dayDisplay(day)}`)
  }, [selectedDay])

  const copySelectedRow = useCallback(async () => {
    const row = selectedRowValue()
    if (!row) {
      setStatusText('先选中一个动作')
      return
    }
    const text = serializeRowsForClipboard([row])
    rowClipboardRef.current = cloneRow(row, 'clip-row', 0)
    clipboardKindRef.current = 'row'
    clipboardTextRef.current = text
    setHasRowClipboard(true)
    try { await navigator.clipboard?.writeText(text) } catch { /* internal clipboard still works */ }
    setRowCopyDone(true)
    window.setTimeout(() => setRowCopyDone(false), 1300)
    setStatusText(`已复制动作「${row.name.trim() || '未命名'}」`)
  }, [selectedRowValue])

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
    setSelectedRow({ wnum: sel.wnum, dow: sel.dow, rowId: inserted[0].id })
    const target = weeks.find((week) => week.num === sel.wnum)?.days.find((day) => day.dow === sel.dow)
    setStatusText(target ? `已粘贴动作到 ${dayDisplay(target)}` : '已粘贴动作')
  }, [sel, setWeeksWithHistory, weeks])

  const pasteSelectedRows = useCallback(async () => {
    if (!sel) return
    let externalRows: ExerciseRow[] | null = null
    try {
      const text = await navigator.clipboard?.readText()
      if (text && text !== clipboardTextRef.current) externalRows = parseClipboardRows(text, props.exerciseIndex)
    } catch { /* use internal clipboard below */ }

    const rows = externalRows ?? (clipboardKindRef.current === 'row' && rowClipboardRef.current ? [rowClipboardRef.current] : null)
    if (!rows) {
      setStatusText('没有可粘贴的动作')
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
      setStatusText('没有可粘贴的内容')
      return
    }

    setWeeksWithHistory((prev) => prev.map((wk) => wk.num !== sel.wnum ? wk : {
      ...wk,
      days: wk.days.map((day) => day.dow !== sel.dow ? day : replaceUnlockedRows(
        day,
        clip.rest ? [] : clip.rows,
      )),
    }))
    setSelectedRow(null)
    const target = weeks.find((week) => week.num === sel.wnum)?.days.find((day) => day.dow === sel.dow)
    setStatusText(target ? `已粘贴到 ${dayDisplay(target)}` : '已粘贴')
  }, [pasteRowsIntoSelection, props.exerciseIndex, sel, setWeeksWithHistory, weeks])

  const undoWeeks = useCallback(() => {
    const prev = historyRef.current.pop()
    if (!prev) {
      setStatusText('没有可撤回的操作')
      return
    }
    const prevStart = historyStartRef.current.pop() ?? null
    const currentStart = currentPlanStart.current
    currentPlanStart.current = prevStart
    pendingPlanStart.current = prevStart === persistedPlanStart.current ? null : prevStart
    setWeeks((current) => {
      redoRef.current = [...redoRef.current.slice(-49), current]
      redoStartRef.current = [...redoStartRef.current.slice(-49), currentStart]
      return prev
    })
    setStatusText('已撤回')
  }, [])

  const redoWeeks = useCallback(() => {
    const next = redoRef.current.pop()
    if (!next) return
    const nextStart = redoStartRef.current.pop() ?? null
    const currentStart = currentPlanStart.current
    currentPlanStart.current = nextStart
    pendingPlanStart.current = nextStart === persistedPlanStart.current ? null : nextStart
    setWeeks((current) => {
      historyRef.current = [...historyRef.current.slice(-49), current]
      historyStartRef.current = [...historyStartRef.current.slice(-49), currentStart]
      return next
    })
    setStatusText('已重做')
  }, [])

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (suspendedRef.current) return
      const mod = e.metaKey || e.ctrlKey
      if (!mod || isEditableTarget(e.target)) return
      const key = e.key.toLowerCase()
      if (key === 'c') {
        e.preventDefault()
        if (selectedRow) void copySelectedRow()
        else void copySelectedDay()
      } else if (key === 'v') {
        e.preventDefault()
        if (selectedRow || clipboardKindRef.current === 'row') void pasteSelectedRows()
        else void pasteSelectedDay()
      } else if (key === 'z' && e.shiftKey) {
        e.preventDefault()
        redoWeeks()
      } else if (key === 'z') {
        e.preventDefault()
        undoWeeks()
      } else if (key === 'y') {
        e.preventDefault()
        redoWeeks()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [copySelectedDay, copySelectedRow, pasteSelectedDay, pasteSelectedRows, redoWeeks, selectedRow, undoWeeks])

  const blankRow = (): ExerciseRow => ({
    id: `n${Date.now()}-${Math.round(performance.now())}`,
    serverRowId: null, serverSortOrder: null, hasLogs: false, conflictMessage: null,
    exerciseId: null, name: '', ku: false, custom: false, isMain: false,
    aux: false, reps: '—', mode: 'kg', boxes: [], note: '',
  })
  const addRowToDay = (wnum: number, dow: number) => {
    const row = blankRow()
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
    setSelectedRow({ wnum, dow, rowId: row.id })
  }
  const handleAddRow = () => { if (sel) addRowToDay(sel.wnum, sel.dow) }
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
    setSelectedRow(null)
  }
  const handleSetRest = () => {
    patchSelDay((d) => d.rows.some((row) => row.hasLogs)
      ? d
      : { ...d, rest: true, rows: [], releasedSortOrders: [] })
    setSelectedRow(null)
  }
  const handleUnsetRest = () => patchSelDay((d) => ({ ...d, rest: false }))

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
    ? '已发布计划的周期与日期不可修改'
    : '计划内已有学员打卡动作，不能修改周期与日期'

  const handleChangeStartDate = useCallback(async (nextStart: string) => {
    if (!props.onChangeStartDate || calendarLocked || saving || publishing.current) throw new Error('CALENDAR_LOCKED')
    if (!(await saver.current.flush())) throw new Error('SAVE_FAILED')
    setSaving(true)
    setStatusText('正在更新起始日期…')
    try {
      await props.onChangeStartDate(nextStart)
      skipNextAutosave.current = true
      const nextWeeks = relabelWeeksForStartDate(latestWeeks.current, nextStart)
      setWeeks(nextWeeks)
      currentPlanStart.current = nextStart
      persistedPlanStart.current = nextStart
      pendingPlanStart.current = null
      markMirrorCovered(mirrorContent(nextWeeks, nextStart, nextWeeks.length || props.weeksCount))
      setStatusText(`草稿 · 起始日期已更新为 ${nextStart}`)
    } catch (error) {
      setStatusText('起始日期更新失败 · 请重试')
      throw error
    } finally {
      setSaving(false)
    }
  }, [calendarLocked, markMirrorCovered, props.onChangeStartDate, props.weeksCount, saving])

  const handleChangePlanWeeks = useCallback(async (nextCount: number) => {
    if (!props.onChangePlanWeeks || calendarLocked || saving || publishing.current) throw new Error('CALENDAR_LOCKED')
    if (!(await saver.current.flush())) throw new Error('SAVE_FAILED')
    const startDate = currentPlanStart.current
    if (!startDate) throw new Error('PLAN_DATE_MISSING')
    setSaving(true)
    setStatusText('正在更新计划周期…')
    try {
      await props.onChangePlanWeeks(nextCount)
      skipNextAutosave.current = true
      const nextWeeks = resizeWeeksForCount(latestWeeks.current, nextCount, startDate)
      setWeeks(nextWeeks)
      setSel((current) => current && current.wnum > nextCount ? null : current)
      setSelectedRow((current) => current && current.wnum > nextCount ? null : current)
      markMirrorCovered(mirrorContent(nextWeeks, startDate, nextCount))
      setStatusText(`草稿 · 已调整为 ${nextCount} 周`)
    } catch (error) {
      setStatusText('计划周期更新失败 · 请重试')
      throw error
    } finally {
      setSaving(false)
    }
  }, [calendarLocked, markMirrorCovered, props.onChangePlanWeeks, saving])

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
      d.rest ? m : m + d.rows.filter((row) => !row.hasLogs && isContentfulUnbound(row)).length
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
        ? '学员刚完成了训练；新打卡动作已锁定，其余修改仍保留，请再次保存'
        : '学员刚打了卡；相关动作已锁定并还原，其余修改仍保留')
    }
    if (error instanceof LockedRowMutationError) {
      setWeeks(error.weeks)
      unsavedRef.current = true
      return '锁定行不能修改；请刷新后重试'
    }
    return null
  }
  persistRef.current = async () => {
    if (!props.onSave || published) return true
    const auto = saveMode.current === 'auto'
    const importStart = pendingPlanStart.current
    const markPastAsAssumedComplete = importedPastHistory.current
    const verb = auto ? '自动保存中…' : '保存中…'
    setSaving(true); setStatusText(verb)
    try {
      // Big saves (imports) crawl through the backend rate limit for minutes — show real
      // per-day movement so the coach can tell progress from a hang. Tiny saves stay quiet.
      const onProgress = (done: number, total: number) => {
        if (total > 3) setStatusText(`${verb} ${done}/${total} 天`)
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
        ? '历史已推定完成并锁定'
        : (auto ? '草稿 · 已自动保存' : '草稿 · 已保存')
      setStatusText(res.skippedRows > 0 ? `${base} · ${res.skippedRows} 行未绑定被跳过` : base)
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
          PLAN_REQUIRES_NATIVE_EDITOR: ['此计划含逐组差异设置 · 网页端暂不支持保存',
            '这份计划包含逐组不同的次数/备注/组间休息，网页编辑器还无法无损保存，为避免丢失这些设置已拒绝写入。'],
          PLAN_SET_SPEC_INCOMPLETE: ['有已绑定动作组次/强度不完整或无效 · 点「待核对」修正',
            '有已绑定动作的组次/强度没填全或值无效。点顶栏「待核对」查看原因并逐个修正后再保存。'],
        }
        const [status, detail] = explain[error.code]
        setStatusText(status)
        if (!auto) window.alert(detail)
      } else {
        setStatusText(auto ? '自动保存失败 · 改动已保留' : '保存失败 · 重试')
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
    if (published || publishing.current || !props.onSave) { saver.current.cancelAutosave(); return }
    saveMode.current = 'auto'
    saver.current.scheduleAutosave()
  }, [weeks, published]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const s = saver.current
    // Leaving this plan: persist any pending DRAFT edits to it. Never flush a published plan — its
    // writes are explicit-confirm only, never a silent background reconcile.
    return () => { if (!publishedRef.current) void s.flush() }
  }, [])

  // Unbound contentful rows can't be persisted at all (reconcile skips them), so autosave's
  //「已自动保存」can lull the coach while those rows still live only in this tab. The loss becomes
  // real exactly at the exits — closing/reloading the page, or switching plan/student/logout (the
  // editor unmounts and the flush skips them too) — so every exit is guarded. Closing while a
  // save is scheduled/in flight would strand a partial write too, so that blocks as well.
  // Sample mode (no onSave) has nothing persistable to lose and stays quiet.
  const canPersist = useRef(!!props.onSave)
  canPersist.current = !!props.onSave
  const savingRef = useRef(saving)
  savingRef.current = saving
  useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (!canPersist.current) return
      mirrorWriter.current.flush()
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
    if (unbound > 0 && !window.confirm(`有 ${unbound} 行填了动作名或重量、但没绑定到动作库（名字后没有 ✓），它们无法保存，离开这个计划后会丢失。仍要离开吗？`)) return false
    // Published changes require an explicit confirmed update and are never flushed on leave.
    if (publishedRef.current && unsavedRef.current
      && !window.confirm('这份已发布计划还有未更新的修改，离开后会丢失。仍要离开吗？')) return false
    return true
  }
  const confirmLeave = async () => {
    mirrorWriter.current.flush()
    if (!confirmLeaveUnbound()) return false
    if (!canPersist.current || publishedRef.current) return true
    if (!unsavedRef.current && !savingRef.current) return true
    setStatusText('离开前保存中…')
    if (await saver.current.flush()) return true
    window.alert('保存失败，已留在当前计划。请检查网络后重试。')
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
    if (unbound) parts.push(`${unbound} 行未绑定动作库（保存会被跳过）`)
    if (incomplete) parts.push(`${incomplete} 个动作组次/强度没填全（无法保存）`)
    if (invalid) parts.push(`${invalid} 个动作值无效：${reasons.join(' / ')}`)
    return `点击逐个定位：${parts.join('；')}`
  })()
  const jumpToNextIssue = () => {
    const cur = findIssueRows(latestWeeks.current)
    if (cur.length === 0) return
    const issue = cur[issueCursor.current % cur.length]
    issueCursor.current++
    const rowEl = rootRef.current?.querySelector<HTMLElement>(`[data-rowid="${issue.rowId}"]`)
    if (!rowEl) return
    rowEl.scrollIntoView({ block: 'center', inline: 'center' })
    // For prescriptions, filled-but-invalid cells win over empty cells; the set-count
    // box is only the fallback when no editable prescription cell exists yet.
    const input = issue.kind === 'unbound'
      ? rowEl.querySelector<HTMLInputElement>('input:not([inputmode])')
      : rowEl.querySelector<HTMLInputElement>('[data-input-invalid="true"]')
        ?? [...rowEl.querySelectorAll<HTMLInputElement>('[data-guard-field]')].find((field) => field.value === '')
        ?? rowEl.querySelector<HTMLInputElement>('input[inputmode="numeric"]')
    window.setTimeout(() => input?.focus(), 60) // after the scroll settles
  }

  // ---- 跳到周 -------------------------------------------------------------------------------
  const jumpToWeek = (num: number) => {
    const sc = scrollerRef.current
    const band = sc?.querySelector<HTMLElement>(`.weekband[data-wnum="${num}"]`)
    if (!sc || !band) return
    const br = band.getBoundingClientRect(), sr = sc.getBoundingClientRect()
    sc.scrollTop += (br.top - sr.top) - 6
  }

  const handleSave = async () => {
    if (!props.onSave || saving || publishing.current) return
    if (published) {
      // 更新计划: reconciles in place, changing what the student sees right now — confirm first.
      // This is the ONLY way a published plan is persisted: an explicit, confirmed, one-shot write
      // that never enters the autosave queue, so nothing can later replay it (e.g. an unmount flush).
      // Unbound rows are silently skipped by reconcile, so that risk is folded into the same confirm.
      const unboundRows = countUnbound(latestWeeks.current)
      const unboundLine = unboundRows > 0
        ? `\n注意：有 ${unboundRows} 行未绑定动作库（名字后没有 ✓），本次更新会跳过它们、不写入。`
        : ''
      if (!window.confirm(`「${planName}」正在发布给 ${studentName}，保存会立即改变 ta 正在看的计划。${unboundLine}\n确认保存？`)) return
      setSaving(true); setStatusText('更新中…')
      try {
        const savedWeeks = latestWeeks.current
        const res = await props.onSave(savedWeeks, null, false,
          (done, total) => { if (total > 3) setStatusText(`更新中… ${done}/${total} 天`) })
        // Edits typed during the round-trip aren't in what was pushed — keep the guards armed.
        // A published update never writes calendar metadata, so the covered
        // hash must use the server-persisted date/weeks, not local values.
        if (res.skippedRows === 0) {
          markMirrorCovered(mirrorContent(res.weeks, persistedPlanStart.current, props.weeksCount))
        }
        applySuccessfulSave(res, savedWeeks)
        setStatusText(res.skippedRows > 0 ? `已更新 ${studentName} 的计划 · ${res.skippedRows} 行未绑定被跳过` : `已更新 ${studentName} 的计划`)
      }
      catch (error) {
        const scoped = applySaveFailure(error)
        if (scoped) {
          setStatusText(scoped)
        } else if (error instanceof ReconciliationError) {
          const explain: Record<ReconciliationError['code'], [string, string]> = {
            PLAN_REQUIRES_NATIVE_EDITOR: ['此计划含逐组差异设置 · 网页端暂不支持更新',
              '这份计划包含逐组不同的次数/备注/组间休息，网页编辑器还无法无损保存，为避免丢失这些设置已拒绝写入。'],
            PLAN_SET_SPEC_INCOMPLETE: ['有已绑定动作组次/强度不完整或无效 · 点「待核对」修正',
              '有已绑定动作的组次/强度没填全或值无效。点顶栏「待核对」查看原因并逐个修正后再更新。'],
          }
          const [status, detail] = explain[error.code]
          setStatusText(status)
          window.alert(detail)
        } else {
          setStatusText('更新失败 · 重试')
        }
      }
      finally { setSaving(false) }
      return
    }
    const unbound = countUnbound(latestWeeks.current)
    if (unbound > 0 && !window.confirm(`有 ${unbound} 行填了动作名或重量、但没绑定到动作库（名字后没有 ✓），保存时会被跳过、不会写入。建议先在名称下拉里选中动作再保存。仍要保存吗？`)) return
    saveMode.current = 'manual'
    await saver.current.saveNow() // draft: goes through the shared queue
  }

  const handleImport = async (file: File) => {
    if (!props.exerciseIndex || !props.planStartDate) {
      setStatusText('导入失败 · 计划或动作库未就绪')
      return
    }
    // No importing inside the publish round-trip (client `published` is still false there): if
    // the publish wins, the plan flips to published and the imported weeks are stranded — never
    // autosaved, never carried by「更新计划」. Refuse instead of racing; also covers in-flight saves.
    if (publishing.current || saving) {
      setStatusText('正在保存或发布 · 请稍候再导入')
      return
    }
    // Never import over a published plan — saving would silently overwrite what the
    // student is already seeing. Direct the coach to a fresh draft instead.
    if (published) {
      window.alert(`「${planName}」已发布给 ${studentName}，导入会直接覆盖学员正在看的计划。\n请先点右上「新建计划」，在新的草稿里导入。`)
      return
    }
    if (hasGridContent(weeks) && !window.confirm('当前网格已有内容，导入会覆盖当前计划。是否继续？')) return

    setStatusText('导入中…')
    try {
      const importer = await import('./import')
      const sheets = importer.readWorkbook(await file.arrayBuffer())
      const grid = importer.selectSheet(sheets)
      if (!grid) {
        window.alert('没识别出训练周，请确认选的是计划表')
        setStatusText('导入失败 · 未识别计划表')
        return
      }

      const offset = importer.detectDayOffset(grid)
      const parsedWeeks: ParsedWeek[] = importer.weekBlocks(grid, offset).map((block, blockIndex) => ({
        blockIndex,
        dateSerials: block.dateSerials,
        days: Array.from({ length: 7 }, (_, day) => importer.parseDay(grid, block.contentRows, day, offset)),
      }))
      const sourceWeekCount = parsedWeeks.filter(hasParsedWeekContent).length
      const { weeks: nextWeeks, startDate: importStart } = importer.buildWeeks(parsedWeeks, props.exerciseIndex, props.planStartDate)

      if (nextWeeks.length === 0) {
        window.alert('没识别出训练周，请确认选的是计划表')
        setStatusText('导入失败 · 未识别计划表')
        return
      }

      // Past sessions in an imported plan default to assumed-complete (2026-07-09
      // decision): they enter rep-PR / e1RM baselines tagged「导」so a returning
      // lifter's history anchors PR detection, while completion stats ignore them.
      const markPastAsAssumedComplete = isPastISODate(importStart)
      setWeeksWithHistory(nextWeeks)
      currentPlanStart.current = importStart
      pendingPlanStart.current = importStart
      importedPastHistory.current = markPastAsAssumedComplete
      const targetWeek = nextWeeks.find((week) => week.isCurrent) ?? nextWeeks[0]
      const firstTrain = targetWeek?.days.find((day) => !day.rest)
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
        truncation = `原表 ${sourceWeekCount} 周，只导入最新一期共 ${imported} 周`
      } else {
        truncation = `已导入 ${imported} 周 · 未保存`
      }
      const range = importRangeLabel(nextWeeks)
      if (range) truncation += `（${range}）`
      setStatusText(truncation)
      if (dropped > 0) window.alert(truncation)
    } catch (e) {
      const code = e instanceof Error ? e.message : ''
      if (code === 'WORKBOOK_TOO_LARGE' || code === 'SHEET_TOO_LARGE') {
        window.alert('导入失败：文件或工作表过大。请删除无关格式/工作表后重试（最大文件 10 MB）。')
        setStatusText('导入失败 · 文件过大')
      } else {
        window.alert('导入失败，请确认文件是 .xlsx 计划表')
        setStatusText('导入失败 · 重试')
      }
    }
  }

  const handlePublish = async () => {
    // 发布后不可撤回，且当前编辑器不就地覆盖已发布树，避免破坏历史 set log。
    // saving 时也不发布:避免在后台 reconcile 半途翻页发布,发布按钮已 disabled,这里再兜底。
    if (published || publishing.current || saving) return
    // Pre-flight: rows the publish would lose or that the backend will refuse. Zero-set bound
    // rows make the server reject with PLAN_PUBLISH_INCOMPLETE — block up front with a pointer
    // to the ⚠ chip instead of letting the coach discover it as an opaque failure.
    const noSets = findIssueRows(latestWeeks.current).filter((i) => i.kind === 'noSets').length
    if (noSets > 0) {
      window.alert(`还不能发布：有 ${noSets} 个动作的组次/强度没填全或值无效，后端会拒绝发布。\n点顶栏「⚠ 待核对」查看原因并逐个修正，或删掉这些行（行尾 ✕）。`)
      return
    }
    // Publishing flushes the draft via saveNow below, which skips unbound rows just like a manual
    // save — but here the loss lands in the plan the student is about to see. Warn before latching.
    const unbound = countUnbound(latestWeeks.current)
    if (unbound > 0 && !window.confirm(`有 ${unbound} 行填了动作名或重量、但没绑定到动作库（名字后没有 ✓），发布时会被跳过、学员看不到这些行。\n点「取消」后可用顶栏「⚠ 待核对」逐个定位处理。仍要发布吗？`)) return
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
        window.alert('发布中断：计划保存失败（改动已保留在本页）。请检查网络后重新点发布。')
        setStatusText('发布失败 · 计划未存,请重试')
        saver.current.scheduleAutosave() // dirty is still set — re-arm so the save retries itself
        return
      }
      setStatusText('发布中…')
      if (onPublish) await onPublish()
      setPublished(true); becamePublished = true
      // Edits typed during the round-trip aren't in the published plan — surface them, never drop silently.
      setStatusText(latestWeeks.current !== snapshot
        ? `已发布给 ${studentName} · 有未更新修改`
        : `已发布给 ${studentName}`)
    } catch (e) {
      // The status line gets repainted by later saves — a publish failure must explain itself
      // in a dialog the coach actually reads, in coach language, not a machine code.
      const code = e instanceof ApiException ? e.code : ''
      const detail = e instanceof ApiException ? e.details : {}
      if (code === 'PLAN_PUBLISH_INCOMPLETE') {
        const n = Number(detail.empty_exercise_count ?? 0) || '若干'
        window.alert(`发布被拒：有 ${n} 个动作没有任何组数据，学员端无法显示。\n点顶栏「⚠ 待核对」定位这些行，补上组数或删除后再发布。`)
      } else if (code === 'PLAN_DAYS_EXCEED_WEEKS') {
        window.alert(`发布被拒：有训练日排在计划周数（${weeksCount} 周）之外，请删除多余的周或调整计划周数。`)
      } else if (code === 'EVALUATION_IN_PROGRESS') {
        window.alert('发布被拒：该学员的评估期还在进行中，评估期内只能发布 1 周适应计划。')
      } else if (code === 'PLAN_NOT_DRAFT') {
        window.alert('这份计划已经发布过了。刷新页面获取最新状态。')
      } else {
        window.alert(`发布失败${code ? `（${code}）` : ''}，请稍后重试。`)
      }
      setStatusText('发布失败 · 重试')
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
    return d ? `${d.dowLabel} ${d.dateLabel}（第 ${sel.wnum} 周）` : ''
  })()
  const selIsRest = (() => {
    if (!sel) return false
    const wk = weeks.find((w) => w.num === sel.wnum)
    return wk?.days.find((x) => x.dow === sel.dow)?.rest ?? false
  })()
  const selHasLockedRows = (() => {
    if (!sel) return false
    const wk = weeks.find((w) => w.num === sel.wnum)
    return wk?.days.find((x) => x.dow === sel.dow)?.rows.some((row) => row.hasLogs) ?? false
  })()
  const copyTargetHasLockedRows = (() => {
    if (!sel) return false
    return weeks.find((week) => week.num === sel.wnum)?.days
      .some((day) => day.rows.some((row) => row.hasLogs)) ?? false
  })()
  const selectedRowForBar = selectedRowValue()
  const selectedRowLabel = selectedRowForBar ? `当前行 · ${selectedRowForBar.name.trim() || '未命名动作'}` : ''
  const selectedDayValue = sel ? weeks.find((week) => week.num === sel.wnum)?.days.find((day) => day.dow === sel.dow) ?? null : null
  const selectedDayKey = sel ? `${sel.wnum}:${sel.dow}` : ''
  const recallContext = () => setDismissedContextDays((prev) => { const next = new Set(prev); next.delete(selectedDayKey); return next })
  const moveStateForDay = (wnum: number, dow: number): 'source' | 'target' | 'invalid' | undefined => {
    if (!dayMoveVisual) return undefined
    if (dayMoveVisual.fromWnum === wnum && dayMoveVisual.fromDow === dow) return 'source'
    if (dayMoveVisual.targetWnum === wnum && dayMoveVisual.targetDow === dow) {
      return dayMoveVisual.targetValid ? 'target' : 'invalid'
    }
    return undefined
  }

  return (
    <div ref={rootRef} style={{
      position: 'relative', height: '100vh', display: 'flex', flexDirection: 'column',
      overflow: 'hidden', background: 'var(--bg)', color: 'var(--fg-primary)',
      fontFamily: 'var(--font-sans)', fontSize: 13, WebkitFontSmoothing: 'antialiased',
    }}>
      <TopBar
        studentName={studentName} planName={planName} published={published} statusText={statusText} onPublish={handlePublish}
        students={props.students} currentStudentId={props.currentStudentId} onSwitchStudent={guardLeaveId(props.onSwitchStudent)}
        plans={props.plans} currentPlanId={props.currentPlanId} onSwitchPlan={guardLeaveId(props.onSwitchPlan)}
        onNewPlan={guardLeave(props.onNewPlan)} onLogout={guardLeave(props.onLogout)}
        currentPlanStatus={published ? 'published' : props.planStatus ?? 'draft'}
        onDeleteCurrentDraft={guardLeave(props.onDeleteCurrentDraft)}
        onMarkComplete={props.onMarkComplete}
        onBackfillHistory={props.onBackfillHistory}
        onRenamePlan={props.onRename ? () => {
          const name = window.prompt('计划名称', planName)?.trim()
          if (name && name !== planName) void props.onRename!(name)
        } : undefined}
        onRenameStudent={props.onRenameStudent ? () => {
          const name = window.prompt('学员姓名', studentName)?.trim()
          if (name && name !== studentName) {
            void Promise.resolve(props.onRenameStudent!(name)).catch(() => {
              window.alert('修改学员姓名失败，请稍后重试')
            })
          }
        } : undefined}
        onSave={props.onSave ? handleSave : undefined} saving={saving}
        onImport={props.exerciseIndex && props.planStartDate ? handleImport : undefined}
        planStartDate={props.planStartDate}
        calendarLocked={calendarLocked || !props.onChangeStartDate}
        calendarLockedHint={calendarLocked ? calendarLockedHint : '当前模式不可修改计划日期'}
        onChangeStartDate={props.planStartDate ? (props.onChangeStartDate ? handleChangeStartDate : async () => {}) : undefined}
        onNewExercise={props.onCreateExercise ? () => openCreateExercise() : undefined}
        issueCount={issues.length} issueHint={issueHint} onJumpIssue={jumpToNextIssue}
      />
      {recoveryMirror && (
        <DraftMirrorBanner
          savedAt={recoveryMirror.savedAt}
          onRestore={restoreDraftMirror}
          onDiscard={discardDraftMirror}
        />
      )}
      <Toolbar weeksCount={weeks.length || weeksCount} calendarLocked={calendarLocked} calendarLockedHint={calendarLockedHint}
        onChangeWeeks={props.onChangePlanWeeks ? handleChangePlanWeeks : undefined}
        removalSummary={(nextCount) => weeks.filter((week) => week.num > nextCount).reduce((summary, week) => {
          for (const day of week.days) {
            if (day.rest || day.rows.length === 0) continue
            summary.days++
            summary.exercises += day.rows.length
          }
          return summary
        }, { days: 0, exercises: 0 })}
        curWeekLabel={curWeekLabel} zoomLabel={`${Math.round(zoom)}%`}
        volumePhase={volumePhase} onVolumePhaseChange={changeVolumePhase}
        weekNums={weeks.map((w) => w.num)} onJumpWeek={jumpToWeek} />
      <ContextBar
        visible={!!sel}
        dayLabel={selDayLabel}
        isRest={selIsRest}
        canCopyPrev={!!sel && sel.wnum > 1 && !copyTargetHasLockedRows}
        copyDisabledHint={copyTargetHasLockedRows ? '目标周含学员已打卡动作,不能用上周覆盖' : undefined}
        hasLockedRows={selHasLockedRows}
        copyLabel={copyDone ? '✓ 已复制上周' : COPY_LABEL}
        copyDone={copyDone}
        selectedRowLabel={selectedRowLabel}
        rowCopyDone={rowCopyDone}
        hasRowClipboard={hasRowClipboard}
        onCopyPrev={handleCopyPrev}
        onCopyRow={copySelectedRow}
        onPasteRow={pasteSelectedRows}
        onAddRow={handleAddRow}
        onSetRest={handleSetRest}
        onUnsetRest={handleUnsetRest}
        onClearDay={handleClearDay}
        onClose={() => { setSel(null); setSelectedRow(null); setPop((p) => ({ ...p, visible: false })) }}
      />

      <div className="scroller" ref={scrollerRef} style={{ flex: 1, overflow: 'auto', position: 'relative', background: 'var(--bg)' }}>
        <div style={{ textAlign: 'center', color: 'var(--fg-tertiary)', fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '.1em', padding: 7, textTransform: 'uppercase' }}>▲ 计划开始 · W01</div>
        <div ref={sizerRef}>
          <div ref={zoomwrapRef} style={{ transformOrigin: '0 0', width: 'max-content' }}>
            <div ref={weeksRef}>
              {weeks.map((wk, weekIndex) => (
                <div key={wk.num} className="weekband" data-wnum={wk.num} style={{ borderTop: '2px solid var(--border-strong)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '7px 12px', background: 'var(--surface-1)', borderBottom: '1px solid var(--border)' }}>
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: '.12em', color: 'var(--brand-red)', fontWeight: 700 }}>W{wk.num2}</span>
                    <span style={{ fontWeight: 700, fontSize: 13, color: '#fff' }}>第 {wk.num} 周</span>
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--fg-tertiary)', letterSpacing: '.02em' }}>{wk.range}</span>
                    {wk.isCurrent && (
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '.08em', color: 'var(--brand-red)', textTransform: 'uppercase' }}>
                        <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--brand-red)', animation: 'pulse 1.6s infinite' }} />当前周
                      </span>
                    )}
                    <span style={{ flex: 1 }} />
                    <WeekCapacitySummary weekNumber={wk.num} phase={volumePhase === 'off' ? null : volumePhase} {...weeklySummaries[weekIndex]} />
                  </div>
                  <div className="weekrow" data-weekrow="" style={{ display: 'flex', alignItems: 'stretch' }}>
                    {wk.days.map((day) => (
                      <DayColumn
                        key={day.dow}
                        day={day}
                        colW={colW[day.dow]}
                        selected={sel?.wnum === wk.num && sel?.dow === day.dow}
                        selectedRowId={selectedRow?.wnum === wk.num && selectedRow.dow === day.dow ? selectedRow.rowId : null}
                        rowTier={rowTier}
                        onSelect={() => handleDayClick(wk.num, day.dow)}
                        onRecallContext={recallContext}
                        onSelectRow={(rowId) => handleSelectRow(wk.num, day.dow, rowId)}
                        dayMoveState={moveStateForDay(wk.num, day.dow)}
                        dayMoveDisabledHint={dayMoveDisabledReason(day, statusCalendarLocked)}
                        onDayMoveStart={(e) => handleDayMoveStart(wk.num, day, e)}
                        onResizeStart={(col, e) => handleResizeStart(day.dow, col, e)}
                        onNameFocus={(rowId, name, el) => handleNameFocus(wk.num, day.dow, rowId, name, el)}
                        onNameChange={(rowId, value, el) => handleNameChange(wk.num, day.dow, rowId, value, el)}
                        onNameBlur={handleNameBlur}
                        onAddRow={() => addRowToDay(wk.num, day.dow)}
                        onEditRow={(rowId, updater) => editRow(wk.num, day.dow, rowId, updater)}
                        onReorderRow={(dragRowId, targetRowId, position) => reorderRow(wk.num, day.dow, dragRowId, targetRowId, position)}
                        onDeleteRow={(rowId) => deleteRow(wk.num, day.dow, rowId)}
                      />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
        <div style={{ textAlign: 'center', color: 'var(--fg-tertiary)', fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '.1em', padding: '10px 7px 20px', textTransform: 'uppercase' }}>▼ 共 {weeks.length} 周</div>
      </div>

      {selectedDayValue && props.studentId && !dismissedContextDays.has(selectedDayKey) && (
        <WritingContextPanel studentId={props.studentId} studentName={studentName} profile={props.onboardingProfile}
          day={selectedDayValue} row={selectedRowForBar}
          onClose={() => setDismissedContextDays((prev) => new Set(prev).add(selectedDayKey))} />
      )}

      <ExercisePopover
        visible={pop.visible} x={pop.x} y={pop.y}
        index={props.exerciseIndex ?? null} query={pop.query}
        onPick={onPickHit} onCreateCustom={props.onCreateExercise ? onCreateCustom : undefined}
      />
      <CustomExerciseDialog
        open={createExercise.open}
        initialName={createExercise.initialName}
        saving={creatingExercise}
        error={createExerciseError}
        onClose={closeCreateExercise}
        onSubmit={submitCreateExercise}
      />
    </div>
  )
}
