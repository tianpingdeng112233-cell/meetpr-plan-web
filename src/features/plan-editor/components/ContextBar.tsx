interface Props {
  visible: boolean
  dayLabel: string
  isRest: boolean
  canCopyPrev: boolean
  copyDisabledHint?: string
  hasLockedRows: boolean
  copyLabel: string
  copyDone: boolean
  selectedRowLabel: string
  hasRowClipboard: boolean
  onCopyPrev: () => void
  onPasteRow: () => void
  onSetRest: () => void
  onUnsetRest: () => void
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
      {p.isRest ? (
        <span className="ctxbtn success" onClick={p.onUnsetRest}>改为训练日</span>
      ) : (
        <>
          <span className={`ctxbtn${p.hasLockedRows ? ' disabled' : ''}`} onClick={p.onSetRest}
            title={p.hasLockedRows ? '该日含学员已打卡动作,不能转为休息日' : undefined}>设为休息</span>
          <span className="ctxbtn danger" onClick={p.onClearDay}>清空本日</span>
        </>
      )}
      <span className="selected-context-spacer" />
      <span className="selected-context-close" onClick={p.onClose}>✕ 取消选择</span>
    </div>
  )
}
