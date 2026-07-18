import type { WeekSummary, WeekTrend } from '../weeklySummary'
import {
  classifySets, JTS_CLASSIFICATION_LABELS, JTS_PHASE_LABELS, JTS_VOLUME_BANDS,
  type JtsPhase, type JtsSetClassification,
} from '../jtsVolumeBands'
import type { LiftFamily } from '../../../api/types'

interface Props {
  weekNumber: number
  summary: WeekSummary
  totalSetsTrend: WeekTrend | null
  tonnageTrend: WeekTrend | null
  phase: JtsPhase | null
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

const LIFT_LABELS: Record<LiftFamily, string> = { squat: 'Squat', bench: 'Bench', deadlift: 'Deadlift' }

function classificationClass(classification: JtsSetClassification | null): string {
  if (classification === 'below_mev') return ' week-capacity-lift-below'
  if (classification === 'above_mrv') return ' week-capacity-lift-above'
  return classification ? ' week-capacity-lift-normal' : ''
}

function LiftSets({ family, short, sets, phase }: {
  family: LiftFamily
  short: string
  sets: number
  phase: JtsPhase | null
}) {
  const classification = phase ? classifySets(family, phase, sets) : null
  return (
    <>{short}<span
        className={`week-capacity-lift${classificationClass(classification)}`}
        data-lift-family={family}
        {...(classification ? { 'data-jts-classification': classification } : {})}
      >{sets}</span></>
  )
}

function JtsReferenceLine({ family, sets, phase }: { family: LiftFamily; sets: number; phase: JtsPhase }) {
  const band = JTS_VOLUME_BANDS[phase][family]
  const classification = classifySets(family, phase, sets)
  const verdict = classification ? JTS_CLASSIFICATION_LABELS[classification] : '不提示'
  return (
    <span>
      {LIFT_LABELS[family]} MEV {band.mev[0]}-{band.mev[1]} / MRV {band.mrv[0]}-{band.mrv[1]}；当周 {sets} 组，{verdict}
      {/* Source: Stronger By Science (SBS), first-hand deadlift-volume guidance. */}
      {family === 'deadlift' && <small className="week-capacity-deadlift-note">硬拉容量个体差异大,约半数人最佳频率为每周 1 次,起点常为深蹲的 1/2-2/3</small>}
    </span>
  )
}

export function WeekCapacitySummary({ weekNumber, summary, totalSetsTrend, tonnageTrend, phase }: Props) {
  const tooltipId = `week-capacity-tooltip-${weekNumber}`
  return (
    <span className="week-capacity" tabIndex={0} aria-describedby={tooltipId} data-week-summary="">
      <span className="week-capacity-main">主 <LiftSets family="squat" short="S" sets={summary.squatSets} phase={phase} /> <LiftSets family="bench" short="B" sets={summary.benchSets} phase={phase} /> <LiftSets family="deadlift" short="D" sets={summary.deadliftSets} phase={phase} /> 其{summary.otherMainSets}</span>
      <span>辅 {summary.auxiliarySets}</span>
      <span>总 {summary.totalSets}组{totalSetsTrend && <em>{trendLabel(totalSetsTrend)}</em>}</span>
      <span>吨位 {compactTonnage(summary.tonnage)}{tonnageTrend && <em>{trendLabel(tonnageTrend)}</em>}</span>
      <span id={tooltipId} className="week-capacity-tooltip" role="tooltip">
        <strong>第 {weekNumber} 周容量明细</strong>
        <span>主项：深蹲族 {summary.squatSets}组 · 卧推族 {summary.benchSets}组 · 硬拉族 {summary.deadliftSets}组 · 其他主项 {summary.otherMainSets}组</span>
        <span>辅助项：{summary.auxiliarySets}组</span>
        <span>总组数：{summary.totalSets}组 {trendDetail(totalSetsTrend)}</span>
        <span>吨位：{exactKg(summary.tonnage)} {trendDetail(tonnageTrend)}</span>
        {phase && (
          <span className="week-capacity-jts-reference">
            <b>JTS {JTS_PHASE_LABELS[phase]}每周 working sets 参考</b>
            <JtsReferenceLine family="squat" sets={summary.squatSets} phase={phase} />
            <JtsReferenceLine family="bench" sets={summary.benchSets} phase={phase} />
            <JtsReferenceLine family="deadlift" sets={summary.deadliftSets} phase={phase} />
            <small>参考区间来自 JTS 手册,MRV 是中循环概念——蓄积末周有意超出属正常安排,仅供参考,不校验不拦截</small>
          </span>
        )}
        <small>口径：组数按每行动作的组槽数计算（空公斤框、RPE、自重仍计组数）；吨位仅计入「kg 模式 + 重量可解析 + reps 可解析」的组，reps 取首个整数（如 8+ 取 8、6-8 取 6），reps 无数字（如 —）的行吨位记 0。</small>
      </span>
    </span>
  )
}
