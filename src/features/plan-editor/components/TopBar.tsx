import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { PlanShiftSummary, PlanStatus } from '../../../api/types'
import { planShiftNoticeText, type StudentPlanCursor } from '../mapping'
import { mmdd } from './PlanCalendarControls'
import { S } from '../../../i18n/strings'

interface Option { id: string; label: string; tag?: string; sub?: string }

interface Props {
  feedbackOpen?: boolean
  pendingVideoCount?: number
  onToggleFeedback?: () => void
  showActuals?: boolean
  onToggleActuals?: () => void
  studentName: string
  planName: string
  published: boolean
  publishedDirty?: boolean
  readOnly?: boolean
  statusText: string
  onPublish: () => void
  // optional switchers (connected mode)
  students?: Option[]
  currentStudentId?: string
  onSwitchStudent?: (id: string) => void | Promise<void>
  plans?: Option[]
  currentPlanId?: string
  onSwitchPlan?: (id: string) => void | Promise<void>
  weeksCount?: number
  onPlanSettings?: () => void
  onNewPlan?: () => void | Promise<void>
  onBackToBoard?: () => void | Promise<void>
  currentPlanStatus?: PlanStatus
  onDeleteCurrentDraft?: () => void | Promise<void>
  onMarkComplete?: () => void | Promise<void>
  /** Backfill past, unlogged sessions of the current plan as assumed-complete. */
  onBackfillHistory?: () => void | Promise<void>
  /** Rename the current plan (plan dropdown's ✎ row). */
  onRenamePlan?: () => void
  /** Rename the selected student (student dropdown's ✎ row). */
  onRenameStudent?: () => void
  onSave?: () => void
  saving?: boolean
  draftSaveFailed?: boolean
  onImport?: (file: File) => void | Promise<void>
  planStartDate?: string
  calendarLocked?: boolean
  calendarLockedHint?: string
  onChangeStartDate?: (startDate: string) => Promise<void>
  onNewExercise?: () => void
  /** Rows needing attention (unbound / no sets); click cycles to the next one. */
  issueCount?: number
  issueHint?: string
  onJumpIssue?: () => void
  totalShiftDays?: number
  latestShift?: PlanShiftSummary | null
  undoingShift?: boolean
  undoNeedsRefresh?: boolean
  onUndoShift?: () => void | Promise<void>
  studentPlanCursor?: StudentPlanCursor | null
}


export function TopBar(p: Props) {
  const [menu, setMenu] = useState<'student' | 'plan' | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const studentAnchor = useRef<HTMLButtonElement>(null)
  const planAnchor = useRef<HTMLButtonElement>(null)
  const close = () => setMenu(null)
  useEffect(() => {
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') setMenu(null) }
    window.addEventListener('keydown', escape)
    return () => window.removeEventListener('keydown', escape)
  }, [])
  const anchor = menu === 'student' ? studentAnchor.current : planAnchor.current
  const rect = anchor?.getBoundingClientRect()
  const options = menu === 'student' ? p.students ?? [] : p.plans ?? []
  const currentId = menu === 'student' ? p.currentStudentId : p.currentPlanId
  const action = (label: string, callback?: () => void | Promise<void>, danger = false, disabled = false) => callback && <button type="button" role="menuitem" className={danger ? 'danger' : ''} disabled={disabled} onClick={() => { close(); void callback() }}>{label}</button>
  const shiftNotice = planShiftNoticeText(p.totalShiftDays ?? 0, p.latestShift ?? null)
  return <>
    <div className="plan-context-bar block-topbar" data-plan-context-bar="" aria-label={S.editor.planContext}
      style={{ height:56, flex:'0 0 56px', flexWrap:'nowrap', overflowX:'auto', overflowY:'hidden', whiteSpace:'nowrap' }}>
      <img src="/meetpr-icon-64.png" alt="MeetPR" width="30" height="30" /><b className="block-brand">MeetPR</b><span className="plan-context-divider" />
      <button ref={studentAnchor} aria-expanded={menu === 'student'} aria-haspopup="menu" onClick={() => setMenu(menu === 'student' ? null : 'student')}><small>{S.block.student}</small> {p.studentName} ▾</button>
      <button ref={planAnchor} data-plan-menu-trigger="" aria-expanded={menu === 'plan'} aria-haspopup="menu" onClick={() => setMenu(menu === 'plan' ? null : 'plan')}><small>{S.block.plan}</small> {p.planName}{p.planStartDate ? ` · ${mmdd(p.planStartDate)}` : ''}{p.weeksCount ? ` · ${S.common.countWeeks(p.weeksCount)}` : ''} ▾</button>
      <span className="plan-context-spacer" />
      {(p.issueCount ?? 0) > 0 && <button title={p.issueHint} onClick={p.onJumpIssue}>{S.editor.issuesToReview(p.issueCount!)}</button>}
      <button type="button" className="feedback-toggle" data-feedback-toggle="" aria-label={S.block.feedback} aria-pressed={p.feedbackOpen ?? false} onClick={p.onToggleFeedback}>
        <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" aria-hidden="true"><path d="M3 2h10v8H7l-4 3V2Z" /></svg>
        {S.block.feedback}{!!p.pendingVideoCount && <span data-feedback-count="">{p.pendingVideoCount}</span>}
      </button>
      <button type="button" className="show-actuals" role="switch" aria-label={S.block.showActuals} aria-checked={p.showActuals ?? false} onClick={p.onToggleActuals}>{S.block.showActuals}<i aria-hidden="true" /></button>
      <span className={`plan-autosave-status${p.publishedDirty ? ' published-dirty' : ''}`} data-testid="plan-save-status" role="status"><span className={p.published ? 'published' : ''} aria-hidden="true" />{p.statusText}</span>
      {!p.published && !p.readOnly && p.draftSaveFailed && p.onSave && <button type="button" disabled={p.saving} onClick={p.onSave}>{S.block.retrySave}</button>}
      <button className="block-primary" disabled={p.readOnly || p.saving || (p.published && !p.onSave)} onClick={p.published ? p.onSave : p.onPublish} title={p.readOnly ? S.editor.historicalReadOnlyHint : undefined}>
        {p.readOnly ? S.editor.historicalReadOnly : p.saving ? S.editor.saving : p.published ? S.editor.updatePlan : S.editor.publishToStudent}
      </button>
      <input ref={fileRef} type="file" accept=".xlsx" hidden onChange={event => { const file = event.currentTarget.files?.[0]; event.currentTarget.value = ''; if (file) void p.onImport?.(file) }} />
    </div>
    {menu && rect && createPortal(<>
      <div className="block-menu-backdrop" onClick={close} />
      <div role="menu" className="block-plan-menu" style={{ top:rect.bottom + 6, left:Math.min(rect.left, window.innerWidth - 316) }}>
        {menu === 'plan' && <header>{S.block.switchPlan}</header>}
        {options.map(option => <button key={option.id} type="button" role="menuitem" className={option.id === currentId ? 'current' : ''} onClick={() => { close(); void (menu === 'student' ? p.onSwitchStudent : p.onSwitchPlan)?.(option.id) }}><span>{option.label}</span><small>{option.tag}</small></button>)}
        <hr />
        {menu === 'student' ? <>
          {action(S.editor.renameStudent, p.onRenameStudent)}
          {action(S.editor.backToOverview, p.onBackToBoard)}
        </> : <>
          {action(S.editor.newPlan, p.onNewPlan)}
          {action(S.block.settingsMenu, p.onPlanSettings, false, p.saving)}
          {action(S.editor.renameCurrentPlan, p.onRenamePlan)}
          {action(S.editor.importXlsx, p.onImport ? () => fileRef.current?.click() : undefined, false, p.saving)}
          {action(S.editor.backfillPastTraining, p.onBackfillHistory)}
          {p.currentPlanStatus === 'published' && action(S.editor.markCompleted, p.onMarkComplete)}
          {p.currentPlanStatus === 'draft' && p.onDeleteCurrentDraft && <><hr />{action(S.editor.deleteCurrentDraft, p.onDeleteCurrentDraft, true)}</>}
        </>}
      </div>
    </>, document.body)}
    {shiftNotice && <div className="block-shift-notice" data-plan-shift-notice="">{shiftNotice}
      {p.latestShift && p.onUndoShift && <button type="button" data-plan-shift-undo="" disabled={p.undoingShift} onClick={() => { void p.onUndoShift?.() }}>{p.undoNeedsRefresh ? S.editor.retryShiftRefresh : S.editor.undoShift}</button>}
    </div>}
  </>
}
