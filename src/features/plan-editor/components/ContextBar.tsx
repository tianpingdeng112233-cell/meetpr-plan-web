interface Props {
  visible: boolean
  dayLabel: string
  selectedDayCount?: number
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
  const dayCount = p.selectedDayCount ?? 1
  const multipleDays = dayCount > 1
  return (
    <div className="selected-context-bar" data-selected-context="" hidden={!p.visible}>
      <span className="t-mono-label">SELECTED</span>
      <b>{multipleDays ? S.editor.selectedDays(dayCount, p.dayLabel) : p.dayLabel}</b>
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
        <span className="ctxbtn" onClick={p.onPasteRow}>{S.editor.pasteExercise}</span>
      )}
      <span className="ctxbtn danger" onClick={p.onClearDay}>{multipleDays ? S.editor.clearDays(dayCount) : S.editor.clearDay}</span>
      <span className="selected-context-spacer" />
      <span className="selected-context-close" onClick={p.onClose}>{S.editor.cancelSelection}</span>
    </div>
  )
}
import { S } from '../../../i18n/strings'
