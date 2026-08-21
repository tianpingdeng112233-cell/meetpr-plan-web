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
import { fmt, S } from '../../i18n/strings'
import { StudentPlanCursorBadges } from '../plan-editor/components/StudentPlanCursorBadges'
import { InlineFail, useDelayedLoading } from '../../components/states'
import { isFailedRosterDatum, type FailedRosterDatum } from './rosterOverview'

export function RmStrip({ detail, weight }: { detail: ExerciseStatsDetail; weight?: number | null }) {
  // Main lift = backend supplies a 登记 1RM reference (null for non-main lifts). Show the
  // strip whenever it's a main lift — even with no logged data yet, the 登记 1RM still
  // matters. e1RM reads「—」until the student has eligible sets; the % needs e1RM.
  if (!detail.e1rm && detail.one_rm_reference == null) return null
  const percent = detail.e1rm && weight != null ? Math.round(weight / Number(detail.e1rm.value) * 100) : null
  return <div className="rm-strip"><span><b>{detail.e1rm ? kg(detail.e1rm.value) : '—'}</b><small>{S.stats.board.e1rmBackend}</small></span><span><b>{kg(detail.one_rm_reference)}</b><small>{S.stats.board.registered1rm}</small></span>{percent != null && weight != null && <span><b className="red">{percent}%</b><small>{S.stats.board.weightRatioE1rm(weight)}</small></span>}</div>
}
export function SessionDetail({ detail, limit = 6 }: { detail: ExerciseStatsDetail; limit?: number }) {
  return <div className="sessions">{detail.recent_sessions.slice(0, limit).map((s) => <section className="session" key={s.date}><header><b>{shortDate(s.date)}</b><span>{S.common.countSets(s.sets.length)}</span></header>{s.sets.map((set) => <div className="set-line" key={set.set_index}><span>{set.set_index}</span><b>{kg(set.weight_kg)}kg × {set.reps}</b><span>{set.rpe ? `@${Number(set.rpe)}` : '—'}</span>{set.assumed && <i>{S.stats.context.importedShort}</i>}{set.has_video && <button title={S.stats.board.playSetVideo}>▶</button>}<em className={set.failed ? 'failed' : ''}>{set.failed ? S.common.failure : set.completed ? '✓' : '—'}</em></div>)}</section>)}</div>
}

// ── 总览（mock 1:1 扫视表）──────────────────────────────────────
export const ROSTER_GRID_COLUMNS = '290px 104px 116px 84px 78px 156px 80px 1fr'

// ── 花名册 e1RM 徽章(拍板 A,2026-08-09:一列紧凑三项;↑绿 ↓红 →灰,红仅点缀不大面积)──
const E1RM_FAMILIES: LiftFamily[] = ['squat', 'bench', 'deadlift']
const E1RM_FAMILY_ABBR: Record<LiftFamily, string> = { squat: 'S', bench: 'B', deadlift: 'D' }
const E1RM_TREND_ARROWS: Record<E1rmTrend, string> = { up: '↑', flat: '→', down: '↓', new: '' }
/** 趋势方向一律采用后端 e1rm_series[family].trend,前端不重算。 */
export const e1rmTrendArrow = (trend: E1rmTrend | undefined): string => trend ? E1RM_TREND_ARROWS[trend] : ''

export function RosterE1rmBadges({ overview, onRetry }: {
  overview: ExerciseStatsOverview | null | FailedRosterDatum | undefined
  onRetry?: () => void
}) {
  const loading = overview === undefined
  const visibleSkeleton = useDelayedLoading(loading)
  if (loading || visibleSkeleton) {
    return <span className="roster-e1rm roster-e1rm-loading">{visibleSkeleton && <i className="state-cell-skeleton" />}</span>
  }
  if (isFailedRosterDatum(overview)) {
    return <span className="roster-e1rm roster-e1rm-failed"><InlineFail label={S.stats.board.e1rmFetchFailed} retry={() => onRetry?.()} /></span>
  }
  const hasAnyValue = overview != null && E1RM_FAMILIES.some((family) => {
    const registered = overview.one_rm[family]
    const points = overview.e1rm_series?.[family]?.points ?? []
    return (registered != null && Number.isFinite(Number(registered)))
      || points.some((point) => Number.isFinite(Number(point.value)))
  })
  if (overview === null || !hasAnyValue) {
    return <span className="roster-e1rm roster-e1rm-empty">{S.stats.board.e1rmEmpty}</span>
  }
  return <span className="roster-e1rm">{E1RM_FAMILIES.map((family) => {
    const series = overview?.e1rm_series?.[family]
    const point = series?.points.length ? series.points[series.points.length - 1] : null
    if (point && Number.isFinite(Number(point.value))) {
      return <em key={family} data-testid={`roster-e1rm-${family}`} title={S.stats.board.measuredTitle(S.common.liftFamily[family], shortDate(point.date))}>
        <small>{E1RM_FAMILY_ABBR[family]}</small><b>{Math.round(Number(point.value))}</b>
        {e1rmTrendArrow(series?.trend) && <i className={`trend-${series?.trend}`} aria-label={S.stats.board.trendAria(String(series?.trend))}>{e1rmTrendArrow(series?.trend)}</i>}
      </em>
    }
    // 无实测回落登记值并视觉降级——「没数据」和「数据是学员自填的」对教练是两回事,
    // 所以 .registered(点状下划线)只标登记值,纯无数据态不带。
    const registered = overview?.one_rm[family]
    return <em key={family} className={registered == null ? undefined : 'registered'} data-testid={`roster-e1rm-${family}`} title={registered == null ? S.stats.board.noMeasuredOrRegistered(S.common.liftFamily[family]) : S.stats.board.registeredNoMeasured(S.common.liftFamily[family])}>
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
  onRetryOverview?: (studentId: string) => void
  onRetryProfile?: (studentId: string) => void
  onRetryWeekTonnage?: (studentId: string) => void
  onRetryPlans?: (studentId: string) => void
}

function RosterCellState({ loading, width, align = 'right', className = '', children }: {
  loading: boolean
  width: number
  align?: 'left' | 'right'
  className?: string
  children: React.ReactNode
}) {
  const visible = useDelayedLoading(loading)
  if (loading || visible) {
    return <span className={`roster-cell-skeleton ${align} ${className}`.trim()}>{visible && <i className="state-cell-skeleton" style={{ width }} />}</span>
  }
  return <>{children}</>
}

function MissingValue({ className = '' }: { className?: string }) {
  return <span className={`roster-missing ${className}`.trim()}>—</span>
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
  onRetryOverview,
  onRetryProfile,
  onRetryWeekTonnage,
  onRetryPlans,
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
    { id: 'all', label: S.stats.board.allStudents, count: counts.all },
    { id: 'pending', label: S.stats.board.pending, count: counts.pending },
    { id: 'attention', label: S.stats.board.attention, count: counts.attention },
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
    <section className="roster-overview" aria-label={S.stats.board.overview}>
      <div className="roster-segments" role="tablist" aria-label={S.stats.board.filter}>
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
        <span>{S.stats.board.athlete}</span>
        <span>{S.stats.board.levelWeight}</span>
        <span>{S.stats.board.completionRate}</span>
        <span>{S.stats.board.weeklyVolume}</span>
        <span>RPE</span>
        <span>{S.stats.board.e1rm}</span>
        <span>{S.stats.board.meetDistance}</span>
        <span>{S.stats.board.nextWeekPlan}</span>
      </div>
      <div className="roster-overview-scroll">
        {visibleRows.map((row) => {
          const selected = row.student.id === selectedStudentId
          const overviewLoading = row.data.overview === undefined
          const overviewFailed = isFailedRosterDatum(row.data.overview)
          const profileLoading = row.data.profile === undefined && !row.data.profileError
          const tonnageLoading = row.data.weekTonnageKg === undefined && !row.data.plansError
          const tonnageFailed = isFailedRosterDatum(row.data.weekTonnageKg) || (row.data.weekTonnageKg === undefined && row.data.plansError === true)
          const plansLoaded = Object.hasOwn(plansByStudent, row.student.id)
          const completionTone = completionRateTone(row.completionPercent)
          const tonnage = typeof row.data.weekTonnageKg === 'number'
            ? (row.data.weekTonnageKg / 1000).toFixed(1)
            : null
          const distance = row.isRegistered === false
            ? S.stats.board.notRegistered
            : row.isRegistered === null || row.competitionDays == null ? '—' : S.stats.board.days(row.competitionDays)
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
                {row.unreadCount > 0 && <i aria-label={S.stats.board.unread(row.unreadCount)} />}
                <StudentPlanCursorBadges cursor={row.data.planCursor} compact />
              </span>
              <span className="roster-overview-profile">{profileMetric(row.data.profile)}</span>
              <RosterCellState loading={overviewLoading} width={56} align="left">
                {overviewFailed
                  ? <InlineFail retry={() => onRetryOverview?.(row.student.id)} />
                  : row.completionPercent == null
                    ? <MissingValue className="roster-completion-missing" />
                    : <span className={`roster-completion ${completionTone}`}>
                        <i><em style={{ width: `${Math.max(0, Math.min(100, row.completionPercent))}%` }} /></i>
                        <b>{row.completionPercent}%</b>
                      </span>}
              </RosterCellState>
              <RosterCellState loading={tonnageLoading} width={30}>
                {tonnageFailed
                  ? <span className="roster-cell-right"><InlineFail retry={() => row.data.plansError ? onRetryPlans?.(row.student.id) : onRetryWeekTonnage?.(row.student.id)} /></span>
                  : <span className="roster-number">{tonnage ?? '—'}{tonnage != null && <small>t</small>}</span>}
              </RosterCellState>
              {/* No roster-level RPE aggregate exists yet; keep the shared thresholds ready for the backend field. */}
              <RosterCellState loading={overviewLoading} width={24}>
                {overviewFailed
                  ? <span className="roster-cell-right"><InlineFail retry={() => onRetryOverview?.(row.student.id)} /></span>
                  : <MissingValue className="roster-rpe" />}
              </RosterCellState>
              <RosterE1rmBadges overview={row.data.overview} onRetry={() => onRetryOverview?.(row.student.id)} />
              <RosterCellState loading={profileLoading} width={24}>
                {row.data.profileError
                  ? <span className="roster-cell-right"><InlineFail retry={() => onRetryProfile?.(row.student.id)} /></span>
                  : <span className="roster-number roster-distance">{distance}</span>}
              </RosterCellState>
              <RosterCellState loading={!plansLoaded && !row.data.plansError} width={64} align="left" className="roster-plan-cell">
                {row.data.plansError
                  ? <span className="roster-plan-cell"><InlineFail retry={() => onRetryPlans?.(row.student.id)} /></span>
                  : <span className="roster-plan-cell">
                    {row.pending == null
                      ? <MissingValue />
                      : <span className={`roster-plan-badge ${row.pending ? 'pending' : 'planned'}`}>
                          {row.pending ? S.stats.board.pending : S.stats.board.planned}
                        </span>}
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
                    {S.stats.board.planNextWeek}
                  </button>
                    )}
                  </span>}
              </RosterCellState>
            </div>
          )
        })}
        {visibleRows.length === 0 && <div className="roster-overview-empty">{S.stats.board.noMatchingStudents}</div>}
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
  const exercises = useMemo(() => overview?.exercises.filter((exercise) => {
    const names = index?.namesById(exercise.exercise_id)
    const needle = query.toLowerCase()
    return exercise.name.toLowerCase().includes(needle) || (names?.name_en?.toLowerCase().includes(needle) ?? false)
  }) ?? [], [index, overview, query])
  return <main className="data-page"><PageTop title={S.stats.board.dashboard} students={students} studentId={studentId} onStudent={onStudent} onBack={onBack} tail={<span className="page-status">{S.stats.board.recentTraining} {shortDate(overview?.last_trained_at)}</span>} />
    <div className="overview-cards"><article><h3>{S.stats.board.registered1rm}</h3><div className="rm-three"><span><b>{kg(overview?.one_rm.squat)}</b><small>{S.common.squat}</small></span><span><b>{kg(overview?.one_rm.bench)}</b><small>{S.common.benchPress}</small></span><span><b>{kg(overview?.one_rm.deadlift)}</b><small>{S.common.deadlift}</small></span></div></article><article><h3>{S.stats.board.profile}</h3><p>{profile ? profileLine(profile) : S.common.loadingEllipsis}</p><p>{profile?.is_competing ? S.stats.board.preparing(shortDate(profile.competition_date), profile.target_weight_class ?? S.stats.board.weightClassMissing) : S.stats.board.noCompetition} · {profile?.injury_notes || S.stats.board.noInjury}</p></article><article><h3>{S.stats.board.lastFourWeeks}</h3><p>{S.stats.board.attendanceOf(overview?.recent_4w.trained_days ?? '—', overview?.recent_4w.total_planned_days ?? '—')}</p><p>{S.stats.board.completion(`${overview ? Math.round(overview.recent_4w.completion_rate * 100) : '—'}%`)}</p></article><StudentPlanCapacityCard studentId={studentId} catalog={catalog} index={index} /></div>
    <div className="board-grid"><aside className="exercise-list"><input placeholder={S.stats.board.searchExercise} value={query} onChange={(e) => setQuery(e.target.value)} />{exercises.map((exercise) => <button className={exerciseId === exercise.exercise_id ? 'active' : ''} onClick={() => setExerciseId(exercise.exercise_id)} key={exercise.exercise_id}><span>{fmt.exerciseName(index?.namesById(exercise.exercise_id) ?? exercise)}</span><small>{S.stats.board.sessions(exercise.session_count)}</small></button>)}</aside><section className="exercise-archive">{detail ? <><div><RmStrip detail={detail} /><h3>{S.stats.board.repsPr}</h3><table className="pr-table"><thead><tr><th>{S.common.reps}</th><th>{S.common.weight}</th><th>{S.stats.board.date}</th></tr></thead><tbody>{detail.rep_prs.map((p) => <tr key={p.reps}><td>{p.reps}RM</td><td>{kg(p.weight_kg)} {p.source === 'imported' && <i>{S.stats.context.importedShort}</i>}</td><td>{shortDate(p.logged_at)}</td></tr>)}</tbody></table><h3>{S.stats.board.lastSixTopSets}</h3><div className="rpe-bars">{detail.recent_sessions.slice(0, 6).reverse().map((s) => { const rpe = Math.max(...s.sets.map((x) => Number(x.rpe ?? 0))); return <span key={s.date}><i style={{ height: `${Math.max(4, rpe * 5)}px` }} /><small>{rpe || '—'}</small></span> })}</div></div><div><h3>{S.stats.board.recentExecution}</h3><SessionDetail detail={detail} /></div></> : <div className="empty-state">{S.stats.board.selectExercise}</div>}</section></div>
  </main>
}

export function StudentBoard(props: RosterBoardProps) {
  return <RosterBoard {...props} />
}
