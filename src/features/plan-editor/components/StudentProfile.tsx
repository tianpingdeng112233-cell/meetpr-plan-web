import { useEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { setCoachStudentAlias, setStudentServiceTerm, unbindCoachStudent } from '../../../api/coach'
import type { CoachStudent } from '../../../api/types'
import { useGlobalKeyboardHandler } from '../../workspace/globalKeyboard'
import { previouslyEnded } from '../../workspace/studentRailModel'
import { ServiceTermDateInput } from '../../workspace/ServiceTermDateInput'
import { getServiceTerm, localDate } from '../../workspace/serviceTerm'
import { S } from '../../../i18n/strings'

export interface StudentProfileProps {
  student: CoachStudent
  onChanged: (patch: Pick<CoachStudent, 'id'> & Partial<Pick<CoachStudent, 'alias' | 'bond_status' | 'ended_at' | 'service_until'>>) => void
  onBeforeUnbind?: () => Promise<boolean>
  children: ReactNode
}

export function StudentProfile({ student, onChanged, onBeforeUnbind, children }: StudentProfileProps) {
  const [editing, setEditing] = useState(false)
  const [alias, setAlias] = useState('')
  const [confirm, setConfirm] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [editingTerm, setEditingTerm] = useState(false)
  const [termDate, setTermDate] = useState('')
  const [termError, setTermError] = useState('')
  const termCopy = S.workspace.serviceTerm
  const term = getServiceTerm(student.service_until)
  const editTerm = () => { setTermDate(student.service_until ?? ''); setTermError(''); setEditingTerm(true) }
  const saveTerm = async (value: string | null) => {
    if (busy || student.bond_status === 'ended') return
    setBusy(true); setTermError('')
    try {
      const result = await setStudentServiceTerm(student.id, value)
      onChanged({ id: student.id, service_until: result.service_until })
      setEditingTerm(false)
    } catch { setTermError(S.workspace.serviceTerm.failed) }
    finally { setBusy(false) }
  }
  const ended = student.bond_status === 'ended'
  useEffect(() => { if (ended) { setConfirm(false); setEditing(false); setEditingTerm(false); setTermError('') } }, [ended])
  const date = previouslyEnded({ previously_ended_at: student.ended_at }) ?? '—'
  const dialog = useRef<HTMLElement>(null)
  useEffect(() => {
    if (!confirm) return
    const trigger = document.activeElement as HTMLElement | null
    return () => trigger?.focus()
  }, [confirm])
  useGlobalKeyboardHandler(({ event }) => {
    if (!confirm) return false
    if (event.key === 'Escape' && !busy) { event.preventDefault(); setConfirm(false) }
    if (event.key === 'Tab') {
      event.preventDefault()
      const buttons = [...(dialog.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)') ?? [])]
      const index = buttons.indexOf(document.activeElement as HTMLButtonElement)
      buttons[(index + (event.shiftKey ? -1 : 1) + buttons.length) % buttons.length]?.focus()
    }
    return true
  }, 1100)
  const name = student.alias ?? student.display_name
  const unbind = async () => {
    if (busy || ended) return
    setBusy(true); setError('')
    try {
      if (onBeforeUnbind && !(await onBeforeUnbind())) return
      await unbindCoachStudent(student.id)
      onChanged({ id: student.id, bond_status: 'ended', service_until: null, ended_at: new Date().toISOString() })
      setConfirm(false)
      window.dispatchEvent(new CustomEvent('meetpr:toast', { detail: S.workspace.studentRail.unbound(name) }))
    } catch { setError(S.workspace.studentRail.unbindFailed) }
    finally { setBusy(false) }
  }
  const saveAlias = async () => {
    if (busy || ended || alias.trim().length > 100) return
    setBusy(true); setError('')
    try {
      const value = alias.trim() || null
      await setCoachStudentAlias(student.id, value)
      onChanged({ id: student.id, alias: value })
      setEditing(false)
    } catch { setError(S.workspace.studentRail.aliasFailed) }
    finally { setBusy(false) }
  }
  return <section className="student-profile">
    <header><h3>{name}</h3><button type="button" className="student-alias-link" disabled={ended || busy} onClick={() => { setAlias(student.alias ?? ''); setError(''); setEditing(true) }}>{S.workspace.studentRail.editAlias}</button></header>
    <p>{S.workspace.studentRail.aliasHint}</p>
    {ended && <span className="student-ended-label">{S.workspace.studentRail.endedDate(date)}</span>}
    {!ended && <section className={`service-term-card${editingTerm ? ' editing' : ''}`}>
      {editingTerm ? <form onSubmit={event => { event.preventDefault(); if (termDate) void saveTerm(termDate) }}>
        <ServiceTermDateInput value={termDate} base={student.service_until ?? localDate()} onChange={setTermDate} disabled={busy} />
        <p className="service-term-base">{student.service_until ? termCopy.fromDate(student.service_until.replaceAll('-', '/')) : termCopy.fromToday}</p>
        {termError && <p role="alert">{termError}</p>}
        <footer>
          {student.service_until && <button className="service-term-clear" type="button" disabled={busy} onClick={() => void saveTerm(null)}>{termCopy.clear}</button>}
          <span className="service-term-spacer" />
          <button type="button" disabled={busy} onClick={() => { setEditingTerm(false); setTermError('') }}>{S.common.cancel}</button>
          <button className="service-term-save" type="submit" disabled={busy || !termDate}>{S.common.save}</button>
        </footer>
      </form> : term ? <>
        <div className="service-term-heading"><span>{termCopy.label} <b>{student.service_until!.replaceAll('-', '/')}</b></span><button className="student-alias-link" type="button" disabled={busy} onClick={editTerm}>{termCopy.edit}</button></div>
        <span className={`service-term-capsule ${term.tone}`}>{term.label}</span>
      </> : <button className="student-alias-link" type="button" disabled={busy} onClick={editTerm}>{termCopy.set}</button>}
    </section>}
    {editing && !ended && <form className="student-alias-form" onSubmit={event => { event.preventDefault(); void saveAlias() }}>
      <input autoFocus aria-label={S.workspace.studentRail.editAlias} maxLength={100} value={alias} disabled={busy} onChange={event => setAlias(event.target.value)} />
      <button type="submit" disabled={busy}>{S.common.save}</button>
      <button type="button" disabled={busy} onClick={() => { setEditing(false); setError('') }}>{S.common.cancel}</button>
    </form>}
    {!confirm && error && <p role="alert">{error}</p>}
    {children}
    {ended ? <p className="student-ended-note">{S.workspace.studentRail.endedNote}</p> : <button type="button" className="student-unbind" disabled={busy} onClick={() => { setError(''); setConfirm(true) }}>{S.workspace.studentRail.unbind}</button>}
    {confirm && createPortal(<div className="student-unbind-overlay" onMouseDown={event => event.stopPropagation()}>
      <section ref={dialog} className="student-unbind-dialog" role="dialog" aria-modal="true" aria-label={S.workspace.studentRail.unbindTitle(name)}>
        <h3>{S.workspace.studentRail.unbindTitle(name)}</h3>
        <ul>{S.workspace.studentRail.unbindConsequences.map(line => <li key={line}>{line}</li>)}</ul>
        {error && <p role="alert">{error}</p>}
        <footer><button autoFocus disabled={busy} onClick={() => setConfirm(false)}>{S.common.cancel}</button><button className="danger" disabled={busy} onClick={() => void unbind()}>{S.workspace.studentRail.confirmUnbind}</button></footer>
      </section>
    </div>, document.body)}
  </section>
}
