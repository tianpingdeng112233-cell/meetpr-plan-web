import { useEffect, useId, useMemo } from 'react'
import type {
  CoachStudent,
  E1rmFamilySeries,
  ExerciseStatsOverview,
  IntensityDistribution,
  LiftFamily,
  RepDistributionBucket,
  WeeklyFamilyMetric,
} from '../../api/types'
import { PageTop } from './WorkspaceCommon'

const FAMILIES: LiftFamily[] = ['squat', 'bench', 'deadlift']
const FAMILY_META: Record<LiftFamily, { label: string; color: string }> = {
  squat: { label: '深蹲', color: '#276FBF' },
  bench: { label: '卧推', color: '#18855B' },
  // 品牌金(--gold-500,docs/design/coach-web/tokens):David 2026-08-09 拍板硬拉列弃红用金。
  deadlift: { label: '硬拉', color: '#F5A623' },
}

interface ChartDatum {
  label: string
  value: number
  display: string
  /** Short on-chart value label (常显数值); falls back to display. */
  short?: string
  /** Normalized 0..1 x position on the card-wide shared axis (line charts). */
  t?: number
  /** Shared slot index on the card-wide axis (bar charts). */
  slot?: number
  /** The stretch back to the previous point crosses a week with no logged sets → dashed. */
  gapBefore?: boolean
}

/** Card-wide axis so the same week/date lands on the same x in all three family charts. */
interface ChartAxis {
  start: string
  end: string
}

interface ChartProps {
  data: ChartDatum[]
  color: string
  label: string
  axis?: ChartAxis
  /** BarChart: total slots on the shared axis; defaults to data.length. */
  slots?: number
  /** BarChart: slot labels for the shared axis; defaults to per-point labels. */
  axisLabels?: string[]
  /** y-axis tick formatter (§SPEC-038 3.1); defaults to a compact number. */
  tick?: (value: number) => string
}

const finiteData = (data: ChartDatum[]) => data.filter((point) => Number.isFinite(point.value))

// Plot frame shared by line/bar charts: y-axis tick labels live left of PLOT_L.
const PLOT_L = 46
const PLOT_R = 288
const PLOT_T = 18
const PLOT_B = 80

const defaultTick = (value: number) => Number.isInteger(value) ? String(value) : decimal(value)

function YAxis({ ticks, format }: { ticks: { value: number; y: number }[]; format: (value: number) => string }) {
  return <>
    {ticks.map(({ value, y }) => (
      <g key={y}>
        <line className="tracking-grid-line" x1={PLOT_L} y1={y} x2={PLOT_R} y2={y} />
        <text className="tick" x={PLOT_L - 5} y={y + 3} textAnchor="end">{format(value)}</text>
      </g>
    ))}
  </>
}

export function LineChart({ data, color, label, axis, tick = defaultTick }: ChartProps) {
  const gradientId = useId()
  const points = finiteData(data)
  if (points.length === 0) return <ChartEmpty />
  const values = points.map((point) => point.value)
  const min = Math.min(...values)
  const max = Math.max(...values)
  const span = max - min
  const xAt = (point: ChartDatum, index: number) => {
    const t = point.t ?? (points.length === 1 ? .5 : index / (points.length - 1))
    return PLOT_L + t * (PLOT_R - PLOT_L)
  }
  const yAt = (value: number) => span === 0 ? (PLOT_T + PLOT_B) / 2 : PLOT_T + (max - value) * (PLOT_B - PLOT_T) / span
  const coords = points.map((point, index) => `${xAt(point, index).toFixed(1)},${yAt(point.value).toFixed(1)}`)
  // 光幕: gradient veil under the whole series, dropping to the baseline.
  const area = points.length > 1
    ? `M${coords.join(' L')} L${xAt(points.at(-1)!, points.length - 1).toFixed(1)},${PLOT_B} L${xAt(points[0]!, 0).toFixed(1)},${PLOT_B} Z`
    : null
  // 实/虚分段: a stretch that crosses a week with no logged sets renders dashed.
  const segments: { plot: string; dashed: boolean }[] = []
  for (let index = 1; index < points.length; index++) {
    const dashed = points[index]!.gapBefore === true
    const last = segments.at(-1)
    if (last && last.dashed === dashed) last.plot += ` ${coords[index]}`
    else segments.push({ plot: `${coords[index - 1]} ${coords[index]}`, dashed })
  }
  const yTicks = span === 0
    ? [{ value: max, y: (PLOT_T + PLOT_B) / 2 }]
    : [{ value: max, y: PLOT_T }, { value: min + span / 2, y: (PLOT_T + PLOT_B) / 2 }, { value: min, y: PLOT_B }]
  // Every point labelled on the x axis while it stays legible; dense series fall
  // back to first / middle / last. A single point on a shared card axis shows the
  // axis端点 instead (and never the same date twice).
  const xLabels: { x: number; text: string; anchor: 'start' | 'middle' | 'end' }[] = []
  if (points.length === 1) {
    if (axis && axis.start !== axis.end) {
      xLabels.push({ x: PLOT_L, text: axis.start, anchor: 'start' })
      xLabels.push({ x: PLOT_R, text: axis.end, anchor: 'end' })
    } else {
      xLabels.push({ x: xAt(points[0]!, 0), text: points[0]!.label, anchor: 'middle' })
    }
  } else {
    const indexes = points.length <= 7
      ? points.map((_, index) => index)
      : [0, Math.floor((points.length - 1) / 2), points.length - 1]
    for (const index of indexes) {
      xLabels.push({
        x: xAt(points[index]!, index),
        text: points[index]!.label,
        anchor: index === 0 ? 'start' : index === points.length - 1 ? 'end' : 'middle',
      })
    }
  }
  // 常显数值:dense series alternate to every other point (ending on the last).
  const valueLabelled = new Set(points.length <= 8
    ? points.map((_, index) => index)
    : points.map((_, index) => index).filter((index) => (points.length - 1 - index) % 2 === 0))
  return (
    <svg className="tracking-chart tracking-line-chart" viewBox="0 0 300 110" role="img" aria-label={label} preserveAspectRatio="none">
      <YAxis ticks={yTicks} format={tick} />
      <line className="tracking-grid-line" x1={PLOT_L} y1={PLOT_B} x2={PLOT_R} y2={PLOT_B} />
      <line className="tracking-grid-line" x1={PLOT_L} y1={PLOT_T} x2={PLOT_L} y2={PLOT_B} />
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={color} stopOpacity=".26" />
          <stop offset="1" stopColor={color} stopOpacity=".02" />
        </linearGradient>
      </defs>
      {area && <path d={area} fill={`url(#${gradientId})`} stroke="none" />}
      <g className="tracking-line-glow" style={{ color }}>
        {segments.map((segment, index) => (
          <polyline key={index} points={segment.plot} className={segment.dashed ? 'tracking-line-dash' : undefined} fill="none" stroke={color} strokeWidth="2" vectorEffect="non-scaling-stroke" />
        ))}
      </g>
      {points.map((point, index) => (
        <g key={`${point.label}-${index}`}>
          <circle cx={xAt(point, index)} cy={yAt(point.value)} r={index === points.length - 1 ? 3.5 : 2} fill={color}>
            <title>{point.label} · {point.display}</title>
          </circle>
          {valueLabelled.has(index) && (
            <text className="val" x={xAt(point, index)} y={Math.max(8, yAt(point.value) - 6)} textAnchor="middle">
              {point.short ?? point.display}
            </text>
          )}
        </g>
      ))}
      {xLabels.map((tickLabel, index) => (
        <text key={`x-${index}`} className="tick" y="103" x={tickLabel.x} textAnchor={tickLabel.anchor}>
          {tickLabel.text}
        </text>
      ))}
    </svg>
  )
}

export function BarChart({ data, color, label, slots, axisLabels, tick = defaultTick }: ChartProps) {
  const gradientId = useId()
  const points = finiteData(data)
  if (points.length === 0) return <ChartEmpty />
  const slotCount = Math.max(1, slots ?? points.length)
  const max = Math.max(100, ...points.map((point) => point.value))
  const slot = (PLOT_R - PLOT_L) / slotCount
  const labels = axisLabels ?? points.map((point) => point.label)
  const labelledSlots = labels.length <= 8
    ? labels.map((text, index) => [text, index] as const)
    : [[labels[0], 0] as const, [labels.at(-1)!, labels.length - 1] as const]
  const yTicks = [{ value: max, y: PLOT_T }, { value: max / 2, y: (PLOT_T + PLOT_B) / 2 }, { value: 0, y: PLOT_B }]
  return (
    <svg className="tracking-chart tracking-bar-chart" viewBox="0 0 300 110" role="img" aria-label={label} preserveAspectRatio="none">
      <YAxis ticks={yTicks} format={tick} />
      <line className="tracking-grid-line" x1={PLOT_L} y1={PLOT_T} x2={PLOT_L} y2={PLOT_B} />
      <defs>
        {/* 明暗: bars brighten toward the top, PowerSheets-style. */}
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={color} stopOpacity="1" />
          <stop offset="1" stopColor={color} stopOpacity=".55" />
        </linearGradient>
      </defs>
      {points.map((point, index) => {
        const at = point.slot ?? index
        const height = point.value <= 0 ? 0 : Math.max(2, point.value / max * (PLOT_B - PLOT_T - 8))
        const cx = PLOT_L + at * slot + slot / 2
        return (
          <g key={`${point.label}-${index}`}>
            <rect x={PLOT_L + at * slot + slot * .18} y={PLOT_B - height} width={slot * .64} height={height} rx="2" fill={`url(#${gradientId})`} opacity={at === slotCount - 1 ? 1 : .72}>
              <title>{point.label} · {point.display}</title>
            </rect>
            {point.value > 0 && (
              <text className="val" x={cx} y={Math.max(8, PLOT_B - height - 4)} textAnchor="middle">
                {point.short ?? point.display}
              </text>
            )}
          </g>
        )
      })}
      {labelledSlots.map(([text, index]) => (
        <text key={`label-${index}`} className="tick" x={PLOT_L + index * slot + slot / 2} y="103" textAnchor="middle">{text}</text>
      ))}
    </svg>
  )
}

export function HorizontalBarChart({ data, color, label }: ChartProps) {
  const points = finiteData(data)
  if (points.length === 0) return <ChartEmpty />
  const max = Math.max(100, ...points.map((point) => point.value))
  const rowHeight = 92 / points.length
  return (
    <svg className="tracking-chart tracking-horizontal-chart" viewBox="0 0 300 110" role="img" aria-label={label} preserveAspectRatio="none">
      {points.map((point, index) => {
        const y = 8 + index * rowHeight
        return (
          <g key={`${point.label}-${index}`}>
            <text x="16" y={y + 12}>{point.label}</text>
            <rect x="72" y={y + 2} width="190" height="12" rx="3" className="tracking-bar-track" />
            <rect x="72" y={y + 2} width={190 * point.value / max} height="12" rx="3" fill={color}>
              <title>{point.label} · {point.display}</title>
            </rect>
            <text x="284" y={y + 12} textAnchor="end">{point.display}</text>
          </g>
        )
      })}
    </svg>
  )
}

function ChartEmpty() {
  return <div className="tracking-chart-empty">暂无数据</div>
}

function weekLabel(value: string): string {
  const [, month = '', day = ''] = value.split('-')
  return `${Number(month)}/${Number(day)} 周`
}

function dateLabel(value: string): string {
  const [, month = '', day = ''] = value.split('-')
  return `${Number(month)}/${Number(day)}`
}

function numberValue(value: string | null): number | null {
  if (value == null) return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function decimal(value: number, digits = 1): string {
  return value.toLocaleString('zh-CN', { minimumFractionDigits: digits, maximumFractionDigits: digits })
}

function FamilyGrid({ children }: { children: (family: LiftFamily) => React.ReactNode }) {
  return <div className="tracking-family-grid">{FAMILIES.map((family) => (
    <section className="tracking-family" data-family={family} key={family}>{children(family)}</section>
  ))}</div>
}

function FamilyHead({ family, value, detail, tone }: {
  family: LiftFamily
  value?: string
  detail?: string
  tone?: 'up' | 'down' | 'flat'
}) {
  return <header className="tracking-family-head"><span><i style={{ background: FAMILY_META[family].color }} />{FAMILY_META[family].label}</span>{value && <b>{value}</b>}{detail && <small className={tone ? `trend-${tone}` : ''}>{detail}</small>}</header>
}

function TrackingCard({ title, subtitle, missing = false, note, children }: {
  title: string
  subtitle?: string
  missing?: boolean
  /** PowerSheets 式卡底图注,如「虚线 = 中间隔了无记录周」。 */
  note?: string
  children: React.ReactNode
}) {
  return <article className="tracking-card" data-card-title={title}><header className="tracking-card-head"><div><h2>{title}</h2>{subtitle && <p>{subtitle}</p>}</div></header>{missing ? <div className="tracking-version-placeholder">后端版本过旧</div> : <>{children}{note && <footer className="tracking-card-note">{note}</footer>}</>}</article>
}

const WEEK_MS = 7 * 86400000

/** Monday-based calendar week start (UTC) — DATE strings parse as UTC midnight. */
function weekStartMs(date: string): number {
  const ms = Date.parse(date)
  return ms - (new Date(ms).getUTCDay() + 6) % 7 * 86400000
}

function validE1rmPoints(series: E1rmFamilySeries | undefined, toT: (date: string) => number): ChartDatum[] {
  const out: ChartDatum[] = []
  let previousDate: string | undefined
  for (const point of series?.points ?? []) {
    const value = numberValue(point.value)
    if (value == null) continue
    // 两点之间隔着至少一个完整无记录日历周 → 连线画虚线(正常一周一练的 8–9 天间隔不算)。
    const gapBefore = previousDate !== undefined && weekStartMs(point.date) - weekStartMs(previousDate) > WEEK_MS
    out.push({ label: dateLabel(point.date), value, display: `${decimal(value)} kg`, short: decimal(value), t: toT(point.date), gapBefore })
    previousDate = point.date
  }
  return out
}

function E1rmCard({ data }: { data: ExerciseStatsOverview['e1rm_series'] }) {
  // Shared date domain across families: the same date lands on the same x in every chart.
  const dates = FAMILIES.flatMap((family) => data?.[family]?.points.map((point) => point.date) ?? []).sort()
  const domainStart = dates[0]
  const domainSpan = dates.length > 1 ? Date.parse(dates.at(-1)!) - Date.parse(dates[0]) : 0
  const toT = (date: string) => domainStart === undefined || domainSpan === 0 ? .5 : (Date.parse(date) - Date.parse(domainStart)) / domainSpan
  const axis: ChartAxis | undefined = dates.length > 0
    ? { start: dateLabel(dates[0]), end: dateLabel(dates.at(-1)!) }
    : undefined
  return <TrackingCard title="e1RM over time" subtitle="近 90 天竞技主项估算" missing={data === undefined} note="虚线 = 中间隔了无记录周"><FamilyGrid>{(family) => {
    const points = validE1rmPoints(data?.[family], toT)
    const first = points[0]
    const latest = points.at(-1)
    const trend = data?.[family]?.trend
    const difference = first && latest && points.length > 1 ? latest.value - first.value : null
    const tone = trend === 'up' || trend === 'down' ? trend
      : trend === 'flat' || trend === 'new' ? 'flat'
        : difference == null || difference === 0 ? 'flat' : difference > 0 ? 'up' : 'down'
    const detail = difference != null ? `较起点 ${difference > 0 ? '+' : ''}${decimal(difference)} kg`
      : trend === 'new' && latest ? '新数据' : undefined
    return <><FamilyHead family={family} value={latest ? `${decimal(latest.value)} kg` : undefined} detail={detail} tone={tone} /><LineChart data={points} color={FAMILY_META[family].color} label={`${FAMILY_META[family].label} e1RM 折线图`} tick={(v) => String(Math.round(v))} {...axis ? { axis } : {}} /></>
  }}</FamilyGrid></TrackingCard>
}

function metricPoints(
  metrics: WeeklyFamilyMetric[] | undefined,
  field: 'volume_kg' | 'avg_rpe' | 'top_set_intensity',
  slotOf: ReadonlyMap<string, number>,
): ChartDatum[] {
  const lastSlot = slotOf.size - 1
  const out: ChartDatum[] = []
  let previousWeek: string | undefined
  for (const metric of metrics ?? []) {
    const value = numberValue(metric[field])
    const slot = slotOf.get(metric.week_start)
    if (value == null || slot == null) continue
    const display = field === 'volume_kg' ? `${decimal(value / 1000)} 吨` : field === 'avg_rpe' ? `RPE ${decimal(value)}` : `${decimal(value)}%`
    const short = field === 'volume_kg' ? decimal(value / 1000) : field === 'avg_rpe' ? decimal(value) : `${Math.round(value)}%`
    // 与上一个有数据的周隔着空日历周 → 虚线段。按 week_start 判,不按共享槽位差——
    // 三个 family 同时空掉的周在共享轴上没有槽位,槽位差会漏判。
    const gapBefore = previousWeek !== undefined && weekStartMs(metric.week_start) - weekStartMs(previousWeek) > WEEK_MS
    out.push({ label: weekLabel(metric.week_start), value, display, short, slot, t: lastSlot === 0 ? .5 : slot / lastSlot, gapBefore })
    previousWeek = metric.week_start
  }
  return out
}

/** Sorted union of week_start across the three families — the card-wide shared axis (§3.1). */
function sharedWeeks(data: ExerciseStatsOverview['weekly_family_metrics']): string[] {
  return [...new Set(FAMILIES.flatMap((family) => data?.[family]?.map((week) => week.week_start) ?? []))].sort()
}

function MetricCard({ data, title, subtitle, field, chart }: {
  data: ExerciseStatsOverview['weekly_family_metrics']
  title: string
  subtitle: string
  field: 'volume_kg' | 'avg_rpe' | 'top_set_intensity'
  chart: 'line' | 'bar'
}) {
  const weeks = sharedWeeks(data)
  const slotOf = new Map(weeks.map((week, index) => [week, index]))
  const axisLabels = weeks.map(weekLabel)
  const axis: ChartAxis | undefined = weeks.length > 0
    ? { start: weekLabel(weeks[0]), end: weekLabel(weeks.at(-1)!) }
    : undefined
  return <TrackingCard title={title} subtitle={subtitle} missing={data === undefined} {...chart === 'line' ? { note: '虚线 = 中间隔了无记录周' } : {}}><FamilyGrid>{(family) => {
    const points = metricPoints(data?.[family], field, slotOf)
    const latest = points.at(-1)
    const tick = field === 'volume_kg' ? (v: number) => decimal(v / 1000)
      : field === 'avg_rpe' ? (v: number) => decimal(v)
        : (v: number) => `${Math.round(v)}%`
    const chartNode = chart === 'bar'
      ? <BarChart data={points} color={FAMILY_META[family].color} label={`${FAMILY_META[family].label}${title}柱状图`} slots={weeks.length} axisLabels={axisLabels} tick={tick} />
      : <LineChart data={points} color={FAMILY_META[family].color} label={`${FAMILY_META[family].label}${title}折线图`} tick={tick} {...axis ? { axis } : {}} />
    return <><FamilyHead family={family} value={latest?.display} />{chartNode}</>
  }}</FamilyGrid></TrackingCard>
}

function intensityPoints(distribution: IntensityDistribution | undefined): ChartDatum[] {
  if (!distribution) return []
  const buckets = [
    ['<70%', distribution.lt70],
    ['70–80%', distribution.b70_80],
    ['80–90%', distribution.b80_90],
    ['90%+', distribution.gte90],
  ] as const
  const total = buckets.reduce((sum, [, count]) => sum + count, 0)
  if (total === 0) return []
  return buckets.map(([label, count]) => ({
    label,
    value: count / total * 100,
    display: `${decimal(count / total * 100)}% · ${count} 组`,
    short: `${Math.round(count / total * 100)}%`,
  }))
}

function repPoints(distribution: RepDistributionBucket[] | undefined): ChartDatum[] {
  if (!distribution) return []
  const counts = new Map<number, number>()
  distribution.forEach(({ reps, count }) => {
    const bucket = Math.max(1, Math.min(8, reps))
    counts.set(bucket, (counts.get(bucket) ?? 0) + count)
  })
  const total = [...counts.values()].reduce((sum, count) => sum + count, 0)
  if (total === 0) return []
  return Array.from({ length: 8 }, (_, index) => {
    const reps = index + 1
    const count = counts.get(reps) ?? 0
    return {
      label: reps === 8 ? '8+' : String(reps),
      value: count / total * 100,
      display: `${decimal(count / total * 100)}% · ${count} 组`,
      short: `${Math.round(count / total * 100)}%`,
    }
  })
}

function DistributionCard({ data, title, kind }: {
  data: ExerciseStatsOverview['intensity_distribution'] | ExerciseStatsOverview['rep_distribution']
  title: string
  kind: 'intensity' | 'reps'
}) {
  return <TrackingCard title={title} subtitle={kind === 'intensity' ? '按已完成训练组强度占比' : '按实际完成次数占比'} missing={data === undefined}><FamilyGrid>{(family) => {
    const points = kind === 'intensity'
      ? intensityPoints((data as ExerciseStatsOverview['intensity_distribution'])?.[family])
      : repPoints((data as ExerciseStatsOverview['rep_distribution'])?.[family])
    const chartName = kind === 'intensity' ? '强度分布' : '次数分布'
    return <><FamilyHead family={family} /><BarChart data={points} color={FAMILY_META[family].color} label={`${FAMILY_META[family].label}${chartName}柱状图`} tick={(v) => `${Math.round(v)}%`} /></>
  }}</FamilyGrid></TrackingCard>
}

function VolumeShareCard({ data }: { data: ExerciseStatsOverview['weekly_family_metrics'] }) {
  const totals = useMemo(() => FAMILIES.map((family) => ({
    family,
    value: (data?.[family] ?? []).reduce((sum, week) => sum + (numberValue(week.volume_kg) ?? 0), 0),
  })), [data])
  const total = totals.reduce((sum, item) => sum + item.value, 0)
  return <TrackingCard title="Volume share by lift" subtitle="近 90 天总容量占比" missing={data === undefined}><div className="tracking-share-grid">{totals.map(({ family, value }) => {
    const share = total > 0 ? value / total * 100 : 0
    return <section key={family}><FamilyHead family={family} value={`${decimal(value / 1000)} t`} /><HorizontalBarChart data={[{ label: '容量', value: share, display: `${decimal(share)}%` }]} color={FAMILY_META[family].color} label={`${FAMILY_META[family].label}容量占比横条图`} /></section>
  })}</div></TrackingCard>
}

export interface TrackingDashboardProps {
  students: CoachStudent[]
  selectedStudentId: string
  onStudentChange: (studentId: string) => void
  /** Workspace-owned overview cache entry: undefined = not fetched yet, null = fetch failed. */
  overview: ExerciseStatsOverview | null | undefined
  /** Ask the workspace to fetch (once) — dedup/caching lives in PlanWorkspace, not here. */
  onEnsureOverview: (studentId: string) => void
}

export function TrackingDashboard({ students, selectedStudentId, onStudentChange, overview, onEnsureOverview }: TrackingDashboardProps) {
  useEffect(() => {
    if (selectedStudentId) onEnsureOverview(selectedStudentId)
  }, [selectedStudentId, onEnsureOverview])

  return <main className="tracking-page data-page" aria-label="追踪看板">
    <PageTop title="追踪" students={students} studentId={selectedStudentId} onStudent={onStudentChange} tail={<span className="page-status">近 90 天</span>} />
    {overview === null ? <div className="tracking-load-state">追踪数据加载失败，切换学员或刷新页面重试</div> : overview === undefined ? <div className="tracking-load-state">加载追踪数据…</div> : <div className="tracking-card-list">
      <E1rmCard data={overview.e1rm_series} />
      <MetricCard data={overview.weekly_family_metrics} title="Volume over time" subtitle="每周训练容量（吨）" field="volume_kg" chart="bar" />
      <MetricCard data={overview.weekly_family_metrics} title="Avg RPE over time" subtitle="有 RPE 训练组的周均值" field="avg_rpe" chart="line" />
      <MetricCard data={overview.weekly_family_metrics} title="Intensity over time" subtitle="Top set，占 e1RM %" field="top_set_intensity" chart="line" />
      <DistributionCard data={overview.intensity_distribution} title="Intensity distribution" kind="intensity" />
      <DistributionCard data={overview.rep_distribution} title="Rep distribution" kind="reps" />
      <VolumeShareCard data={overview.weekly_family_metrics} />
      <TrackingCard title="Bodyweight" subtitle="体重趋势"><div className="tracking-bodyweight-empty"><b>暂无体态打卡数据</b><span>等待 wellness 数据源接入</span></div></TrackingCard>
    </div>}
  </main>
}
