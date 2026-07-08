import { useRef, useState } from 'react'

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
  onSwitchStudent?: (id: string) => void
  plans?: Option[]
  currentPlanId?: string
  onSwitchPlan?: (id: string) => void
  onNewPlan?: () => void
  /** Rename the current plan (plan dropdown's ✎ row). */
  onRenamePlan?: () => void
  onLogout?: () => void
  onSave?: () => void
  saving?: boolean
  onImport?: (file: File) => void | Promise<void>
  onNewExercise?: () => void
  /** Rows needing attention (unbound / no sets); click cycles to the next one. */
  issueCount?: number
  issueHint?: string
  onJumpIssue?: () => void
}

const pill: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 7, padding: '5px 10px',
  border: '1px solid var(--border)', borderRadius: 8, background: 'var(--surface-1)',
  fontWeight: 600, fontSize: 13, cursor: 'pointer', position: 'relative',
}
const caret: React.CSSProperties = { color: 'var(--fg-tertiary)', fontSize: 9 }
const label: React.CSSProperties = { fontSize: 11, color: 'var(--fg-tertiary)' }

function Dropdown({ open, options, currentId, onPick, onNew, newLabel, onRenameCurrent }: {
  open: boolean; options: Option[]; currentId?: string; onPick: (id: string) => void; onNew?: () => void; newLabel?: string
  onRenameCurrent?: () => void
}) {
  if (!open) return null
  return (
    <div style={{
      position: 'absolute', top: '100%', left: 0, marginTop: 6, minWidth: 200, zIndex: 80,
      background: 'var(--surface-2)', border: '1px solid var(--border-strong)', borderRadius: 10,
      overflow: 'hidden', boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
    }}>
      {options.map((o) => (
        <div key={o.id} className="popitem" onClick={(e) => { e.stopPropagation(); onPick(o.id) }}
          style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', color: o.id === currentId ? '#fff' : 'var(--fg-secondary)', fontWeight: o.id === currentId ? 600 : 400 }}>
          {o.id === currentId && <span style={{ color: 'var(--brand-red)', fontSize: 10 }}>●</span>}
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
          <span>✎</span> 重命名当前计划
        </div>
      )}
      {onNew && (
        <div className="popitem" onClick={(e) => { e.stopPropagation(); onNew() }}
          style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '9px 12px', color: 'var(--fg-secondary)', borderTop: '1px solid var(--border)' }}>
          <span style={{ color: '#fff' }}>＋</span> {newLabel ?? '新建'}
        </div>
      )}
    </div>
  )
}

export function TopBar(p: Props) {
  const [menu, setMenu] = useState<'student' | 'plan' | null>(null)
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
      background: '#000', borderBottom: '1px solid var(--border)', flex: '0 0 auto', zIndex: 20,
    }}>
      <span style={{ fontWeight: 900, fontSize: 15, letterSpacing: '-0.01em' }}>MeetPR</span>
      <span className="t-mono-label" style={{ fontSize: 10, letterSpacing: '.1em', color: 'var(--fg-tertiary)' }}>COACH / 计划编写</span>
      <span style={{ width: 1, height: 18, background: 'var(--border)' }} />

      <span style={label}>学员</span>
      <span style={pill} onClick={connected ? (e) => { e.stopPropagation(); setMenu(menu === 'student' ? null : 'student') } : undefined}>
        {p.studentName} <span style={caret}>▼</span>
        {connected && (
          <Dropdown open={menu === 'student'} options={p.students!} currentId={p.currentStudentId}
            onPick={(id) => { close(); p.onSwitchStudent?.(id) }} />
        )}
      </span>

      <span style={label}>计划</span>
      <span style={pill} onClick={connected ? (e) => { e.stopPropagation(); setMenu(menu === 'plan' ? null : 'plan') } : undefined}>
        {p.planName} <span style={caret}>▼</span>
        {connected && (
          <Dropdown open={menu === 'plan'} options={p.plans ?? []} currentId={p.currentPlanId}
            onPick={(id) => { close(); p.onSwitchPlan?.(id) }} onNew={p.onNewPlan ? () => { close(); p.onNewPlan!() } : undefined} newLabel="新建计划"
            onRenameCurrent={p.onRenamePlan ? () => { close(); p.onRenamePlan!() } : undefined} />
        )}
      </span>

      <span style={{ flex: 1 }} />

      {p.onLogout && <span onClick={p.onLogout} style={{ cursor: 'pointer', color: 'var(--fg-tertiary)', fontSize: 12, padding: '4px 8px' }}>退出</span>}
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
        title={p.published ? '已发布给学员,不可撤回;编辑后点「更新计划」推送修改' : undefined}
        style={{
          background: p.published ? 'transparent' : '#fff', color: p.published ? 'var(--green)' : '#000',
          border: p.published ? '1px solid var(--green)' : '1px solid #fff', borderRadius: 10, padding: '9px 18px',
          fontFamily: 'var(--font-sans)', fontWeight: 600, fontSize: 13,
          cursor: (p.published || p.saving) ? 'default' : 'pointer', lineHeight: 1,
          opacity: p.published ? 0.75 : (p.saving ? 0.6 : 1),
        }}
      >
        {p.published ? '已发布' : '发布给学员'}
      </button>
      {backdrop}
    </div>
  )
}
