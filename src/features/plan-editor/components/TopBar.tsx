interface Props {
  studentName: string
  planName: string
  published: boolean
  statusText: string
  onPublish: () => void
}

const pill: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 7, padding: '5px 10px',
  border: '1px solid var(--border)', borderRadius: 8, background: 'var(--surface-1)',
  fontWeight: 600, fontSize: 13, cursor: 'pointer',
}
const caret: React.CSSProperties = { color: 'var(--fg-tertiary)', fontSize: 9 }
const label: React.CSSProperties = { fontSize: 11, color: 'var(--fg-tertiary)' }

export function TopBar({ studentName, planName, published, statusText, onPublish }: Props) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 14, height: 48, padding: '0 16px',
      background: '#000', borderBottom: '1px solid var(--border)', flex: '0 0 auto', zIndex: 20,
    }}>
      <span style={{ fontWeight: 900, fontSize: 15, letterSpacing: '-0.01em' }}>MeetPR</span>
      <span className="t-mono-label" style={{ fontSize: 10, letterSpacing: '.1em', color: 'var(--fg-tertiary)' }}>
        COACH / 计划编写
      </span>
      <span style={{ width: 1, height: 18, background: 'var(--border)' }} />
      <span style={label}>学员</span>
      <span style={pill}>{studentName} <span style={caret}>▼</span></span>
      <span style={label}>计划</span>
      <span style={pill}>{planName} <span style={caret}>▼</span></span>
      <span style={{ flex: 1 }} />
      <span style={{
        display: 'inline-flex', alignItems: 'center', gap: 8,
        fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: '.03em',
        color: published ? 'var(--green)' : 'var(--fg-secondary)',
      }}>
        <span style={{ width: 7, height: 7, borderRadius: '50%', background: published ? 'var(--green)' : 'var(--fg-tertiary)' }} />
        <span>{statusText}</span>
      </span>
      <button
        onClick={onPublish}
        style={{
          background: published ? 'transparent' : '#fff',
          color: '#fff', border: '1px solid #fff', borderRadius: 10,
          padding: '9px 18px', fontFamily: 'var(--font-sans)', fontWeight: 600,
          fontSize: 13, cursor: 'pointer', lineHeight: 1,
          ...(published ? {} : { color: '#000' }),
        }}
      >
        {published ? '已发布 · 撤回' : '发布给学员'}
      </button>
    </div>
  )
}
