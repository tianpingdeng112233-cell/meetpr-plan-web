import { useEffect, useMemo, useState } from 'react'
import { getExerciseStats, getExerciseStatsOverview } from '../../api/coach'
import { getStudentOnboarding } from '../../api/plans'
import type {
  ChatConversation,
  CoachStudent,
  E1rmTrend,
  ExerciseStatsDetail,
  ExerciseStatsOverview,
  LiftFamily,
  PlanResponse,
  StudentOnboardingProfile,
} from '../../api/types'
import type { ExerciseIndex } from '../plan-editor/exerciseIndex'
import type { Catalog } from '../plan-editor/mapping'
import { PageTop, kg, profileLine, shortDate } from './WorkspaceCommon'
import { completionRateTone } from './metricThresholds'
import {
  deriveRosterCounts,
  deriveRosterRows,
  filterRosterRows,
  type RosterDataByStudent,
  type RosterCounts,
  type RosterOverviewRow,
  type RosterTab,
} from './rosterOverview'
import { StudentPlanCapacityCard } from './StudentPlanCapacityCard'
import { useGlobalKeyboardHandler } from './globalKeyboard'

export function RmStrip({ detail, weight }: { detail: ExerciseStatsDetail; weight?: number | null }) {
  // Main lift = backend supplies a 登记 1RM reference (null for non-main lifts). Show the
  // strip whenever it's a main lift — even with no logged data yet, the 登记 1RM still
  // matters. e1RM reads「—」until the student has eligible sets; the % needs e1RM.
  if (!detail.e1rm && detail.one_rm_reference == null) return null
  const percent = detail.e1rm && weight != null ? Math.round(weight / Number(detail.e1rm.value) * 100) : null
  return <div className="rm-strip"><span><b>{detail.e1rm ? kg(detail.e1rm.value) : '—'}</b><small>e1RM · 后端滚动值</small></span><span><b>{kg(detail.one_rm_reference)}</b><small>登记 1RM</small></span>{percent != null && <span><b className="red">{percent}%</b><small>{weight} ÷ e1RM</small></span>}</div>
}
export function SessionDetail({ detail, limit = 6 }: { detail: ExerciseStatsDetail; limit?: number }) {
  return <div className="sessions">{detail.recent_sessions.slice(0, limit).map((s) => <section className="session" key={s.date}><header><b>{shortDate(s.date)}</b><span>{s.sets.length} 组</span></header>{s.sets.map((set) => <div className="set-line" key={set.set_index}><span>{set.set_index}</span><b>{kg(set.weight_kg)}kg × {set.reps}</b><span>{set.rpe ? `@${Number(set.rpe)}` : '—'}</span>{set.assumed && <i>导</i>}{set.has_video && <button title="播放该组视频">▶</button>}<em className={set.failed ? 'failed' : ''}>{set.failed ? '力竭' : set.completed ? '✓' : '—'}</em></div>)}</section>)}</div>
}

// ── 总览（mock 1:1 扫视表）──────────────────────────────────────
export const ROSTER_GRID_COLUMNS = '150px 104px 116px 84px 78px 156px 80px 1fr'

// ── 花名册 e1RM 徽章(拍板 A,2026-08-09:一列紧凑三项;↑绿 ↓红 →灰,红仅点缀不大面积)──
const E1RM_FAMILIES: LiftFamily[] = ['squat', 'bench', 'deadlift']
const E1RM_FAMILY_ABBR: Record<LiftFamily, string> = { squat: 'S', bench: 'B', deadlift: 'D' }
const E1RM_FAMILY_LABELS: Record<LiftFamily, string> = { squat: '深蹲', bench: '卧推', deadlift: '硬拉' }
const E1RM_TREND_ARROWS: Record<E1rmTrend, string> = { up: '↑', flat: '→', down: '↓', new: '' }
/** 趋势方向一律采用后端 e1rm_series[family].trend,前端不重算。 */
export const e1rmTrendArrow = (trend: E1rmTrend | undefined): string => trend ? E1RM_TREND_ARROWS[trend] : ''

export function RosterE1rmBadges({ overview }: { overview: ExerciseStatsOverview | null | undefined }) {
  return <span className="roster-e1rm">{E1RM_FAMILIES.map((family) => {
    const series = overview?.e1rm_series?.[family]
    const point = series?.points.length ? series.points[series.points.length - 1] : null
    if (point && Number.isFinite(Number(point.value))) {
      return <em key={family} data-testid={`roster-e1rm-${family}`} title={`${E1RM_FAMILY_LABELS[family]}最新实测 e1RM · ${shortDate(point.date)}`}>
        <small>{E1RM_FAMILY_ABBR[family]}</small><b>{Math.round(Number(point.value))}</b>
        {e1rmTrendArrow(series?.trend) && <i className={`trend-${series?.trend}`} aria-label={`趋势${series?.trend}`}>{e1rmTrendArrow(series?.trend)}</i>}
      </em>
    }
    // 无实测回落登记值并视觉降级——「没数据」和「数据是学员自填的」对教练是两回事,
    // 所以 .registered(点状下划线)只标登记值,纯无数据态不带。
    const registered = overview?.one_rm[family]
    return <em key={family} className={registered == null ? undefined : 'registered'} data-testid={`roster-e1rm-${family}`} title={registered == null ? `${E1RM_FAMILY_LABELS[family]}尚无实测或登记值` : `${E1RM_FAMILY_LABELS[family]}登记值,尚无实测`}>
      <small>{E1RM_FAMILY_ABBR[family]}</small><b>{registered == null ? '—' : Math.round(Number(registered))}</b>
    </em>
  })}</span>
}

export interface RosterBoardProps {
  students: CoachStudent[]
  selectedStudentId: string
  dataByStudent: RosterDataByStudent
  plansByStudent: Record<string, PlanResponse[]>
  conversations: ChatConversation[] | null
  rows?: readonly RosterOverviewRow[]
  counts?: RosterCounts
  onSelect: (studentId: string) => void
  onOpen: (studentId: string) => void
}

function profileMetric(profile: StudentOnboardingProfile | null | undefined): string {
  const weightClass = profile?.target_weight_class?.trim() || '—'
  const rawWeight = profile?.weight_kg == null ? null : Number(profile.weight_kg)
  const weight = rawWeight != null && Number.isFinite(rawWeight) ? rawWeight.toFixed(1) : '—'
  return `${weightClass} · ${weight}`
}

export function RosterBoard({
  students,
  selectedStudentId,
  dataByStudent,
  plansByStudent,
  conversations,
  rows: suppliedRows,
  counts: suppliedCounts,
  onSelect,
  onOpen,
}: RosterBoardProps) {
  const [tab, setTab] = useState<RosterTab>('all')
  const derivedRows = useMemo(() => deriveRosterRows({
    students,
    dataByStudent,
    plansByStudent,
    conversations,
  }), [conversations, dataByStudent, plansByStudent, students])
  const rows = suppliedRows ?? derivedRows
  const derivedCounts = useMemo(() => deriveRosterCounts(rows), [rows])
  const counts = suppliedCounts ?? derivedCounts
  const visibleRows = useMemo(() => filterRosterRows(rows, tab), [rows, tab])
  const tabs: { id: RosterTab; label: string; count: number }[] = [
    { id: 'all', label: '全部学员', count: counts.all },
    { id: 'pending', label: '待排', count: counts.pending },
    { id: 'attention', label: '需关注', count: counts.attention },
  ]

  useGlobalKeyboardHandler(({ event, editable }) => {
    if (
      editable
      || event.metaKey
      || event.ctrlKey
      || event.altKey
      || event.shiftKey
      || visibleRows.length === 0
    ) return false
    const key = event.key.toLowerCase()
    const currentIndex = visibleRows.findIndex((row) => row.student.id === selectedStudentId)
    if (key === 'j' || key === 'k') {
      event.preventDefault()
      const fallback = key === 'j' ? 0 : visibleRows.length - 1
      const nextIndex = currentIndex < 0
        ? fallback
        : Math.max(0, Math.min(visibleRows.length - 1, currentIndex + (key === 'j' ? 1 : -1)))
      const next = visibleRows[nextIndex]
      if (next) onSelect(next.student.id)
      return true
    }
    if (event.key === 'Enter' && currentIndex >= 0) {
      event.preventDefault()
      onOpen(visibleRows[currentIndex].student.id)
      return true
    }
    return false
  }, 10)

  return (
    <section className="roster-overview" aria-label="学员总览">
      <div className="roster-segments" role="tablist" aria-label="学员筛选">
        {tabs.map((item) => (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={tab === item.id}
            className={tab === item.id ? 'active' : ''}
            onClick={() => setTab(item.id)}
          >
            {item.label}<span>{item.count}</span>
          </button>
        ))}
      </div>
      <div
        className="roster-overview-grid roster-overview-head"
        style={{ gridTemplateColumns: ROSTER_GRID_COLUMNS }}
        data-grid-columns={ROSTER_GRID_COLUMNS}
      >
        <span>学员</span>
        <span>级别 / 体重</span>
        <span>完成率</span>
        <span>周总量</span>
        <span>RPE</span>
        <span>e1RM</span>
        <span>距赛</span>
        <span>下周计划</span>
      </div>
      <div className="roster-overview-scroll">
        {visibleRows.map((row) => {
          const selected = row.student.id === selectedStudentId
          const completionTone = completionRateTone(row.completionPercent)
          const completion = row.completionPercent == null ? '—' : `${row.completionPercent}%`
          const tonnage = typeof row.data.weekTonnageKg === 'number'
            ? (row.data.weekTonnageKg / 1000).toFixed(1)
            : null
          const distance = row.isRegistered === false
            ? '未报名'
            : row.isRegistered === null || row.competitionDays == null ? '—' : `${row.competitionDays} 天`
          return (
            <div
              key={row.student.id}
              className={`roster-overview-grid roster-overview-row${selected ? ' selected' : ''}`}
              style={{ gridTemplateColumns: ROSTER_GRID_COLUMNS }}
              data-grid-columns={ROSTER_GRID_COLUMNS}
              data-student-id={row.student.id}
              onClick={() => onSelect(row.student.id)}
              onDoubleClick={() => onOpen(row.student.id)}
            >
              <span className="roster-overview-student">
                <kbd>{row.ordinal}</kbd>
                <b>{row.student.display_name}</b>
                {row.unreadCount > 0 && <i aria-label={`${row.unreadCount} 条未读`} />}
              </span>
              <span className="roster-overview-profile">{profileMetric(row.data.profile)}</span>
              <span className={`roster-completion ${completionTone}`}>
                <i><em style={{ width: `${row.completionPercent == null ? 0 : Math.max(0, Math.min(100, row.completionPercent))}%` }} /></i>
                <b>{completion}</b>
              </span>
              <span className="roster-number">{tonnage ?? '—'}{tonnage != null && <small>t</small>}</span>
              {/* No roster-level RPE aggregate exists yet; keep the shared thresholds ready for the backend field. */}
              <span className="roster-number roster-rpe">—</span>
              <RosterE1rmBadges overview={row.data.overview} />
              <span className="roster-number roster-distance">{distance}</span>
              <span className="roster-plan-cell">
                <span className={`roster-plan-badge ${row.pending == null ? 'unknown' : row.pending ? 'pending' : 'planned'}`}>
                  {row.pending == null ? '—' : row.pending ? '待排' : '已排'}
                </span>
                {row.redFlag && <span className="roster-red-flag">{row.redFlag}</span>}
                {row.pending === true && (
                  <button
                    type="button"
                    className="roster-write"
                    onClick={(event) => {
                      event.stopPropagation()
                      onOpen(row.student.id)
                    }}
                  >
                    排下周 ↵
                  </button>
                )}
              </span>
            </div>
          )
        })}
        {visibleRows.length === 0 && <div className="roster-overview-empty">暂无符合条件的学员</div>}
      </div>
    </section>
  )
}

// ── 单人档案（下钻态，原 StudentBoard 主体不变）───────────────────
export function StudentDetail({ students, studentId, onStudent, onBack, catalog, index }: {
  students: CoachStudent[]
  studentId: string
  onStudent: (id: string) => void
  onBack: () => void
  catalog?: Catalog | null
  index?: ExerciseIndex | null
}) {
  const [overview, setOverview] = useState<ExerciseStatsOverview | null>(null), [profile, setProfile] = useState<StudentOnboardingProfile | null>(null)
  const [exerciseId, setExerciseId] = useState(''), [detail, setDetail] = useState<ExerciseStatsDetail | null>(null), [query, setQuery] = useState('')
  useEffect(() => {
    let current = true
    setOverview(null); setProfile(null); setExerciseId(''); setDetail(null)
    if (!studentId) return () => { current = false }
    void Promise.all([getExerciseStatsOverview(studentId), getStudentOnboarding(studentId)])
      .then(([o, p]) => {
        if (!current) return
        setOverview(o); setProfile(p); setExerciseId(o.exercises[0]?.exercise_id ?? '')
      })
    return () => { current = false }
  }, [studentId])
  useEffect(() => {
    let current = true
    setDetail(null)
    if (studentId && exerciseId) void getExerciseStats(studentId, exerciseId).then((next) => {
      if (current) setDetail(next)
    })
    return () => { current = false }
  }, [studentId, exerciseId])
  const exercises = useMemo(() => overview?.exercises.filter((e) => e.name.toLowerCase().includes(query.toLowerCase())) ?? [], [overview, query])
  return <main className="data-page"><PageTop title="学员看板" students={students} studentId={studentId} onStudent={onStudent} onBack={onBack} tail={<span className="page-status">● 最近训练 {shortDate(overview?.last_trained_at)}</span>} />
    <div className="overview-cards"><article><h3>登记 1RM</h3><div className="rm-three"><span><b>{kg(overview?.one_rm.squat)}</b><small>深蹲</small></span><span><b>{kg(overview?.one_rm.bench)}</b><small>卧推</small></span><span><b>{kg(overview?.one_rm.deadlift)}</b><small>硬拉</small></span></div></article><article><h3>画像</h3><p>{profile ? profileLine(profile) : '加载中…'}</p><p>{profile?.is_competing ? `备赛 ${shortDate(profile.competition_date)} · ${profile.target_weight_class ?? '未填级别'}` : '暂无备赛计划'} · {profile?.injury_notes || '无伤病备注'}</p></article><article><h3>近 4 周</h3><p>出勤 {overview?.recent_4w.trained_days ?? '—'} / {overview?.recent_4w.total_planned_days ?? '—'} 天</p><p>完成率 {overview ? Math.round(overview.recent_4w.completion_rate * 100) : '—'}%</p></article><StudentPlanCapacityCard studentId={studentId} catalog={catalog} index={index} /></div>
    <div className="board-grid"><aside className="exercise-list"><input placeholder="搜索动作…" value={query} onChange={(e) => setQuery(e.target.value)} />{exercises.map((e) => <button className={exerciseId === e.exercise_id ? 'active' : ''} onClick={() => setExerciseId(e.exercise_id)} key={e.exercise_id}><span>{e.name}</span><small>{e.session_count} 次</small></button>)}</aside><section className="exercise-archive">{detail ? <><div><RmStrip detail={detail} /><h3>次数 PR</h3><table className="pr-table"><thead><tr><th>次数</th><th>重量</th><th>日期</th></tr></thead><tbody>{detail.rep_prs.map((p) => <tr key={p.reps}><td>{p.reps}RM</td><td>{kg(p.weight_kg)} {p.source === 'imported' && <i>导</i>}</td><td>{shortDate(p.logged_at)}</td></tr>)}</tbody></table><h3>近 6 次顶组 RPE</h3><div className="rpe-bars">{detail.recent_sessions.slice(0, 6).reverse().map((s) => { const rpe = Math.max(...s.sets.map((x) => Number(x.rpe ?? 0))); return <span key={s.date}><i style={{ height: `${Math.max(4, rpe * 5)}px` }} /><small>{rpe || '—'}</small></span> })}</div></div><div><h3>近期执行</h3><SessionDetail detail={detail} /></div></> : <div className="empty-state">选择动作查看档案</div>}</section></div>
  </main>
}

export function StudentBoard(props: RosterBoardProps) {
  return <RosterBoard {...props} />
}
