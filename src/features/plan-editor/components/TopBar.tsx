import { useRef, useState } from 'react'
import type { PlanStatus } from '../../../api/types'
import { shiftISODate } from '../mapping'
import { mmdd, WeekdayDateSelector } from './PlanCalendarControls'
import { ChangePasswordDialog } from '../../workspace/ChangePasswordDialog'

interface Option { id: string; label: string; tag?: string; sub?: string }

interface Props {
  studentName: string
  planName: string
  published: boolean
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
  /**
   * Session teardown that must bypass the unsaved-changes guard: used after a
   * password change, when the server has already revoked this session and the
   * work in progress can no longer be saved anyway.
   */
  onSessionInvalidated?: () => void | Promise<void>
  /**
   * Unsaved-changes preflight, run before an action that will end the session
   * while saving is still possible. Returns false if the coach backs out.
   */
  onConfirmLeave?: () => Promise<boolean>
  currentPlanStatus?: PlanStatus
  onDeleteCurrentDraft?: () => void | Promise<void>
  onMarkComplete?: () => void | Promise<void>
  /** Backfill past, unlogged sessions of the current plan as assumed-complete. */
  onBackfillHistory?: () => void | Promise<void>
  /** Rename the current plan (plan dropdown's ✎ row). */
  onRenamePlan?: () => void
  /** Rename the selected student (student dropdown's ✎ row). */
  onRenameStudent?: () => void
  onLogout?: () => void | Promise<void>
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
}

const pill: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 7, padding: '5px 10px',
  border: '1px solid var(--border)', borderRadius: 8, background: 'var(--surface-1)',
  fontWeight: 600, fontSize: 13, cursor: 'pointer', position: 'relative',
}
const caret: React.CSSProperties = { color: 'var(--fg-tertiary)', fontSize: 9 }
const label: React.CSSProperties = { fontSize: 11, color: 'var(--fg-tertiary)' }

export interface DropdownAction { label: string; tone: 'danger' | 'success' | 'neutral'; icon: string; onClick: () => void | Promise<void> }

function Dropdown({ open, options, currentId, onPick, onNew, newLabel, onRenameCurrent, renameLabel, actions }: {
  open: boolean; options: Option[]; currentId?: string; onPick: (id: string) => void | Promise<void>; onNew?: () => void | Promise<void>; newLabel?: string
  onRenameCurrent?: () => void; renameLabel?: string
  actions?: DropdownAction[]
}) {
  if (!open) return null
  return (
    <div style={{
      position: 'absolute', top: '100%', left: 0, marginTop: 6, minWidth: 200, zIndex: 80,
      background: 'var(--surface-2)', border: '1px solid var(--border-strong)', borderRadius: 10,
      overflow: 'hidden', boxShadow: 'var(--elev-modal)',
    }}>
      {options.map((o) => (
        <div key={o.id} className="popitem" onClick={(e) => { e.stopPropagation(); void onPick(o.id) }}
          style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', color: o.id === currentId ? 'var(--fg-primary)' : 'var(--fg-secondary)', fontWeight: o.id === currentId ? 600 : 400 }}>
          {o.id === currentId && <span style={{ color: 'var(--ink)', fontSize: 10 }}>●</span>}
          <span style={{ flex: 1, minWidth: 0 }}>
            {o.label}
            {o.sub && <span style={{ display: 'block', fontSize: 10, fontWeight: 400, color: 'var(--fg-tertiary)', fontFamily: 'var(--font-mono)' }}>{o.sub}</span>}
          </span>
          {o.tag && <span style={{ fontSize: 10, color: 'var(--fg-tertiary)', flex: 'none' }}>{o.tag}</span>}
        </div>
      ))}
      {onRenameCurrent && (
        <div className="popitem" onClick={(e) => { e.stopPropagation(); onRenameCurrent() }}
          style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '9px 12px', color: 'var(--fg-secondary)', borderTop: '1px solid var(--border)' }}>
          <span>✎</span> {renameLabel ?? '重命名当前计划'}
        </div>
      )}
      {onNew && (
        <div className="popitem" onClick={(e) => { e.stopPropagation(); onNew() }}
          style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '9px 12px', color: 'var(--fg-secondary)', borderTop: '1px solid var(--border)' }}>
          <span style={{ color: 'var(--ink)' }}>＋</span> {newLabel ?? '新建'}
        </div>
      )}
      {actions?.map((action) => (
        <div key={action.label} className="popitem" onClick={(e) => { e.stopPropagation(); void action.onClick() }}
          style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '9px 12px', color: action.tone === 'danger' ? 'var(--brand-red)' : action.tone === 'success' ? 'var(--green)' : 'var(--fg-secondary)', borderTop: '1px solid var(--border)', fontWeight: 600 }}>
          {action.icon} {action.label}
        </div>
      ))}
    </div>
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
        title={locked ? lockedHint ?? '已发布计划的周期与日期不可修改' : undefined}
        onClick={() => { setDraft(startDate); setOpen((value) => !value) }} style={{
          background: 'transparent', color: disabled ? 'var(--fg-disabled)' : 'var(--fg-secondary)', border: '1px solid var(--border-strong)',
          borderRadius: 'var(--r-md)', padding: '8px 12px', fontFamily: 'var(--font-sans)', fontWeight: 600, fontSize: 13,
          cursor: disabled ? 'not-allowed' : 'pointer', lineHeight: 1,
        }}>
        起始 {mmdd(startDate)} ▼
      </button>
      {open && !locked && (
        <>
          <span onClick={() => setOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 70 }} />
          <span style={{
            position: 'absolute', top: '100%', right: 0, marginTop: 7, zIndex: 80, width: 340, boxSizing: 'border-box',
            display: 'grid', gap: 'var(--sp-md)', padding: 'var(--sp-base)', background: 'var(--surface-2)', border: '1px solid var(--border-strong)',
            borderRadius: 'var(--r-md)', boxShadow: 'var(--elev-modal)',
          }}>
            <span style={{ color: 'var(--fg-tertiary)', fontSize: 12, fontWeight: 600 }}>开始日期（= Day 1）</span>
            <WeekdayDateSelector value={draft} onChange={setDraft} compact />
            <span style={{ color: 'var(--fg-tertiary)', fontSize: 11 }}>快捷选周几（选中即跳到今天起最近的该周几）</span>
            <span style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--sp-sm)' }}>
              <button type="button" onClick={() => setDraft((value) => shiftISODate(value, 1))} style={{ ...smallButton, color: 'var(--fg-secondary)' }}>后移 1 天</button>
              <button type="button" disabled={applying || draft === startDate} onClick={() => {
                setApplying(true)
                void onApply(draft).then(() => setOpen(false)).catch(() => undefined).finally(() => setApplying(false))
              }} style={{ ...smallButton, background: 'var(--fg-primary)', color: 'var(--bg)', borderColor: 'var(--fg-primary)', opacity: (applying || draft === startDate) ? 0.5 : 1 }}>
                {applying ? '应用中…' : '应用'}
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
  border: '1px solid var(--border-strong)',
  borderRadius: 'var(--r-md)',
  background: 'transparent',
  fontFamily: 'var(--font-sans)',
  fontWeight: 600,
  cursor: 'pointer',
}

export function TopBar(p: Props) {
  const [menu, setMenu] = useState<'student' | 'plan' | null>(null)
  const [passwordOpen, setPasswordOpen] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const connected = !!p.students
  const close = () => setMenu(null)

  // close menu on outside click
  const backdrop = menu ? (
    <div onClick={close} style={{ position: 'fixed', inset: 0, zIndex: 70 }} />
  ) : null

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 14, height: 48, padding: '0 16px',
      background: 'var(--card-bg)', borderBottom: '1px solid var(--border)', flex: '0 0 auto', zIndex: 20,
    }}>
      <span style={{ fontWeight: 900, fontSize: 15, letterSpacing: '-0.01em' }}>MeetPR</span>
      <span className="t-mono-label" style={{ fontSize: 10, letterSpacing: '.1em', color: 'var(--fg-tertiary)' }}>COACH / 计划编排</span>
      <span style={{ width: 1, height: 18, background: 'var(--border)' }} />

      <span style={label}>学员</span>
      <span style={pill} onClick={connected ? (e) => { e.stopPropagation(); setMenu(menu === 'student' ? null : 'student') } : undefined}>
        {p.studentName} <span style={caret}>▼</span>
        {connected && (
          <Dropdown open={menu === 'student'} options={p.students!} currentId={p.currentStudentId}
            onPick={(id) => { close(); void p.onSwitchStudent?.(id) }}
            onRenameCurrent={p.onRenameStudent ? () => { close(); p.onRenameStudent!() } : undefined}
            renameLabel="修改学员姓名" />
        )}
      </span>

      <span style={label}>计划</span>
      <span style={pill} onClick={connected ? (e) => { e.stopPropagation(); setMenu(menu === 'plan' ? null : 'plan') } : undefined}>
        {p.planName} <span style={caret}>▼</span>
        {connected && (
          <Dropdown open={menu === 'plan'} options={p.plans ?? []} currentId={p.currentPlanId}
            onPick={(id) => { close(); void p.onSwitchPlan?.(id) }} onNew={p.onNewPlan ? () => { close(); void p.onNewPlan!() } : undefined} newLabel="新建计划"
            onRenameCurrent={p.onRenamePlan ? () => { close(); p.onRenamePlan!() } : undefined}
            renameLabel="重命名当前计划"
            actions={[
              ...(p.currentPlanStatus === 'published' && p.onMarkComplete
                ? [{ label: '标记完成', tone: 'success' as const, icon: '✓', onClick: () => { close(); return p.onMarkComplete!() } }]
                : []),
              ...(p.onBackfillHistory
                ? [{ label: '补记过去训练', tone: 'neutral' as const, icon: '↺', onClick: () => { close(); return p.onBackfillHistory!() } }]
                : []),
              ...(p.currentPlanStatus === 'draft' && p.onDeleteCurrentDraft
                ? [{ label: '删除当前草稿', tone: 'danger' as const, icon: '🗑', onClick: () => { close(); return p.onDeleteCurrentDraft!() } }]
                : []),
            ]} />
        )}
      </span>

      <span style={{ flex: 1 }} />

      {p.onSessionInvalidated && <button type="button" onClick={() => setPasswordOpen(true)} style={{ cursor: 'pointer', color: 'var(--fg-tertiary)', fontSize: 12, padding: '4px 8px', background: 'transparent', border: 0, font: 'inherit' }}>改密码</button>}
      {p.onLogout && <span onClick={() => { void p.onLogout?.() }} style={{ cursor: 'pointer', color: 'var(--fg-tertiary)', fontSize: 12, padding: '4px 8px' }}>退出</span>}
      {(p.totalShiftDays ?? 0) > 0 && (
        <span data-plan-shift-notice="" style={{
          display: 'inline-flex', alignItems: 'center', padding: '5px 10px',
          background: 'var(--amber-soft)', color: 'var(--amber)', border: '1px solid var(--amber)',
          borderRadius: 999, fontSize: 11, fontWeight: 600, lineHeight: 1, whiteSpace: 'nowrap',
        }}>
          学员已整体顺延 {p.totalShiftDays} 天
        </span>
      )}
      {(p.issueCount ?? 0) > 0 && (
        <button onClick={p.onJumpIssue} title={p.issueHint} style={{
          display: 'inline-flex', alignItems: 'center', gap: 6, padding: '5px 10px',
          background: 'var(--amber-soft)', color: 'var(--amber)', border: '1px solid var(--amber)',
          borderRadius: 999, fontSize: 12, fontWeight: 600, cursor: 'pointer', lineHeight: 1,
        }}>
          ⚠ {p.issueCount} 处待核对
        </button>
      )}
      <span style={{
        display: 'inline-flex', alignItems: 'center', gap: 8, fontFamily: 'var(--font-mono)', fontSize: 11,
        letterSpacing: '.03em', color: p.published ? 'var(--green)' : 'var(--fg-secondary)',
      }}>
        <span style={{ width: 7, height: 7, borderRadius: '50%', background: p.published ? 'var(--green)' : 'var(--fg-tertiary)' }} />
        <span>{p.statusText}</span>
      </span>
      {p.onNewExercise && (
        <button onClick={p.onNewExercise} disabled={p.saving} style={{
          background: 'transparent', color: 'var(--fg-secondary)', border: '1px solid var(--border-strong)',
          borderRadius: 10, padding: '8px 13px', fontFamily: 'var(--font-sans)', fontWeight: 600, fontSize: 13,
          cursor: p.saving ? 'default' : 'pointer', lineHeight: 1, opacity: p.saving ? 0.6 : 1,
        }}>
          ＋ 动作
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
            background: 'transparent', color: 'var(--fg-secondary)', border: '1px solid var(--border-strong)',
            borderRadius: 10, padding: '8px 14px', fontFamily: 'var(--font-sans)', fontWeight: 600, fontSize: 13,
            cursor: p.saving ? 'default' : 'pointer', lineHeight: 1, opacity: p.saving ? 0.6 : 1,
          }}>
            导入 .xlsx
          </button>
        </>
      )}
      {p.planStartDate && p.onChangeStartDate && (
        <StartDateControl startDate={p.planStartDate} locked={!!p.calendarLocked} lockedHint={p.calendarLockedHint} saving={!!p.saving} onApply={p.onChangeStartDate} />
      )}
      {p.onSave && (
        <button onClick={p.onSave} disabled={p.saving} style={{
          background: 'transparent', color: 'var(--fg-secondary)', border: '1px solid var(--border-strong)',
          borderRadius: 10, padding: '8px 14px', fontFamily: 'var(--font-sans)', fontWeight: 600, fontSize: 13,
          cursor: p.saving ? 'default' : 'pointer', lineHeight: 1, opacity: p.saving ? 0.6 : 1,
        }}>
          {p.saving ? '保存中…' : (p.published ? '更新计划' : '保存草稿')}
        </button>
      )}
      <button
        onClick={p.onPublish}
        disabled={p.published || p.saving}
        title={p.published ? '已发布给学员；未打卡动作可通过「更新计划」调整' : undefined}
        style={{
          background: p.published ? 'transparent' : 'var(--ink)', color: p.published ? 'var(--green)' : 'var(--white)',
          border: p.published ? '1px solid var(--green)' : '1px solid var(--ink)', borderRadius: 10, padding: '9px 18px',
          fontFamily: 'var(--font-sans)', fontWeight: 600, fontSize: 13,
          cursor: (p.published || p.saving) ? 'default' : 'pointer', lineHeight: 1,
          opacity: p.published ? 0.75 : (p.saving ? 0.6 : 1),
        }}
      >
        {p.published ? '已发布 · 不可撤回' : '发布给学员'}
      </button>
      {backdrop}
      {p.onSessionInvalidated && (
        <ChangePasswordDialog
          open={passwordOpen}
          onClose={() => setPasswordOpen(false)}
          onSessionInvalidated={() => { setPasswordOpen(false); return p.onSessionInvalidated?.() }}
          onBeforeSubmit={p.onConfirmLeave}
        />
      )}
    </div>
  )
}
