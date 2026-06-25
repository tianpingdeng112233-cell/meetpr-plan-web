import { useState } from 'react'

interface Option { id: string; label: string; tag?: string }

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
  onLogout?: () => void
}

const pill: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 7, padding: '5px 10px',
  border: '1px solid var(--border)', borderRadius: 8, background: 'var(--surface-1)',
  fontWeight: 600, fontSize: 13, cursor: 'pointer', position: 'relative',
}
const caret: React.CSSProperties = { color: 'var(--fg-tertiary)', fontSize: 9 }
const label: React.CSSProperties = { fontSize: 11, color: 'var(--fg-tertiary)' }

function Dropdown({ open, options, currentId, onPick, onNew, newLabel }: {
  open: boolean; options: Option[]; currentId?: string; onPick: (id: string) => void; onNew?: () => void; newLabel?: string
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
          <span style={{ flex: 1 }}>{o.label}</span>
          {o.tag && <span style={{ fontSize: 10, color: 'var(--fg-tertiary)' }}>{o.tag}</span>}
        </div>
      ))}
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
            onPick={(id) => { close(); p.onSwitchPlan?.(id) }} onNew={p.onNewPlan ? () => { close(); p.onNewPlan!() } : undefined} newLabel="新建计划" />
        )}
      </span>

      <span style={{ flex: 1 }} />

      {p.onLogout && <span onClick={p.onLogout} style={{ cursor: 'pointer', color: 'var(--fg-tertiary)', fontSize: 12, padding: '4px 8px' }}>退出</span>}
      <span style={{
        display: 'inline-flex', alignItems: 'center', gap: 8, fontFamily: 'var(--font-mono)', fontSize: 11,
        letterSpacing: '.03em', color: p.published ? 'var(--green)' : 'var(--fg-secondary)',
      }}>
        <span style={{ width: 7, height: 7, borderRadius: '50%', background: p.published ? 'var(--green)' : 'var(--fg-tertiary)' }} />
        <span>{p.statusText}</span>
      </span>
      <button onClick={p.onPublish} style={{
        background: p.published ? 'transparent' : '#fff', color: p.published ? '#fff' : '#000',
        border: '1px solid #fff', borderRadius: 10, padding: '9px 18px', fontFamily: 'var(--font-sans)',
        fontWeight: 600, fontSize: 13, cursor: 'pointer', lineHeight: 1,
      }}>
        {p.published ? '已发布 · 撤回' : '发布给学员'}
      </button>
      {backdrop}
    </div>
  )
}
