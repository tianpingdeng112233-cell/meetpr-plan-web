import type { PlanCellInfo } from '../selectionModel'

export function FormulaBar({ cell }: { cell: PlanCellInfo | null }) {
  return (
    <div className="plan-formula-bar" data-formula-bar="" aria-label="单元格公式栏">
      <kbd data-cell-reference="">{cell?.reference ?? '—'}</kbd>
      <span className="plan-formula-label">（{cell?.label ?? '未选中单元格'}）</span>
      <output>{cell?.value ?? '/'}</output>
      <span className="plan-formula-hint">Esc 取消选择</span>
    </div>
  )
}
