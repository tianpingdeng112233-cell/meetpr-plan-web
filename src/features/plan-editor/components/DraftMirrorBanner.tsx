interface Props {
  savedAt: string
  onRestore: () => void
  onDiscard: () => void
}

function savedTime(iso: string): string {
  try {
    return new Intl.DateTimeFormat('zh-CN', {
      month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit',
    }).format(new Date(iso))
  } catch {
    return iso
  }
}

const action: React.CSSProperties = {
  minHeight: 28,
  padding: '4px 11px',
  border: '1px solid var(--border-strong)',
  borderRadius: 'var(--r-md)',
  color: 'var(--fg-primary)',
  background: 'var(--surface-3)',
  font: '600 12px var(--font-sans)',
  cursor: 'pointer',
}

export function DraftMirrorBanner({ savedAt, onRestore, onDiscard }: Props) {
  return (
    <div role="status" data-testid="draft-mirror-banner" style={{
      minHeight: 42,
      padding: '6px var(--sp-base)',
      boxSizing: 'border-box',
      display: 'flex',
      flexWrap: 'wrap',
      alignItems: 'center',
      gap: 'var(--sp-sm)',
      flex: '0 0 auto',
      zIndex: 17,
      color: 'var(--fg-secondary)',
      background: 'var(--amber-soft)',
      borderBottom: '1px solid var(--border-strong)',
      boxShadow: 'inset 3px 0 0 var(--amber)',
      fontSize: 12,
    }}>
      <span style={{ color: 'var(--amber)', fontWeight: 700 }}>本地草稿</span>
      <span style={{ flex: 1 }}>检测到 {savedTime(savedAt)} 的未保存本地草稿</span>
      <button type="button" onClick={onRestore} style={{ ...action, borderColor: 'var(--amber)' }}>恢复</button>
      <button type="button" onClick={onDiscard} style={action}>丢弃</button>
    </div>
  )
}
