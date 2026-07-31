interface Props {
  visible: boolean
  dayLabel: string
  selectedDayCount?: number
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
  const dayCount = p.selectedDayCount ?? 1
  const multipleDays = dayCount > 1
  return (
    <div className="selected-context-bar" data-selected-context="" hidden={!p.visible}>
      <span className="t-mono-label">SELECTED</span>
      <b>{multipleDays ? `已选 ${dayCount} 天 · ${p.dayLabel}` : p.dayLabel}</b>
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
        <span className="ctxbtn success" onClick={p.onUnsetRest}>{multipleDays ? `改为训练日(${dayCount} 天)` : '改为训练日'}</span>
      ) : (
        <>
          <span className={`ctxbtn${p.hasLockedRows ? ' disabled' : ''}`} onClick={p.onSetRest}
            title={p.hasLockedRows ? '该日含学员已打卡动作,不能转为休息日' : undefined}>
            {multipleDays ? `设为休息(${dayCount} 天)` : '设为休息'}
          </span>
          <span className="ctxbtn danger" onClick={p.onClearDay}>{multipleDays ? `清空 ${dayCount} 天` : '清空本日'}</span>
        </>
      )}
      <span className="selected-context-spacer" />
      <span className="selected-context-close" onClick={p.onClose}>✕ 取消选择</span>
    </div>
  )
}
