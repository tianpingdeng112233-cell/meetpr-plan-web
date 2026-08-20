import { useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { PlanStatus } from '../../../api/types'
import { shiftISODate, type StudentPlanCursor } from '../mapping'
import { mmdd, WeekdayDateSelector } from './PlanCalendarControls'
import { S } from '../../../i18n/strings'
import { StudentPlanCursorBadges } from './StudentPlanCursorBadges'

interface Option { id: string; label: string; tag?: string; sub?: string }

interface Props {
  studentName: string
  planName: string
  published: boolean
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
  studentPlanCursor?: StudentPlanCursor | null
}

const pill: React.CSSProperties = {
  height: 28, boxSizing: 'border-box', display: 'inline-flex', alignItems: 'center', gap: 7, padding: '4px 9px',
  border: '1px solid var(--bd)', borderRadius: 'var(--r-sm)', background: 'var(--card-bg)',
  fontWeight: 600, fontSize: 12, cursor: 'pointer', position: 'relative', whiteSpace: 'nowrap', flex: 'none',
}
const caret: React.CSSProperties = { color: 'var(--mut)', fontSize: 9 }

export interface DropdownAction { label: string; tone: 'danger' | 'success' | 'neutral'; icon: string; onClick: () => void | Promise<void> }

function Dropdown({ open, anchor, onClose, options, currentId, onPick, onNew, newLabel, onRenameCurrent, renameLabel, actions }: {
  open: boolean; options: Option[]; currentId?: string; onPick: (id: string) => void | Promise<void>; onNew?: () => void | Promise<void>; newLabel?: string
  anchor: HTMLElement | null; onClose: () => void
  onRenameCurrent?: () => void; renameLabel?: string
  actions?: DropdownAction[]
}) {
  if (!open || !anchor) return null
  const rect = anchor.getBoundingClientRect()
  return createPortal(
    <>
      <div
        onClick={(event) => {
          event.stopPropagation()
          onClose()
        }}
        style={{ position: 'fixed', inset: 0, zIndex: 70 }}
      />
      <div style={{
        position: 'fixed', top: rect.bottom + 6, left: rect.left, minWidth: 200, zIndex: 80,
        background: 'var(--card-bg)', border: '1px solid var(--bd)', borderRadius: 'var(--r-sm)',
        overflow: 'hidden', boxShadow: 'var(--elev-modal)',
      }}>
        {options.map((o) => (
          <div key={o.id} className="popitem" onClick={(e) => { e.stopPropagation(); void onPick(o.id) }}
            style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', color: o.id === currentId ? 'var(--txt)' : 'var(--sec)', fontWeight: o.id === currentId ? 600 : 400 }}>
            {o.id === currentId && <span style={{ color: 'var(--ink)', fontSize: 10 }}>●</span>}
            <span style={{ flex: 1, minWidth: 0 }}>
              {o.label}
              {o.sub && <span style={{ display: 'block', fontSize: 10, fontWeight: 400, color: 'var(--mut)', fontFamily: 'var(--font-mono)' }}>{o.sub}</span>}
            </span>
            {o.tag && <span style={{ fontSize: 10, color: 'var(--mut)', flex: 'none' }}>{o.tag}</span>}
          </div>
        ))}
        {onRenameCurrent && (
          <div className="popitem" onClick={(e) => { e.stopPropagation(); onRenameCurrent() }}
            style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '9px 12px', color: 'var(--sec)', borderTop: '1px solid var(--line)' }}>
            <span>✎</span> {renameLabel ?? S.editor.renameCurrentPlan}
          </div>
        )}
        {onNew && (
          <div className="popitem" onClick={(e) => { e.stopPropagation(); onNew() }}
            style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '9px 12px', color: 'var(--sec)', borderTop: '1px solid var(--line)' }}>
            <span style={{ color: 'var(--ink)' }}>＋</span> {newLabel ?? S.editor.new}
          </div>
        )}
        {actions?.map((action) => (
          <div key={action.label} className="popitem" onClick={(e) => { e.stopPropagation(); void action.onClick() }}
            style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '9px 12px', color: action.tone === 'danger' ? 'var(--bad)' : action.tone === 'success' ? 'var(--ok)' : 'var(--sec)', borderTop: '1px solid var(--line)', fontWeight: 600 }}>
            {action.icon} {action.label}
          </div>
        ))}
      </div>
    </>,
    document.body,
  )
}

function StartDateControl({ startDate, locked, lockedHint, saving, onApply }: {
  startDate: string
  locked: boolean
  lockedHint?: string
  saving: boolean
  onApply: (startDate: string) => Promise<void>
}) {
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState(startDate)
  const [applying, setApplying] = useState(false)
  const disabled = locked || saving || applying

  return (
    <span style={{ position: 'relative' }}>
      <button type="button" disabled={disabled}
        title={locked ? lockedHint ?? S.editor.calendarLocked : undefined}
        onClick={() => { setDraft(startDate); setOpen((value) => !value) }} style={{
          background: 'transparent', color: disabled ? 'var(--faint)' : 'var(--sec)', border: '1px solid var(--bd)',
          height: 28, boxSizing: 'border-box', borderRadius: 'var(--r-md)', padding: '0 10px', fontFamily: 'var(--font-sans)', fontWeight: 600, fontSize: 12,
          cursor: disabled ? 'not-allowed' : 'pointer', lineHeight: 1,
        }}>
        {S.editor.startDateCompact(mmdd(startDate))}
      </button>
      {open && !locked && (
        <>
          <span onClick={() => setOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 70 }} />
          <span style={{
            position: 'absolute', top: '100%', right: 0, marginTop: 7, zIndex: 80, width: 340, boxSizing: 'border-box',
            display: 'grid', gap: 'var(--sp-md)', padding: 'var(--sp-base)', background: 'var(--panel-bg)', border: '1px solid var(--bd)',
            borderRadius: 'var(--r-md)', boxShadow: 'var(--elev-modal)',
          }}>
            <span style={{ color: 'var(--mut)', fontSize: 12, fontWeight: 600 }}>{S.editor.startDateDayOne}</span>
            <WeekdayDateSelector value={draft} onChange={setDraft} compact />
            <span style={{ color: 'var(--mut)', fontSize: 11 }}>{S.editor.weekdayShortcutHint}</span>
            <span style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--sp-sm)' }}>
              <button type="button" onClick={() => setDraft((value) => shiftISODate(value, 1))} style={{ ...smallButton, color: 'var(--sec)' }}>{S.editor.shiftOneDay}</button>
              <button type="button" disabled={applying || draft === startDate} onClick={() => {
                setApplying(true)
                void onApply(draft).then(() => setOpen(false)).catch(() => undefined).finally(() => setApplying(false))
              }} style={{ ...smallButton, background: 'var(--txt)', color: 'var(--page-bg)', borderColor: 'var(--txt)', opacity: (applying || draft === startDate) ? 0.5 : 1 }}>
                {applying ? S.editor.applying : S.editor.apply}
              </button>
            </span>
          </span>
        </>
      )}
    </span>
  )
}

const smallButton: React.CSSProperties = {
  minHeight: 32,
  padding: '0 12px',
  border: '1px solid var(--bd)',
  borderRadius: 'var(--r-md)',
  background: 'transparent',
  fontFamily: 'var(--font-sans)',
  fontWeight: 600,
  cursor: 'pointer',
}

export function TopBar(p: Props) {
  const [menu, setMenu] = useState<'student' | 'plan' | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const studentAnchorRef = useRef<HTMLSpanElement>(null)
  const planAnchorRef = useRef<HTMLSpanElement>(null)
  const connected = !!p.students
  const close = () => setMenu(null)

  return (
    <div
      className="plan-context-bar"
      data-plan-context-bar=""
      aria-label={S.editor.planContext}
      style={{
        height: 38,
        flex: '0 0 38px',
        flexWrap: 'nowrap',
        overflowX: 'auto',
        overflowY: 'hidden',
        whiteSpace: 'nowrap',
      }}
    >
      {p.onBackToBoard && (
        <>
          <button
            type="button"
            className="plan-context-back"
            onClick={() => { void p.onBackToBoard?.() }}
          >
            {S.editor.backToOverview}
          </button>
          <span className="plan-context-divider" aria-hidden="true" />
        </>
      )}
      <span ref={studentAnchorRef} style={pill} onClick={connected ? (e) => { e.stopPropagation(); setMenu(menu === 'student' ? null : 'student') } : undefined}>
        {p.studentName} <span style={caret}>▼</span>
        {connected && (
          <Dropdown open={menu === 'student'} anchor={studentAnchorRef.current} onClose={close} options={p.students!} currentId={p.currentStudentId}
            onPick={(id) => { close(); void p.onSwitchStudent?.(id) }}
            onRenameCurrent={p.onRenameStudent ? () => { close(); p.onRenameStudent!() } : undefined}
            renameLabel={S.editor.renameStudent} />
        )}
      </span>

      <StudentPlanCursorBadges cursor={p.studentPlanCursor} />

      <span ref={planAnchorRef} style={pill} onClick={connected ? (e) => { e.stopPropagation(); setMenu(menu === 'plan' ? null : 'plan') } : undefined}>
        {p.planName} <span style={caret}>▼</span>
        {connected && (
          <Dropdown open={menu === 'plan'} anchor={planAnchorRef.current} onClose={close} options={p.plans ?? []} currentId={p.currentPlanId}
            onPick={(id) => { close(); void p.onSwitchPlan?.(id) }} onNew={p.onNewPlan ? () => { close(); void p.onNewPlan!() } : undefined} newLabel={S.editor.newPlan}
            onRenameCurrent={p.onRenamePlan ? () => { close(); p.onRenamePlan!() } : undefined}
            renameLabel={S.editor.renameCurrentPlan}
            actions={[
              ...(p.currentPlanStatus === 'published' && p.onMarkComplete
                ? [{ label: S.editor.markCompleted, tone: 'success' as const, icon: '✓', onClick: () => { close(); return p.onMarkComplete!() } }]
                : []),
              ...(p.onBackfillHistory
                ? [{ label: S.editor.backfillPastTraining, tone: 'neutral' as const, icon: '↺', onClick: () => { close(); return p.onBackfillHistory!() } }]
                : []),
              ...(p.currentPlanStatus === 'draft' && p.onDeleteCurrentDraft
                ? [{ label: S.editor.deleteCurrentDraft, tone: 'danger' as const, icon: S.editor.deleteGlyph, onClick: () => { close(); return p.onDeleteCurrentDraft!() } }]
                : []),
            ]} />
        )}
      </span>

      {(p.totalShiftDays ?? 0) > 0 && (
        <span data-plan-shift-notice="" style={{
          display: 'inline-flex', alignItems: 'center', padding: '5px 10px',
          background: 'var(--warn-soft)', color: 'var(--warn)', border: '1px solid var(--warn)',
          borderRadius: 'var(--r-sm)', fontSize: 11, fontWeight: 600, lineHeight: 1, whiteSpace: 'nowrap',
        }}>
          {S.editor.studentShifted(p.totalShiftDays ?? 0)}
        </span>
      )}
      <span className="plan-context-spacer" />
      {p.onNewExercise && (
        <button onClick={p.onNewExercise} disabled={p.saving} style={{
          background: 'transparent', color: 'var(--sec)', border: '1px solid var(--bd)',
          height: 28, borderRadius: 'var(--r-sm)', padding: '0 10px', fontFamily: 'var(--font-sans)', fontWeight: 600, fontSize: 12,
          cursor: p.saving ? 'default' : 'pointer', lineHeight: 1, opacity: p.saving ? 0.6 : 1,
        }}>
          {S.editor.addExercise}
        </button>
      )}
      {p.onImport && (
        <>
          <input
            ref={fileRef}
            type="file"
            accept=".xlsx"
            style={{ display: 'none' }}
            onChange={(e) => {
              const file = e.currentTarget.files?.[0]
              e.currentTarget.value = ''
              if (file) void p.onImport?.(file)
            }}
          />
          <button onClick={() => fileRef.current?.click()} disabled={p.saving} style={{
            background: 'transparent', color: 'var(--sec)', border: '1px solid var(--bd)',
            height: 28, borderRadius: 'var(--r-sm)', padding: '0 10px', fontFamily: 'var(--font-sans)', fontWeight: 600, fontSize: 12,
            cursor: p.saving ? 'default' : 'pointer', lineHeight: 1, opacity: p.saving ? 0.6 : 1,
          }}>
            {S.editor.importXlsx}
          </button>
        </>
      )}
      {p.planStartDate && p.onChangeStartDate && (
        <StartDateControl startDate={p.planStartDate} locked={!!p.calendarLocked} lockedHint={p.calendarLockedHint} saving={!!p.saving} onApply={p.onChangeStartDate} />
      )}
      {(p.issueCount ?? 0) > 0 && (
        <button onClick={p.onJumpIssue} title={p.issueHint} style={{
          height: 28, display: 'inline-flex', alignItems: 'center', gap: 6, padding: '0 9px',
          background: 'var(--warn-soft)', color: 'var(--warn)', border: '1px solid var(--warn)',
          borderRadius: 'var(--r-sm)', fontSize: 11, fontWeight: 600, cursor: 'pointer', lineHeight: 1,
        }}>
          {S.editor.issuesToReview(p.issueCount ?? 0)}
        </button>
      )}
      {p.onSave && (
        <button onClick={p.onSave} disabled={p.saving} style={{
          background: 'transparent', color: 'var(--sec)', border: '1px solid var(--bd)',
          height: 28, borderRadius: 'var(--r-sm)', padding: '0 10px', fontFamily: 'var(--font-sans)', fontWeight: 600, fontSize: 12,
          cursor: p.saving ? 'default' : 'pointer', lineHeight: 1, opacity: p.saving ? 0.6 : 1,
        }}>
          {p.saving ? S.editor.saving : (p.published ? S.editor.updatePlan : S.editor.saveDraft)}
        </button>
      )}
      <button
        onClick={p.onPublish}
        disabled={p.readOnly || p.published || p.saving}
        title={p.readOnly ? S.editor.historicalReadOnlyHint : p.published ? S.editor.publishedUpdateHint : undefined}
        style={{
          background: p.published ? 'transparent' : 'var(--ink)', color: p.published ? 'var(--ok)' : 'var(--white)',
          height: 28, border: p.published ? '1px solid var(--ok)' : '1px solid var(--ink)', borderRadius: 'var(--r-sm)', padding: '0 12px',
          fontFamily: 'var(--font-sans)', fontWeight: 600, fontSize: 12,
          cursor: (p.readOnly || p.published || p.saving) ? 'default' : 'pointer', lineHeight: 1,
          opacity: p.readOnly ? 0.55 : p.published ? 0.75 : (p.saving ? 0.6 : 1),
        }}
      >
        {p.readOnly ? S.editor.historicalReadOnly : p.published ? S.editor.publishedIrrevocable : S.editor.publishToStudent}
      </button>
      {p.published && <span className="plan-published-badge">{S.common.published}</span>}
      <span className="plan-autosave-status" role="status">
        <span className={p.published ? 'published' : ''} aria-hidden="true" />
        {p.statusText}
      </span>
    </div>
  )
}
