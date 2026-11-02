import { useEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { setCoachStudentAlias, unbindCoachStudent } from '../../../api/coach'
import type { CoachStudent } from '../../../api/types'
import { useGlobalKeyboardHandler } from '../../workspace/globalKeyboard'
import { previouslyEnded } from '../../workspace/studentRailModel'
import { S } from '../../../i18n/strings'

export interface StudentProfileProps {
  student: CoachStudent
  onChanged: (patch: Pick<CoachStudent, 'id'> & Partial<Pick<CoachStudent, 'alias' | 'bond_status' | 'ended_at'>>) => void
  onBeforeUnbind?: () => Promise<boolean>
  children: ReactNode
}

export function StudentProfile({ student, onChanged, onBeforeUnbind, children }: StudentProfileProps) {
  const [editing, setEditing] = useState(false)
  const [alias, setAlias] = useState('')
  const [confirm, setConfirm] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const ended = student.bond_status === 'ended'
  useEffect(() => { if (ended) { setConfirm(false); setEditing(false) } }, [ended])
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
      onChanged({ id: student.id, bond_status: 'ended', ended_at: new Date().toISOString() })
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
