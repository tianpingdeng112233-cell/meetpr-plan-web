interface Props {
  savedAt: string
  source?: 'local' | 'remote'
  onRestore: () => void
  onDiscard: () => void
}

function savedTime(iso: string): string {
  try {
    return new Intl.DateTimeFormat(resolveLocale() === 'zh' ? 'zh-CN' : 'en-US', {
      month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit',
    }).format(new Date(iso))
  } catch {
    return iso
  }
}

const action: React.CSSProperties = {
  minHeight: 28,
  padding: '4px 11px',
  border: '1px solid var(--bd)',
  borderRadius: 'var(--r-md)',
  color: 'var(--txt)',
  background: 'var(--tint)',
  font: '600 12px var(--font-sans)',
  cursor: 'pointer',
}

export function DraftMirrorBanner({ savedAt, source = 'local', onRestore, onDiscard }: Props) {
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
      color: 'var(--sec)',
      background: 'var(--warn-soft)',
      borderBottom: '1px solid var(--bd)',
      boxShadow: 'inset 3px 0 0 var(--warn)',
      fontSize: 12,
    }}>
      <span style={{ color: 'var(--warn)', fontWeight: 700 }}>
        {source === 'remote' ? S.editor.remoteDraft : S.editor.localDraft}
      </span>
      <span style={{ flex: 1 }}>
        {source === 'remote'
          ? S.editor.unsavedRemoteDraft(savedTime(savedAt))
          : S.editor.unsavedLocalDraft(savedTime(savedAt))}
      </span>
      <button type="button" onClick={onRestore} style={{ ...action, borderColor: 'var(--warn)' }}>{S.editor.restore}</button>
      <button type="button" onClick={onDiscard} style={action}>{S.editor.discard}</button>
    </div>
  )
}
import { resolveLocale, S } from '../../../i18n/strings'
