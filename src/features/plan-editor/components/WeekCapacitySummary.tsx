import type { WeekSummary, WeekTrend } from '../weeklySummary'

interface Props {
  weekNumber: number
  summary: WeekSummary
  totalSetsTrend: WeekTrend | null
  tonnageTrend: WeekTrend | null
}

function compactTonnage(kg: number): string {
  if (Math.abs(kg) < 1000) return `${kg.toLocaleString('zh-CN', { maximumFractionDigits: 1 })}kg`
  return `${(kg / 1000).toLocaleString('zh-CN', { maximumFractionDigits: 1 })}t`
}

function exactKg(kg: number): string {
  return `${kg.toLocaleString('zh-CN', { maximumFractionDigits: 2 })} kg`
}

function trendLabel(trend: WeekTrend): string {
  if (trend.direction === 'new') return '↑新增'
  const arrow = trend.direction === 'up' ? '↑' : trend.direction === 'down' ? '↓' : '→'
  const percent = trend.percent ?? 0
  const value = Math.abs(percent) < 0.05 ? '0' : Math.abs(percent).toFixed(1)
  if (trend.direction === 'flat' && percent < -0.05) return `${arrow}−${value}%`
  if (trend.direction === 'flat' && percent > 0.05) return `${arrow}+${value}%`
  return `${arrow}${value}%`
}

function trendDetail(trend: WeekTrend | null): string {
  return trend ? `（较上周 ${trendLabel(trend)}）` : ''
}

export function WeekCapacitySummary({ weekNumber, summary, totalSetsTrend, tonnageTrend }: Props) {
  const tooltipId = `week-capacity-tooltip-${weekNumber}`
  return (
    <span className="week-capacity" tabIndex={0} aria-describedby={tooltipId} data-week-summary="">
      <span className="week-capacity-main">主 S{summary.squatSets} B{summary.benchSets} D{summary.deadliftSets} 其{summary.otherMainSets}</span>
      <span>辅 {summary.auxiliarySets}</span>
      <span>总 {summary.totalSets}组{totalSetsTrend && <em>{trendLabel(totalSetsTrend)}</em>}</span>
      <span>吨位 {compactTonnage(summary.tonnage)}{tonnageTrend && <em>{trendLabel(tonnageTrend)}</em>}</span>
      <span id={tooltipId} className="week-capacity-tooltip" role="tooltip">
        <strong>第 {weekNumber} 周容量明细</strong>
        <span>主项：深蹲族 {summary.squatSets}组 · 卧推族 {summary.benchSets}组 · 硬拉族 {summary.deadliftSets}组 · 其他主项 {summary.otherMainSets}组</span>
        <span>辅助项：{summary.auxiliarySets}组</span>
        <span>总组数：{summary.totalSets}组 {trendDetail(totalSetsTrend)}</span>
        <span>吨位：{exactKg(summary.tonnage)} {trendDetail(tonnageTrend)}</span>
        <small>口径：组数按每行动作的组槽数计算（空公斤框、RPE、自重仍计组数）；吨位仅计入「kg 模式 + 重量可解析 + reps 可解析」的组，reps 取首个整数（如 8+ 取 8、6-8 取 6），reps 无数字（如 —）的行吨位记 0。</small>
      </span>
    </span>
  )
}
