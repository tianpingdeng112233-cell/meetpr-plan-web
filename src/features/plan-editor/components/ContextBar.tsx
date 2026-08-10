interface Props {
  visible: boolean
  dayLabel: string
  canCopyPrev: boolean
  copyDisabledHint?: string
  copyLabel: string
  copyDone: boolean
  selectedRowLabel: string
  hasRowClipboard: boolean
  onCopyPrev: () => void
  onPasteRow: () => void
  onClearDay: () => void
  onClose: () => void
}

export function ContextBar(p: Props) {
  return (
    <div className="selected-context-bar" data-selected-context="" hidden={!p.visible}>
      <span className="t-mono-label">SELECTED</span>
      <b>{p.dayLabel}</b>
      <span
        className={`ctxbtn${p.copyDone ? ' success' : ''}${p.canCopyPrev ? '' : ' disabled'}`}
        onClick={p.onCopyPrev}
        title={!p.canCopyPrev ? p.copyDisabledHint : undefined}
      >
        {p.copyLabel}
      </span>
      <span className="selected-context-divider" />
      {p.selectedRowLabel && (
        <span className="selected-row-label">{p.selectedRowLabel}</span>
      )}
      {p.hasRowClipboard && (
        <span className="ctxbtn" onClick={p.onPasteRow}>粘贴动作</span>
      )}
      <span className="ctxbtn danger" onClick={p.onClearDay}>清空本日</span>
      <span className="selected-context-spacer" />
      <span className="selected-context-close" onClick={p.onClose}>✕ 取消选择</span>
    </div>
  )
}
