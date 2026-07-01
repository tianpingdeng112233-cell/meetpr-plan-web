import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { ColKey, ColWidths, Week, DayCol, ExerciseRow } from './types'
import { COL_DEFAULTS, COL_MIN } from './types'
import { TopBar } from './components/TopBar'
import { Toolbar } from './components/Toolbar'
import { ContextBar } from './components/ContextBar'
import { DayColumn } from './components/DayColumn'
import { ExercisePopover } from './components/ExercisePopover'
import type { ExerciseIndex, ExerciseHit } from './exerciseIndex'

interface Sel { wnum: number; dow: number }
interface PopState { visible: boolean; x: number; y: number; wnum: number; dow: number; rowId: string; query: string }

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
  /** Save current edits back to the backend. */
  onSave?: (weeks: Week[]) => Promise<void>
  /** Exercise catalog + alias index for name-cell binding. */
  exerciseIndex?: ExerciseIndex | null
  /** Create a custom exercise and return its id+name (adds to the index). */
  onCreateExercise?: (name: string) => Promise<{ id: string; name: string }>
  // top-bar switchers (connected mode)
  students?: Switcher[]
  currentStudentId?: string
  onSwitchStudent?: (id: string) => void
  plans?: Switcher[]
  currentPlanId?: string
  onSwitchPlan?: (id: string) => void
  onNewPlan?: () => void
  onLogout?: () => void
}

export function PlanEditor(props: PlanEditorProps) {
  const { initialWeeks, weeksCount, studentName, planName, initialPublished = false, onPublish } = props
  const [weeks, setWeeks] = useState<Week[]>(initialWeeks)
  const [colW, setColW] = useState<ColWidths[]>(() => Array.from({ length: 7 }, () => ({ ...COL_DEFAULTS })))
  const [sel, setSel] = useState<Sel | null>(null)
  const [zoom, setZoom] = useState(100)
  const [published, setPublished] = useState(initialPublished)
  // Authoritative "the student is seeing this plan right now" flag: set once the plan is
  // published to the backend, and never cleared here — there is no backend unpublish, and the
  // local-only 撤回 must not be able to downgrade it (that would reopen silent live overwrites).
  const [serverPublished, setServerPublished] = useState(initialPublished)
  const [statusText, setStatusText] = useState(initialPublished ? `已发布给 ${studentName}` : '草稿 · 已存')
  const [copyDone, setCopyDone] = useState(false)
  const [curWeekLabel, setCurWeekLabel] = useState('W03 · 第 3 周')
  const [pop, setPop] = useState<PopState>({ visible: false, x: 0, y: 0, wnum: 0, dow: 0, rowId: '', query: '' })

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
    if (!sc) return
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
    if (cur) setCurWeekLabel(`W${String(cur).padStart(2, '0')} · 第 ${cur} 周`)
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

  const onPickHit = (hit: ExerciseHit) => {
    bindRowAt({ wnum: pop.wnum, dow: pop.dow, rowId: pop.rowId }, hit.id, hit.name, false)
    setPop((p) => ({ ...p, visible: false }))
  }
  const onCreateCustom = async (name: string) => {
    const target = { wnum: pop.wnum, dow: pop.dow, rowId: pop.rowId }
    setPop((p) => ({ ...p, visible: false }))
    if (!props.onCreateExercise) return
    try { const e = await props.onCreateExercise(name); bindRowAt(target, e.id, e.name, true) } catch { /* ignore */ }
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
  const handleSave = async () => {
    if (!props.onSave || saving) return
    // Saving reconciles into the same plan id in place, so editing a *published* plan changes
    // what the student is looking at right now. Make that explicit instead of silently
    // overwriting their live plan. Keyed off serverPublished (not local `published`, which 撤回 fakes).
    if (serverPublished && !window.confirm(`「${planName}」正在发布给 ${studentName}，保存会立即改变 ta 正在看的计划。确认保存？`)) return
    setSaving(true); setStatusText('保存中…')
    try { await props.onSave(weeks); setStatusText(serverPublished ? `已更新 ${studentName} 的计划` : '草稿 · 已保存') }
    catch { setStatusText('保存失败 · 重试') }
    finally { setSaving(false) }
  }

  const handlePublish = async () => {
    if (published) { setPublished(false); setStatusText('草稿 · 已存'); return }
    setStatusText('发布中…')
    try {
      if (onPublish) { await onPublish(); setServerPublished(true) }
      setPublished(true); setStatusText(`已发布给 ${studentName} · 刚刚`)
    } catch {
      setStatusText('发布失败 · 重试')
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
        students={props.students} currentStudentId={props.currentStudentId} onSwitchStudent={props.onSwitchStudent}
        plans={props.plans} currentPlanId={props.currentPlanId} onSwitchPlan={props.onSwitchPlan}
        onNewPlan={props.onNewPlan} onLogout={props.onLogout}
        onSave={props.onSave ? handleSave : undefined} saving={saving}
      />
      <Toolbar weeksCount={weeksCount} curWeekLabel={curWeekLabel} zoomLabel={`${Math.round(zoom)}%`} />
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
                      />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
        <div style={{ textAlign: 'center', color: 'var(--fg-tertiary)', fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '.1em', padding: '10px 7px 20px', textTransform: 'uppercase' }}>▼ W06 … W12 · 共 12 周</div>
      </div>

      <ExercisePopover
        visible={pop.visible} x={pop.x} y={pop.y}
        index={props.exerciseIndex ?? null} query={pop.query}
        onPick={onPickHit} onCreateCustom={onCreateCustom}
      />
    </div>
  )
}
