import type { PlanCellInfo } from '../selectionModel'
import { S } from '../../../i18n/strings'

export function FormulaBar({ cell }: { cell: PlanCellInfo | null }) {
  return (
    <div className="plan-formula-bar" data-formula-bar="" aria-label={S.editor.formulaBar}>
      <kbd data-cell-reference="">{cell?.reference ?? '—'}</kbd>
      <span className="plan-formula-label">（{cell?.label ?? S.editor.noCellSelected}）</span>
      <output>{cell?.value ?? '/'}</output>
      <span className="plan-formula-hint">{S.editor.cancelSelectionHint}</span>
    </div>
  )
}
