import { useRef, useState, type ReactNode } from 'react'
import { outlineImport, recognizeImportWeeks, type AIWeekResult, type AIWeek, type ImportOutline, type ImportStatus } from '../../../api/planImports'
import type { PlanWithChildren, PlanResponse, ExerciseResponse } from '../../../api/types'
import type { ExerciseIndex } from '../exerciseIndex'
import type { Week } from '../types'
import { S } from '../../../i18n/strings'
import { pastedToSheets, readWorkbook, regionCells, type SheetCell, type ImportSheet } from './sheets'
import { createPlan, getPlan } from '../../../api/plans'
import { createCustomExercise } from '../../../api/exercises'
import { createDraftMirror, saveDraftMirror } from '../draftMirror'
import { putPendingRevision } from '../../../api/pendingRevision'
import { reconcileImportedPlan } from '../reconcile'
import { aiWeeksToParsed } from './aiWeeks'
import { buildWeeks } from './index'
import { mmdd, planEndISO, weekdayIndex } from '../components/PlanCalendarControls'
import { shiftISODate } from '../mapping'
import { ApiException } from '../../../api/client'
import { FailedWeekCells } from './FailedWeekCells'
import { defaultFirstDate } from '../../workspace/blockPlanSettings'
import './import.css'

function importError(error: unknown): string {
  const code = error instanceof Error ? error.message : ''
  if (code in S.sheetImport.errors) return S.sheetImport.errors[code as keyof typeof S.sheetImport.errors]
  if (error instanceof ApiException && error.code === 'PARSE_FAILED') return S.sheetImport.reasons[error.details.reason as keyof typeof S.sheetImport.reasons] ?? S.sheetImport.failedRetry
  return S.sheetImport.failedRetry
}
export interface ImportedPlan { plan: PlanWithChildren; weeks: Week[]; exercises: ExerciseResponse[]; weekdays: number[] }
export interface ImportPlanDialogProps {
  traineeId: string; studentName: string; status: ImportStatus; exerciseIndex: ExerciseIndex
  onCreated: (result: ImportedPlan) => void | Promise<void>; onClose: () => void; tabs?: ReactNode; onRemainingChange?: (remaining: number) => void
}
export function ImportPlanDialog(p: ImportPlanDialogProps) {
  const [sheets, setSheets] = useState<ImportSheet[]>([])
  const [filename, setFilename] = useState('')
  const [paste, setPaste] = useState('')
  const [error, setError] = useState('')
  const [stage, setStage] = useState<'source' | 'weeks' | 'summary'>('source')
  const [busy, setBusy] = useState('')
  const [remaining, setRemaining] = useState(p.status.remaining_today)
  const [outline, setOutline] = useState<ImportOutline | null>(null)
  const [selected, setSelected] = useState<number[]>([])
  const [name, setName] = useState(S.sheetImport.defaultName)
  const start = async () => {
    if (busy || !remaining) return
    setBusy(S.sheetImport.reading); setError('')
    try {
      const result = await outlineImport({ trainee_id: p.traineeId, source: filename ? 'file' : 'paste', sheets })
      setResults([]); setEditedCells({}); setEmptyWeeks(new Set()); createdRef.current = null; addedRef.current = []
      setFirstDate(defaultFirstDate(0))
      setOutline(result); setSelected(result.weeks.slice(-12).map(w => w.index)); setRemaining(Math.max(0, remaining - 1)); p.onRemainingChange?.(Math.max(0, remaining - 1))
      setName(filename.replace(/\.[^.]+$/, '').trim() || S.sheetImport.defaultName); setStage('weeks')
    } catch (e) {
      setError(e instanceof ApiException && e.status === 400 && e.code === 'VALIDATION_ERROR' ? S.sheetImport.invalidFormat : importError(e))
      if (e instanceof ApiException && e.code === 'IMPORT_DAILY_LIMIT') { setRemaining(0); p.onRemainingChange?.(0) }
    }
    finally { setBusy('') }
  }
  const toggleWeek = (index: number) => {
    const next = selected.includes(index) ? selected.filter(i => i !== index) : [...selected, index]
    const positions = outline!.weeks.flatMap((w, i) => next.includes(w.index) ? [i] : [])
    if (next.length > 12 || (positions.length && positions.at(-1)! - positions[0] + 1 !== positions.length)) { setError(S.sheetImport.selectionError); return }
    setSelected(outline!.weeks.filter(w => next.includes(w.index)).map(w => w.index)); setError('')
  }
  const [results, setResults] = useState<AIWeekResult[]>([])
  const [emptyWeeks, setEmptyWeeks] = useState(new Set<number>())
  const [editedCells, setEditedCells] = useState<Record<number, SheetCell[]>>({})
  const [firstDate, setFirstDate] = useState(defaultFirstDate(0))
  const cells = sheets.find(sheet => sheet.name === outline?.sheet)?.cells ?? []
  const cellsFor = (index: number) => editedCells[index] ?? regionCells(cells, outline!.weeks.find(w => w.index === index)!.region)
  const recognize = async (indexes: number[]) => {
    if (!outline || busy) return
    setError(''); setBusy(S.sheetImport.progress(1, indexes.length))
    const received: AIWeekResult[] = []
    try {
      // Four weeks per request leaves at least five of the backend's eight calls for corrections.
      for (let offset = 0; offset < indexes.length; offset += 4) {
        setBusy(S.sheetImport.progress(offset + 1, indexes.length))
        const batch = indexes.slice(offset, offset + 4)
        const response = await recognizeImportWeeks(outline.import_id, {
          weeks: batch.map(index => ({ index, cells: cellsFor(index).map(([r,c,text]): SheetCell => [r,c,text.trim()]).filter(c => c[2]) })),
          header_cells: regionCells(cells, outline.header_region),
        })
        received.push(...batch.map(index => response.weeks.find(w => w.index === index) ?? { index, error: 'PARSE_FAILED' as const, reason: 'BAD_OUTPUT' as const }))
      }
      setResults(prev => [...prev.filter(w => !indexes.includes(w.index)), ...received]); setStage('summary')
    } catch (e) {
      // Retain completed batches. A retry only needs the unresolved weeks.
      setResults(prev => [...prev.filter(w => !received.some(r => r.index === w.index)), ...received])
      setError(importError(e))
    } finally { setBusy('') }
  }
  const activeResults = selected.map(index => results.find(w => w.index === index)).filter((w): w is AIWeekResult => !!w)
  const goodWeeks = activeResults.filter((w): w is AIWeek => !('error' in w))
  const failures = activeResults.filter(w => 'error' in w)
  const exercises = goodWeeks.flatMap(w => w.days.flatMap(d => d.exercises))
  const newNames = [...new Set(exercises.filter(e => !p.exerciseIndex.resolve(e.name)).map(e => e.name.trim()))]
  const counts = {
    new_exercise: newNames.length,
    note_fallback: exercises.filter(e => e.flags.includes('note_fallback')).length,
    inferred: exercises.filter(e => e.flags.includes('inferred')).length,
    no_date: goodWeeks.filter(w => !w.start_date).length,
    empty_week: selected.filter(index => emptyWeeks.has(index)).length,
  }
  const createdRef = useRef<PlanResponse | null>(null)
  const addedRef = useRef<ExerciseResponse[]>([])
  const creatingRef = useRef(false)
  const create = async () => {
    if (busy || creatingRef.current || failures.length || goodWeeks.length !== selected.length) return
    creatingRef.current = true; setBusy(S.editor.saving); setError('')
    try {
      const startDate = counts.no_date ? firstDate : goodWeeks[0].start_date!
      const anchor = weekdayIndex(startDate)
      if (!createdRef.current) createdRef.current = await createPlan({
        trainee_id: p.traineeId, name: name.trim(), plan_weeks: selected.length, start_date: startDate,
        end_date: planEndISO(startDate, selected.length), anchor_weekday: anchor + 1, source: 'coach', kind: 'regular',
      })
      let index = addedRef.current.reduce((idx, exercise) => idx.withAdded(exercise), p.exerciseIndex)
      for (const exercise of exercises) {
        if (index.resolve(exercise.name)) continue
        const created = await createCustomExercise({ name: exercise.name.trim(), ...(exercise.family_guess ? { exerciseType: 'main_lift_variation' as const, mainLiftFamily: exercise.family_guess } : {}) })
        addedRef.current.push(created); index = index.withAdded(created)
      }
      // No-date weeks now have an explicit calendar. Rotate weekday positions relative to D1.
      const scheduled = goodWeeks.map((w, position) => ({ ...w, start_date: shiftISODate(startDate, position * 7), days: w.days.map(d => ({ ...d, weekday: (d.weekday - anchor + 7) % 7 })) }))
      const parsed = aiWeeksToParsed(scheduled, new Set(newNames), emptyWeeks)
      const built = buildWeeks(parsed, index, startDate)
      const planId = createdRef.current.id
      const content = { weeks: built.weeks, planStartDate: startDate, weeksCount: built.weeks.length }
      // Persist the review metadata independently from the plan tree, including recovery after a partial save.
      saveDraftMirror(planId, content)
      await putPendingRevision(planId, createDraftMirror(planId, content))
      const result = await reconcileImportedPlan(planId, built.weeks, startDate)
      const saved = { ...content, weeks: result.weeks }
      saveDraftMirror(planId, saved)
      await putPendingRevision(planId, createDraftMirror(planId, saved))
      const plan = await getPlan(planId)
      const weekdays = [...new Set(goodWeeks.flatMap(w => w.days.filter(d => !d.rest).map(d => d.weekday)))].sort((a,b) => (a - anchor + 7) % 7 - (b - anchor + 7) % 7)
      await p.onCreated({ plan, weeks: result.weeks, weekdays, exercises: addedRef.current })
    } catch (e) { setError(`${importError(e)}${createdRef.current ? ` · ${S.sheetImport.createdRetry}` : ''}`) }
    finally { creatingRef.current = false; setBusy('') }
  }
  const fileRef = useRef<HTMLInputElement>(null)
  const chooseFile = async (file: File) => {
    if (busy) return
    setBusy(S.sheetImport.readingFile); setFilename(''); setSheets([]); setError('')
    try {
      if (file.size > 10 * 1024 * 1024) throw new Error('WORKBOOK_TOO_LARGE')
      const contentSheets = readWorkbook(await file.arrayBuffer())
      setSheets(contentSheets); setFilename(file.name); setPaste('')
      if (!contentSheets.length) setError(S.sheetImport.noContent)
    } catch (e) {
      setError(e instanceof Error && e.message in S.sheetImport.errors ? importError(e) : file.name.toLowerCase().endsWith('.et') ? S.sheetImport.etHint : S.sheetImport.invalidFile)
    } finally { setBusy('') }
  }
  const acceptPaste = (text: string, html = '') => {
    if (busy) return
    setPaste(text); setFilename(''); setError('')
    try { setSheets(pastedToSheets(text, html)) }
    catch (e) { setSheets([]); setError(importError(e)) }
  }
  return <div className="import-overlay" onMouseDown={() => { if (!busy) p.onClose() }}><section role="dialog" aria-modal="true" aria-label={S.workspace.dialogs.newPlanTitle} className="import-dialog" onKeyDown={e => { if (e.key === 'Escape' && !busy) p.onClose() }} onMouseDown={e => e.stopPropagation()}>
    <div className="import-title"><h3>{stage === 'weeks' ? S.sheetImport.selectWeeks : stage === 'summary' ? S.sheetImport.done : S.workspace.dialogs.newPlanTitle}</h3>{!busy && stage === 'source' && p.tabs}</div>
    {busy && <p role="status">{busy}</p>}
    <fieldset disabled={!!busy} className="import-fields">
    {stage === 'source' && <>
    <div className="import-drop" onDragOver={e => e.preventDefault()} onDrop={e => { e.preventDefault(); const file = e.dataTransfer.files[0]; if (file) void chooseFile(file) }}>
      <span aria-hidden="true">↑</span><div>{S.sheetImport.drop}<button onClick={() => fileRef.current?.click()}>{S.sheetImport.chooseFile}</button></div>
      <small>{filename || S.sheetImport.formats}</small><input type="file" ref={fileRef} hidden accept=".xlsx,.xls,.csv,.et" onChange={e => { const file = e.target.files?.[0]; if (file) void chooseFile(file); e.target.value = '' }} />
    </div>
    <div className="import-divider">{S.sheetImport.orPaste}</div>
    <label>{S.sheetImport.paste}<textarea aria-label={S.sheetImport.paste} value={paste} placeholder={S.sheetImport.pasteHint}
      onChange={e => acceptPaste(e.target.value)}
      onPaste={e => { e.preventDefault(); acceptPaste(e.clipboardData.getData('text/plain'), e.clipboardData.getData('text/html')) }} /></label>
    <div className="import-footnote"><span>ⓘ {S.sheetImport.privacy}</span><span>{S.sheetImport.remaining(p.studentName, remaining)}</span></div>
    {error && <p role="alert">{error}</p>}
    <footer><button onClick={p.onClose}>{S.common.cancel}</button><button className="primary" onClick={() => void start()} disabled={!sheets.some(s => s.cells.length) || remaining === 0}>{remaining === 0 ? S.sheetImport.exhausted : S.sheetImport.start}</button></footer>
    </>}
    {stage === 'weeks' && outline && <>
      <small>{filename || S.sheetImport.pasted} · {S.sheetImport.found(outline.sheet, outline.weeks.length)}</small>
      <label>{S.workspace.dialogs.planName}<input value={name} onChange={e => setName(e.target.value)} /></label>
      <div className="import-footnote"><span>{S.sheetImport.selectionHint}</span><span>{S.sheetImport.selected(selected.length)}</span></div>
      {outline.truncated_rows > 0 && <small>{S.sheetImport.truncated}</small>}
      <div className="import-weeks">{outline.weeks.map(w => <label key={w.index} className={selected.includes(w.index) ? 'selected' : ''}>
        <input type="checkbox" checked={selected.includes(w.index)} onChange={() => toggleWeek(w.index)} aria-label={w.label} />
        <b title={w.label}>W{w.index + 1}</b><span>{w.start_date ? `${mmdd(w.start_date)} – ${mmdd(shiftISODate(w.start_date, 6))}` : S.sheetImport.noDate}</span><small>{S.sheetImport.trainingDays(w.training_days)}</small>
      </label>)}</div>
      {error && <p role="alert">{error}</p>}
      <footer><button onClick={() => { setStage('source'); setError('') }}>{S.sheetImport.changeSource}</button><button className="primary" onClick={() => void recognize(selected.filter(index => !results.some(result => result.index === index)))} disabled={!selected.length || !name.trim()}>{S.sheetImport.recognize(selected.length)}</button></footer>
    </>}
    {stage === 'summary' && outline && <>
      <small>{name} · W{(selected[0] ?? 0) + 1}–W{(selected.at(-1) ?? 0) + 1} · {mmdd(goodWeeks[0]?.start_date ?? firstDate)}</small>
      <div className="import-summary">{S.sheetImport.summary(selected.length, goodWeeks.reduce((n,w) => n + w.days.filter(d => !d.rest).length, 0), exercises.length).split(' · ').map((stat, index) => <span key={index}>{index > 0 && <span className="import-stat-divider"> · </span>}{stat}</span>)}</div>
      {failures.map(w => <div key={w.index} className="import-failure">
        <b>{S.sheetImport.failed(w.index + 1, S.sheetImport.reasons[w.reason])}</b>
        <p>{S.sheetImport.editFailed(w.index + 1)}</p>
        <FailedWeekCells index={w.index} cells={cellsFor(w.index)} onChange={next => setEditedCells(prev => ({ ...prev, [w.index]: next }))} />
        <div className="import-failure-actions"><button className="primary" onClick={() => void recognize([w.index])}>{S.sheetImport.retry}</button>
          <button onClick={() => { setEmptyWeeks(prev => new Set(prev).add(w.index)); setResults(prev => prev.map(r => r.index === w.index ? { index: w.index, start_date: outline.weeks.find(o => o.index === w.index)?.start_date ?? null, days: [] } : r)) }}>{S.sheetImport.leaveEmpty}</button>
          <button onClick={() => { setSelected(prev => prev.filter(i => i !== w.index)); setResults(prev => prev.filter(r => r.index !== w.index)) }}>{S.sheetImport.omit}</button></div>
      </div>)}
      <div className="import-footnote"><b>{S.sheetImport.attention}</b><small>{S.sheetImport.attentionHint}</small></div>
      <div className="import-doubts">{(Object.keys(counts) as (keyof typeof counts)[]).filter(kind => kind !== 'empty_week' || counts[kind]).map(kind => <div key={kind} data-doubt-count={kind}>
        <span className="import-doubt-label">{S.sheetImport.doubts[kind]}</span><span>{kind === 'no_date' && !counts.no_date ? S.sheetImport.allDated : S.sheetImport.doubtHints[kind]}</span><b>{counts[kind]}</b>
        {kind === 'new_exercise' && <small>{newNames.join(' · ')}</small>}
      </div>)}</div>
      {counts.no_date > 0 && <label>{S.block.firstDate}<input type="date" aria-label={S.block.firstDate} value={firstDate} onChange={e => setFirstDate(e.target.value)} /></label>}
      {error && <p role="alert">{error}</p>}
      {failures[0] && <small>{S.sheetImport.handleFirst(failures[0].index + 1)}</small>}
      <footer><button disabled={!!createdRef.current} onClick={() => { setStage('weeks'); setError('') }}>{S.sheetImport.reselect}</button><button className="primary" onClick={() => void create()} disabled={!selected.length || !!failures.length || goodWeeks.length !== selected.length || !firstDate}>{S.sheetImport.create}</button></footer>
    </>}
    </fieldset>
  </section></div>
}
