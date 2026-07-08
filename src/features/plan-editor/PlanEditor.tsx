import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { ColKey, ColWidths, Week, DayCol, ExerciseRow } from './types'
import { COL_DEFAULTS, COL_MIN, isContentfulUnbound, isBoundNoSets } from './types'
import { ApiException } from '../../api/client'
import { TopBar } from './components/TopBar'
import { Toolbar } from './components/Toolbar'
import { ContextBar } from './components/ContextBar'
import { DayColumn } from './components/DayColumn'
import { ExercisePopover } from './components/ExercisePopover'
import { CustomExerciseDialog } from './components/CustomExerciseDialog'
import type { ExerciseIndex, ExerciseHit } from './exerciseIndex'
import type { CreateCustomExerciseInput } from '../../api/exercises'
import type { ParsedWeek } from './import'
import type { SaveResult } from './reconcile'
import { createSaveController } from './autosave'

interface Sel { wnum: number; dow: number }
interface PopState { visible: boolean; x: number; y: number; wnum: number; dow: number; rowId: string; query: string }
interface RowTarget { wnum: number; dow: number; rowId: string }
interface CreateExerciseState { open: boolean; initialName: string; bindTarget: RowTarget | null }

const COPY_LABEL = '⎘ 复制上周计划到本周'

interface Switcher { id: string; label: string; tag?: string }

export interface PlanEditorProps {
  initialWeeks: Week[]
  weeksCount: number
  studentName: string
  planName: string
  initialPublished?: boolean
  /** Real publish call; when omitted the button just toggles locally (sample mode). */
  onPublish?: () => Promise<void>
  /** Save current edits back to the backend; resolves with how many contentful rows were skipped. */
  onSave?: (
    weeks: Week[],
    importStart?: string | null,
    onProgress?: (done: number, total: number) => void,
  ) => Promise<SaveResult>
  /** Rename the current plan (backend PATCH); parent also refreshes its plan list. */
  onRename?: (name: string) => Promise<void> | void
  /** Exercise catalog + alias index for name-cell binding. */
  exerciseIndex?: ExerciseIndex | null
  /** Create a custom exercise and return its id+name (adds to the index). */
  onCreateExercise?: (input: CreateCustomExerciseInput) => Promise<{ id: string; name: string }>
  // top-bar switchers (connected mode)
  students?: Switcher[]
  currentStudentId?: string
  onSwitchStudent?: (id: string) => void
  plans?: Switcher[]
  currentPlanId?: string
  onSwitchPlan?: (id: string) => void
  onNewPlan?: () => void
  onLogout?: () => void
  /** Current plan start date; enables xlsx import date remapping. */
  planStartDate?: string
}

function hasGridContent(weeks: Week[]): boolean {
  return weeks.some((week) => week.days.some((day) => day.rows.length > 0))
}

function hasParsedWeekContent(week: ParsedWeek): boolean {
  return week.days.some((day) => day.exercises.length > 0)
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

export function PlanEditor(props: PlanEditorProps) {
  const { initialWeeks, weeksCount, studentName, planName, initialPublished = false, onPublish } = props
  const [weeks, setWeeks] = useState<Week[]>(initialWeeks)
  // Plan start date derived from an import, threaded to the next save so the backend plan's
  // start_date/plan_weeks are aligned (imported dates + week count survive reload). A ref, not
  // state: the save queue's drain loop reads it between renders, and nothing renders from it.
  const importedStart = useRef<string | null>(null)
  const [colW, setColW] = useState<ColWidths[]>(() => Array.from({ length: 7 }, () => ({ ...COL_DEFAULTS })))
  const [sel, setSel] = useState<Sel | null>(null)
  const [zoom, setZoom] = useState(100)
  // Authoritative published state, initialized from the backend plan status. Monotonic:
  // set true on a real publish and never cleared — there is no backend unpublish, so 发布后不可撤回.
  // Once the student can see the plan, editing updates it in place (handleSave, the「更新计划」path)
  // instead of pretending to retract it — a fake local retract only misleads the coach.
  const [published, setPublished] = useState(initialPublished)
  const [statusText, setStatusText] = useState(initialPublished ? `已发布给 ${studentName}` : '草稿 · 已存')
  const [copyDone, setCopyDone] = useState(false)
  const [curWeekLabel, setCurWeekLabel] = useState('—')
  const [pop, setPop] = useState<PopState>({ visible: false, x: 0, y: 0, wnum: 0, dow: 0, rowId: '', query: '' })
  const [createExercise, setCreateExercise] = useState<CreateExerciseState>({ open: false, initialName: '', bindTarget: null })
  const [creatingExercise, setCreatingExercise] = useState(false)
  const [createExerciseError, setCreateExerciseError] = useState('')

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
    setWeeks((prev) => prev.map((wk) => wk.num !== target.wnum ? wk : {
      ...wk,
      days: wk.days.map((d) => d.dow !== target.dow ? d : {
        ...d, rows: d.rows.map((r) => r.id === target.rowId ? { ...r, exerciseId, name, ku: !custom, custom } : r),
      }),
    }))
  }
  const editRow = (wnum: number, dow: number, rowId: string, updater: (r: ExerciseRow) => ExerciseRow) => {
    setWeeks((prev) => prev.map((wk) => wk.num !== wnum ? wk : {
      ...wk,
      days: wk.days.map((d) => d.dow !== dow ? d : { ...d, rows: d.rows.map((r) => r.id === rowId ? updater(r) : r) }),
    }))
  }
  const deleteRow = (wnum: number, dow: number, rowId: string) => {
    setWeeks((prev) => prev.map((wk) => wk.num !== wnum ? wk : {
      ...wk,
      days: wk.days.map((d) => d.dow !== dow ? d : { ...d, rows: d.rows.filter((r) => r.id !== rowId) }),
    }))
    setPop((p) => (p.rowId === rowId ? { ...p, visible: false } : p))
  }
  const moveRow = (wnum: number, dow: number, rowId: string, dir: -1 | 1) => {
    setWeeks((prev) => prev.map((wk) => wk.num !== wnum ? wk : {
      ...wk,
      days: wk.days.map((d) => {
        if (d.dow !== dow) return d
        const index = d.rows.findIndex((r) => r.id === rowId)
        const target = index + dir
        if (index < 0 || target < 0 || target >= d.rows.length) return d
        const rows = [...d.rows]
        const [row] = rows.splice(index, 1)
        rows.splice(target, 0, row)
        return { ...d, rows }
      }),
    }))
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
    setWeeks((prev) => prev.map((wk) => wk.num !== sel.wnum ? wk : {
      ...wk, days: wk.days.map((d) => d.dow !== sel.dow ? d : updater(d)),
    }))
  }

  const handleCopyPrev = () => {
    if (!sel || sel.wnum <= 1) return
    setWeeks((prev) => {
      const srcWeek = prev.find((w) => w.num === sel.wnum - 1)
      const srcDay = srcWeek?.days.find((d) => d.dow === sel.dow)
      if (!srcDay || srcDay.rest) return prev
      let n = Date.now()
      const cloned = srcDay.rows.map((r) => ({ ...r, id: `c${n++}`, boxes: r.boxes.map((b) => ({ ...b })) }))
      return prev.map((wk) => wk.num !== sel.wnum ? wk : {
        ...wk,
        days: wk.days.map((d) => d.dow !== sel.dow ? d : { ...d, rest: false, rows: cloned }),
      })
    })
    setCopyDone(true)
    window.setTimeout(() => setCopyDone(false), 1300)
  }

  const blankRow = (): ExerciseRow => ({ id: `n${Date.now()}-${Math.round(performance.now())}`, exerciseId: null, name: '', ku: false, custom: false, isMain: false, aux: false, reps: '—', mode: 'kg', boxes: [], note: '' })
  const addRowToDay = (wnum: number, dow: number) => {
    setWeeks((prev) => prev.map((wk) => wk.num !== wnum ? wk : {
      ...wk, days: wk.days.map((d) => d.dow !== dow ? d : { ...d, rest: false, rows: [...d.rows, blankRow()] }),
    }))
  }
  const handleAddRow = () => { if (sel) addRowToDay(sel.wnum, sel.dow) }
  const handleClearDay = () => patchSelDay((d) => ({ ...d, rows: [] }))
  const handleSetRest = () => patchSelDay((d) => ({ ...d, rest: true, rows: [] }))
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
  const latestWeeks = useRef(weeks)
  latestWeeks.current = weeks
  const saveMode = useRef<'auto' | 'manual'>('auto')
  const publishing = useRef(false) // latched across a publish round-trip so nothing autosaves mid-publish
  const publishedRef = useRef(published) // fresh published for the unmount cleanup (which closes over [] deps)
  publishedRef.current = published

  // Rows the coach still has to deal with, in grid order:
  //  - unbound: has a name or filled sets but no catalog binding — save reconciliation drops
  //    these (and delete+recreate can erase them from a changed day), so they are a data-loss
  //    risk. The explicit save/publish paths warn before that loss; autosave can't block on a
  //    confirm, so there it's only surfaced in the status line via skippedRows.
  //  - noSets: bound but without a single filled set — persists as a zero-set exercise, which
  //    the backend's publish completeness gate rejects (PLAN_PUBLISH_INCOMPLETE).
  // The ⚠ chip in the top bar counts both and jumps the coach to the next one.
  interface IssueRow { rowId: string; kind: 'unbound' | 'noSets' }
  const findIssueRows = (wks: Week[]): IssueRow[] => {
    const issues: IssueRow[] = []
    for (const wk of wks) for (const d of wk.days) {
      if (d.rest) continue
      for (const r of d.rows) {
        if (isContentfulUnbound(r)) issues.push({ rowId: r.id, kind: 'unbound' })
        else if (isBoundNoSets(r)) issues.push({ rowId: r.id, kind: 'noSets' })
      }
    }
    return issues
  }
  const countUnbound = (wks: Week[]) => wks.reduce(
    (n, wk) => n + wk.days.reduce((m, d) => (d.rest ? m : m + d.rows.filter(isContentfulUnbound).length), 0),
    0,
  )

  // The save queue is DRAFT-ONLY. Reassigned every render so it always persists the latest weeks.
  // A published plan is refused here (resolves "done" without writing) — it is persisted solely by
  // handleSave's explicit confirmed path, so no queued/latched/flushed write can ever silently
  // overwrite a plan the student is watching.
  const persistRef = useRef<() => Promise<boolean>>(async () => true)
  persistRef.current = async () => {
    if (!props.onSave || published) return true
    const auto = saveMode.current === 'auto'
    const importStart = importedStart.current
    const verb = auto ? '自动保存中…' : '保存中…'
    setSaving(true); setStatusText(verb)
    try {
      // Big saves (imports) crawl through the backend rate limit for minutes — show real
      // per-day movement so the coach can tell progress from a hang. Tiny saves stay quiet.
      const onProgress = (done: number, total: number) => {
        if (total > 3) setStatusText(`${verb} ${done}/${total} 天`)
      }
      const savedWeeks = latestWeeks.current
      const res = await props.onSave(savedWeeks, importStart, onProgress)
      // Clear only the token this save consumed: an import landing mid-flight writes a fresh
      // token, and the drain loop's next pass must still deliver it via reconcileImportedPlan —
      // clearing unconditionally would strand the imported start_date/plan_weeks client-side.
      if (importedStart.current === importStart) importedStart.current = null
      // Same generation rule for the unsaved flag: edits typed while this save was in flight
      // are NOT in what we just persisted, so they must keep the leave guards armed.
      if (latestWeeks.current === savedWeeks) unsavedRef.current = false
      const base = auto ? '草稿 · 已自动保存' : '草稿 · 已保存'
      setStatusText(res.skippedRows > 0 ? `${base} · ${res.skippedRows} 行未绑定被跳过` : base)
      return true
    }
    catch { setStatusText(auto ? '自动保存失败 · 改动已保留' : '保存失败 · 重试'); return false }
    finally { setSaving(false) }
  }
  const saver = useRef(createSaveController({ delay: 1500, persist: () => persistRef.current() }))

  // Content edited but not yet confirmed persisted — drives the leave guards below.
  const unsavedRef = useRef(false)
  const prevWeeksRef = useRef(weeks)
  const skipFirstAutosave = useRef(true)
  useEffect(() => {
    const weeksChanged = prevWeeksRef.current !== weeks
    prevWeeksRef.current = weeks
    if (skipFirstAutosave.current) { skipFirstAutosave.current = false; return } // ignore the initial load
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
    // A published plan never autosaves and its unmount flush is skipped — edits not yet
    // pushed via「更新计划」die with the tab/switch, so warn about those too.
    if (publishedRef.current && unsavedRef.current
      && !window.confirm('这份已发布计划有修改还没点「更新计划」推送，离开后这些修改会丢失。仍要离开吗？')) return false
    return true
  }
  const guardLeave = (fn?: () => void) => fn ? () => { if (confirmLeaveUnbound()) fn() } : undefined
  const guardLeaveId = (fn?: (id: string) => void) => fn ? (id: string) => { if (confirmLeaveUnbound()) fn(id) } : undefined

  // ---- ⚠ 待核对 chip: cycle through problem rows (unbound / zero-set) -----------------------
  const issueCursor = useRef(0)
  const issues = findIssueRows(weeks)
  const issueHint = (() => {
    const unbound = issues.filter((i) => i.kind === 'unbound').length
    const noSets = issues.length - unbound
    const parts = []
    if (unbound) parts.push(`${unbound} 行未绑定动作库（保存会被跳过）`)
    if (noSets) parts.push(`${noSets} 个动作组数/强度没填全（无法发布）`)
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
    // Unbound → the name cell (opens the binding search). Zero-set → the first empty
    // strength box if the count is already set, else 组数 — a set only counts once its
    // strength value is filled, so point the coach at the actual missing field.
    const input = issue.kind === 'unbound'
      ? rowEl.querySelector<HTMLInputElement>('input:not([inputmode])')
      : [...rowEl.querySelectorAll<HTMLInputElement>('input[inputmode="decimal"]')].find((b) => b.value === '')
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
    const unbound = countUnbound(latestWeeks.current)
    if (unbound > 0 && !window.confirm(`有 ${unbound} 行填了动作名或重量、但没绑定到动作库（名字后没有 ✓），保存时会被跳过、不会写入。建议先在名称下拉里选中动作再保存。仍要保存吗？`)) return
    if (published) {
      // 更新计划: reconciles in place, changing what the student sees right now — confirm first.
      // This is the ONLY way a published plan is persisted: an explicit, confirmed, one-shot write
      // that never enters the autosave queue, so nothing can later replay it (e.g. an unmount flush).
      if (!window.confirm(`「${planName}」正在发布给 ${studentName}，保存会立即改变 ta 正在看的计划。确认保存？`)) return
      setSaving(true); setStatusText('更新中…')
      try {
        const savedWeeks = latestWeeks.current
        const res = await props.onSave(savedWeeks, null,
          (done, total) => { if (total > 3) setStatusText(`更新中… ${done}/${total} 天`) })
        // Edits typed during the round-trip aren't in what was pushed — keep the guards armed.
        if (latestWeeks.current === savedWeeks) unsavedRef.current = false
        setStatusText(res.skippedRows > 0 ? `已更新 ${studentName} 的计划 · ${res.skippedRows} 行未绑定被跳过` : `已更新 ${studentName} 的计划`)
      }
      catch { setStatusText('更新失败 · 重试') }
      finally { setSaving(false) }
      return
    }
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

      setWeeks(nextWeeks)
      importedStart.current = importStart
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
    } catch {
      window.alert('导入失败，请确认文件是 .xlsx 计划表')
      setStatusText('导入失败 · 重试')
    }
  }

  const handlePublish = async () => {
    // 发布后不可撤回:后端没有 unpublish 接口,发布后不再本地假撤回(那只会让教练以为学员看不到了)。
    // 想改计划走「更新计划」(handleSave)。按钮在已发布后已禁用,这里再兜底一次。
    // saving 时也不发布:避免在后台 reconcile 半途翻页发布,发布按钮已 disabled,这里再兜底。
    if (published || publishing.current || saving) return
    // Pre-flight: rows the publish would lose or that the backend will refuse. Zero-set bound
    // rows make the server reject with PLAN_PUBLISH_INCOMPLETE — block up front with a pointer
    // to the ⚠ chip instead of letting the coach discover it as an opaque failure.
    const noSets = findIssueRows(latestWeeks.current).filter((i) => i.kind === 'noSets').length
    if (noSets > 0) {
      window.alert(`还不能发布：有 ${noSets} 个动作的组数/强度没填全，学员端无法显示，后端会拒绝发布。\n点顶栏「⚠ 待核对」逐个定位，补全组数和强度、或删掉这些行（行尾 ✕）。`)
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
        ? `已发布给 ${studentName} · 有改动未保存,点「更新计划」推送`
        : `已发布给 ${studentName} · 刚刚`)
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
        onRenamePlan={props.onRename ? () => {
          const name = window.prompt('计划名称', planName)?.trim()
          if (name && name !== planName) void props.onRename!(name)
        } : undefined}
        onSave={props.onSave ? handleSave : undefined} saving={saving}
        onImport={props.exerciseIndex && props.planStartDate ? handleImport : undefined}
        onNewExercise={props.onCreateExercise ? () => openCreateExercise() : undefined}
        issueCount={issues.length} issueHint={issueHint} onJumpIssue={jumpToNextIssue}
      />
      <Toolbar weeksCount={weeksCount} curWeekLabel={curWeekLabel} zoomLabel={`${Math.round(zoom)}%`}
        weekNums={weeks.map((w) => w.num)} onJumpWeek={jumpToWeek} />
      <ContextBar
        visible={!!sel}
        dayLabel={selDayLabel}
        isRest={selIsRest}
        canCopyPrev={!!sel && sel.wnum > 1}
        copyLabel={copyDone ? '✓ 已复制上周' : COPY_LABEL}
        copyDone={copyDone}
        onCopyPrev={handleCopyPrev}
        onAddRow={handleAddRow}
        onSetRest={handleSetRest}
        onUnsetRest={handleUnsetRest}
        onClearDay={handleClearDay}
        onClose={() => { setSel(null); setPop((p) => ({ ...p, visible: false })) }}
      />

      <div className="scroller" ref={scrollerRef} style={{ flex: 1, overflow: 'auto', position: 'relative', background: 'var(--bg)' }}>
        <div style={{ textAlign: 'center', color: 'var(--fg-tertiary)', fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '.1em', padding: 7, textTransform: 'uppercase' }}>▲ 计划开始 · W01</div>
        <div ref={sizerRef}>
          <div ref={zoomwrapRef} style={{ transformOrigin: '0 0', width: 'max-content' }}>
            <div ref={weeksRef}>
              {weeks.map((wk) => (
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
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--fg-tertiary)', letterSpacing: '.03em' }}>{wk.vol}</span>
                  </div>
                  <div className="weekrow" data-weekrow="" style={{ display: 'flex', alignItems: 'stretch' }}>
                    {wk.days.map((day) => (
                      <DayColumn
                        key={day.dow}
                        day={day}
                        colW={colW[day.dow]}
                        selected={sel?.wnum === wk.num && sel?.dow === day.dow}
                        onSelect={() => handleSelect(wk.num, day.dow)}
                        onResizeStart={(col, e) => handleResizeStart(day.dow, col, e)}
                        onNameFocus={(rowId, name, el) => handleNameFocus(wk.num, day.dow, rowId, name, el)}
                        onNameChange={(rowId, value, el) => handleNameChange(wk.num, day.dow, rowId, value, el)}
                        onNameBlur={handleNameBlur}
                        onAddRow={() => addRowToDay(wk.num, day.dow)}
                        onEditRow={(rowId, updater) => editRow(wk.num, day.dow, rowId, updater)}
                        onMoveRow={(rowId, dir) => moveRow(wk.num, day.dow, rowId, dir)}
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
