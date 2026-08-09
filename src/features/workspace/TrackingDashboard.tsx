import { useEffect, useMemo } from 'react'
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
  deadlift: { label: '硬拉', color: '#C43B35' },
}

interface ChartDatum {
  label: string
  value: number
  display: string
  /** Normalized 0..1 x position on the card-wide shared axis (line charts). */
  t?: number
  /** Shared slot index on the card-wide axis (bar charts). */
  slot?: number
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
}

const finiteData = (data: ChartDatum[]) => data.filter((point) => Number.isFinite(point.value))

export function LineChart({ data, color, label, axis }: ChartProps) {
  const points = finiteData(data)
  if (points.length === 0) return <ChartEmpty />
  const values = points.map((point) => point.value)
  const min = Math.min(...values)
  const max = Math.max(...values)
  const span = max - min
  const xAt = (point: ChartDatum, index: number) => {
    const t = point.t ?? (points.length === 1 ? .5 : index / (points.length - 1))
    return 16 + t * 268
  }
  const yAt = (value: number) => span === 0 ? 48 : 10 + (max - value) * 70 / span
  const plot = points.map((point, index) => `${xAt(point, index).toFixed(1)},${yAt(point.value).toFixed(1)}`).join(' ')
  const startLabel = axis?.start ?? points[0].label
  const endLabel = axis?.end ?? points.at(-1)!.label
  return (
    <svg className="tracking-chart tracking-line-chart" viewBox="0 0 300 110" role="img" aria-label={label} preserveAspectRatio="none">
      <line className="tracking-grid-line" x1="16" y1="80" x2="284" y2="80" />
      <polyline points={plot} fill="none" stroke={color} strokeWidth="2" vectorEffect="non-scaling-stroke" />
      {points.map((point, index) => (
        <circle key={`${point.label}-${index}`} cx={xAt(point, index)} cy={yAt(point.value)} r={index === points.length - 1 ? 3.5 : 2} fill={color}>
          <title>{point.label} · {point.display}</title>
        </circle>
      ))}
      {startLabel === endLabel
        ? <text x="150" y="103" textAnchor="middle">{startLabel}</text>
        : <>
            <text x="16" y="103">{startLabel}</text>
            <text x="284" y="103" textAnchor="end">{endLabel}</text>
          </>}
    </svg>
  )
}

export function BarChart({ data, color, label, slots, axisLabels }: ChartProps) {
  const points = finiteData(data)
  if (points.length === 0) return <ChartEmpty />
  const slotCount = Math.max(1, slots ?? points.length)
  const max = Math.max(100, ...points.map((point) => point.value))
  const slot = 268 / slotCount
  const labels = axisLabels ?? points.map((point) => point.label)
  const labelledSlots = labels.length <= 8
    ? labels.map((text, index) => [text, index] as const)
    : [[labels[0], 0] as const, [labels.at(-1)!, labels.length - 1] as const]
  return (
    <svg className="tracking-chart tracking-bar-chart" viewBox="0 0 300 110" role="img" aria-label={label} preserveAspectRatio="none">
      <line className="tracking-grid-line" x1="16" y1="80" x2="284" y2="80" />
      {points.map((point, index) => {
        const at = point.slot ?? index
        const height = point.value <= 0 ? 0 : Math.max(2, point.value / max * 68)
        return (
          <rect key={`${point.label}-${index}`} x={16 + at * slot + slot * .18} y={80 - height} width={slot * .64} height={height} rx="2" fill={color} opacity={at === slotCount - 1 ? 1 : .72}>
            <title>{point.label} · {point.display}</title>
          </rect>
        )
      })}
      {labelledSlots.map(([text, index]) => (
        <text key={`label-${index}`} x={16 + index * slot + slot / 2} y="103" textAnchor="middle">{text}</text>
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

function TrackingCard({ title, subtitle, missing = false, children }: {
  title: string
  subtitle?: string
  missing?: boolean
  children: React.ReactNode
}) {
  return <article className="tracking-card" data-card-title={title}><header className="tracking-card-head"><div><h2>{title}</h2>{subtitle && <p>{subtitle}</p>}</div></header>{missing ? <div className="tracking-version-placeholder">后端版本过旧</div> : children}</article>
}

function validE1rmPoints(series: E1rmFamilySeries | undefined, toT: (date: string) => number): ChartDatum[] {
  return (series?.points ?? []).flatMap((point) => {
    const value = numberValue(point.value)
    return value == null ? [] : [{ label: dateLabel(point.date), value, display: `${decimal(value)} kg`, t: toT(point.date) }]
  })
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
  return <TrackingCard title="e1RM over time" subtitle="近 90 天竞技主项估算" missing={data === undefined}><FamilyGrid>{(family) => {
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
    return <><FamilyHead family={family} value={latest ? `${decimal(latest.value)} kg` : undefined} detail={detail} tone={tone} /><LineChart data={points} color={FAMILY_META[family].color} label={`${FAMILY_META[family].label} e1RM 折线图`} {...axis ? { axis } : {}} /></>
  }}</FamilyGrid></TrackingCard>
}

function metricPoints(
  metrics: WeeklyFamilyMetric[] | undefined,
  field: 'volume_kg' | 'avg_rpe' | 'top_set_intensity',
  slotOf: ReadonlyMap<string, number>,
): ChartDatum[] {
  const lastSlot = slotOf.size - 1
  return (metrics ?? []).flatMap((metric) => {
    const value = numberValue(metric[field])
    const slot = slotOf.get(metric.week_start)
    if (value == null || slot == null) return []
    const display = field === 'volume_kg' ? `${decimal(value / 1000)} 吨` : field === 'avg_rpe' ? `RPE ${decimal(value)}` : `${decimal(value)}%`
    return [{ label: weekLabel(metric.week_start), value, display, slot, t: lastSlot === 0 ? .5 : slot / lastSlot }]
  })
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
  return <TrackingCard title={title} subtitle={subtitle} missing={data === undefined}><FamilyGrid>{(family) => {
    const points = metricPoints(data?.[family], field, slotOf)
    const latest = points.at(-1)
    const chartNode = chart === 'bar'
      ? <BarChart data={points} color={FAMILY_META[family].color} label={`${FAMILY_META[family].label}${title}柱状图`} slots={weeks.length} axisLabels={axisLabels} />
      : <LineChart data={points} color={FAMILY_META[family].color} label={`${FAMILY_META[family].label}${title}折线图`} {...axis ? { axis } : {}} />
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
    return { label: reps === 8 ? '8+' : String(reps), value: count / total * 100, display: `${decimal(count / total * 100)}% · ${count} 组` }
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
    return <><FamilyHead family={family} /><BarChart data={points} color={FAMILY_META[family].color} label={`${FAMILY_META[family].label}${chartName}柱状图`} /></>
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
