import { compactTonnage, type WeekSummary, type WeekTrend } from '../weeklySummary'
import { fmt, S } from '../../../i18n/strings'

interface Props {
  weekNumber: number
  summary: WeekSummary
  totalSetsTrend: WeekTrend | null
  tonnageTrend: WeekTrend | null
}

function exactKg(kg: number): string {
  return `${fmt.number(kg, 2)} kg`
}

function trendLabel(trend: WeekTrend): string {
  if (trend.direction === 'new') return S.editor.newTrend
  const arrow = trend.direction === 'up' ? '↑' : trend.direction === 'down' ? '↓' : '→'
  const percent = trend.percent ?? 0
  const value = Math.abs(percent) < 0.05 ? '0' : Math.abs(percent).toFixed(1)
  if (trend.direction === 'flat' && percent < -0.05) return `${arrow}−${value}%`
  if (trend.direction === 'flat' && percent > 0.05) return `${arrow}+${value}%`
  return `${arrow}${value}%`
}

function trendDetail(trend: WeekTrend | null): string {
  return trend ? S.editor.versusLastWeek(trendLabel(trend)) : ''
}

export function WeekCapacitySummary({ weekNumber, summary, totalSetsTrend, tonnageTrend }: Props) {
  const tooltipId = `week-capacity-tooltip-${weekNumber}`
  const mainSets = summary.squatSets + summary.benchSets + summary.deadliftSets + summary.otherMainSets
  return (
    <span className="week-capacity" tabIndex={0} aria-describedby={tooltipId} data-week-summary="">
      <span className="week-capacity-plain">{S.editor.capacityPlain(mainSets, summary.auxiliarySets, compactTonnage(summary.tonnage))}</span>
      <span id={tooltipId} className="week-capacity-tooltip" role="tooltip">
        <strong>{S.editor.capacityTitle(weekNumber)}</strong>
        <span>{S.editor.mainCapacity(summary.squatSets, summary.benchSets, summary.deadliftSets, summary.otherMainSets)}</span>
        <span>{S.editor.accessoryCapacity(summary.auxiliarySets)}</span>
        <span>{S.editor.totalSetsCapacity(summary.totalSets, trendDetail(totalSetsTrend))}</span>
        <span>{S.editor.tonnageCapacity(exactKg(summary.tonnage), trendDetail(tonnageTrend))}</span>
        <small>{S.editor.capacityMethod}</small>
      </span>
    </span>
  )
}
