import type { PlanStatus } from '../../../api/types'
import { S } from '../../../i18n/strings'
import { addDays, mdLabel } from '../mapping'

export function CycleHeading({ previous = false, name, start, count, status, collapsed = false }: {
  previous?: boolean; name: string; start: string | null; count: number; status?: PlanStatus; collapsed?: boolean
}) {
  return <div className="cycle-heading">
    <span className={`cycle-label${previous ? ' previous' : ''}`}>{previous ? S.block.previousCycle : S.block.currentCycle}</span>
    <strong>{name}</strong>
    <span className="cycle-meta">{S.block.cycleMeta(start ? mdLabel(addDays(start, 0)) : '—', count, S.common[status ?? 'draft'])}{collapsed ? ` · ${S.block.cycleCollapsed}` : ''}</span>
    {previous && <span className="cycle-readonly">{S.block.cycleReadOnly}</span>}
  </div>
}

export function CycleComparison({ enabled, layout, rows, children }: {
  enabled: boolean; layout: string; rows: number; children: React.ReactNode
}) {
  return enabled ? <div className="cycle-comparison" data-cycle-layout={layout}
    style={{ '--cycle-rows': rows + 2 } as React.CSSProperties}>{children}</div> : <>{children}</>
}
