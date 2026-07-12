import { useEffect, useMemo, useState } from 'react'
import { getExerciseStats, getExerciseStatsOverview } from '../../api/coach'
import { getStudentOnboarding } from '../../api/plans'
import type { CoachStudent, ExerciseStatsDetail, ExerciseStatsOverview, StudentOnboardingProfile } from '../../api/types'
import { PageTop, daysSince, kg, profileLine, relativeDays, shortDate } from './WorkspaceCommon'

export function RmStrip({ detail, weight }: { detail: ExerciseStatsDetail; weight?: number | null }) {
  if (!detail.e1rm) return null
  const percent = weight != null ? Math.round(weight / Number(detail.e1rm.value) * 100) : null
  return <div className="rm-strip"><span><b>{kg(detail.e1rm.value)}</b><small>e1RM · 后端滚动值</small></span><span><b>{kg(detail.one_rm_reference)}</b><small>登记 1RM</small></span>{percent != null && <span><b className="red">{percent}%</b><small>{weight} ÷ e1RM</small></span>}</div>
}
export function SessionDetail({ detail, limit = 6 }: { detail: ExerciseStatsDetail; limit?: number }) {
  return <div className="sessions">{detail.recent_sessions.slice(0, limit).map((s) => <section className="session" key={s.date}><header><b>{shortDate(s.date)}</b><span>{s.sets.length} 组</span></header>{s.sets.map((set) => <div className="set-line" key={set.set_index}><span>{set.set_index}</span><b>{kg(set.weight_kg)}kg × {set.reps}</b><span>{set.rpe ? `@${Number(set.rpe)}` : '—'}</span>{set.assumed && <i>导</i>}{set.has_video && <button title="播放该组视频">▶</button>}<em className={set.failed ? 'failed' : ''}>{set.failed ? '力竭' : set.completed ? '✓' : '—'}</em></div>)}</section>)}</div>
}

// ── 全体花名册（扫视态）+ 分诊信号 ────────────────────────────────
// 分诊阈值集中一处，可调；灯是纯前端 UX 启发式（派生自 last_trained_at），非训练算法。
const ROSTER_TRIAGE = { normalMaxDays: 3, slowingMaxDays: 7 }
type Triage = 'normal' | 'slowing' | 'dropped'
const triageLabel: Record<Triage, string> = { normal: '正常（≤3 天）', slowing: '放缓（4–7 天）', dropped: '掉线（>7 天或无记录）' }
function triageOf(lastTrainedAt: string | null | undefined): Triage {
  const d = daysSince(lastTrainedAt)
  if (d == null || d > ROSTER_TRIAGE.slowingMaxDays) return 'dropped'
  if (d > ROSTER_TRIAGE.normalMaxDays) return 'slowing'
  return 'normal'
}

interface RosterEntry { overview: ExerciseStatsOverview | null; profile: StudentOnboardingProfile | null; loaded: boolean }
type SortKey = 'lastTrained' | 'completion'

function RosterBoard({ students, onOpen }: { students: CoachStudent[]; onOpen: (id: string) => void }) {
  const [entries, setEntries] = useState<Record<string, RosterEntry>>({})
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: 'lastTrained', dir: -1 })
  useEffect(() => {
    let alive = true
    setEntries({})
    // Fan out one lightweight read per student; each fails independently so one
    // bad student never blanks the whole roster. Coaches have single-digit rosters.
    students.forEach((s) => {
      void Promise.all([
        getExerciseStatsOverview(s.id).catch(() => null),
        getStudentOnboarding(s.id).catch(() => null),
      ]).then(([overview, profile]) => {
        if (alive) setEntries((prev) => ({ ...prev, [s.id]: { overview, profile, loaded: true } }))
      })
    })
    return () => { alive = false }
  }, [students])

  const metric = (key: SortKey, e?: RosterEntry) => {
    const o = e?.overview
    if (key === 'lastTrained') { const d = daysSince(o?.last_trained_at); return d == null ? Number.MAX_SAFE_INTEGER : d }
    return o ? o.recent_4w.completion_rate : -1
  }
  const rows = useMemo(
    () => [...students].sort((a, b) => (metric(sort.key, entries[a.id]) - metric(sort.key, entries[b.id])) * sort.dir),
    [students, entries, sort],
  )
  const onSort = (key: SortKey) => setSort((s) => (s.key === key ? { key, dir: (s.dir === 1 ? -1 : 1) as 1 | -1 } : { key, dir: key === 'lastTrained' ? -1 : 1 }))
  const arrow = (key: SortKey) => (sort.key === key ? (sort.dir === -1 ? ' ↓' : ' ↑') : '')
  const loadedCount = students.filter((s) => entries[s.id]?.loaded).length

  return <main className="data-page">
    <header className="page-top"><span className="page-eyebrow">COACH / 学员看板</span><span className="page-divider" /><span className="page-label">全体 {students.length} 名</span><span className="page-spacer" /><span className="page-status">● 已载入 {loadedCount}/{students.length}</span></header>
    <div className="roster-wrap"><table className="roster-table">
      <thead><tr>
        <th className="roster-dot-col" aria-label="状态" />
        <th>学员</th>
        <th className="roster-sortable" onClick={() => onSort('lastTrained')}>最近训练{arrow('lastTrained')}</th>
        <th>近 4 周出勤</th>
        <th className="roster-sortable" onClick={() => onSort('completion')}>完成率{arrow('completion')}</th>
        <th>深蹲</th><th>卧推</th><th>硬拉</th>
        <th>标记</th>
      </tr></thead>
      <tbody>{rows.map((s) => {
        const e = entries[s.id], o = e?.overview, p = e?.profile
        const t = triageOf(o?.last_trained_at)
        const injured = !!(p?.injury_notes || (p?.injury_areas && p.injury_areas.length > 0))
        const planned = o?.recent_4w.total_planned_days ?? 0
        const rate = o ? Math.round(o.recent_4w.completion_rate * 100) : null
        return <tr key={s.id} className="roster-row" onClick={() => onOpen(s.id)}>
          <td><span className={`roster-dot ${e?.loaded ? t : 'loading'}`} title={e?.loaded ? triageLabel[t] : '载入中'} /></td>
          <td className="roster-name">{s.display_name}{s.status === 'in_evaluation' && <span className="roster-tag">评估中</span>}</td>
          <td>{!e?.loaded ? '…' : relativeDays(o?.last_trained_at)}</td>
          <td>{o ? <span className="roster-attend"><b>{o.recent_4w.trained_days}/{planned}</b><i><em style={{ width: `${planned ? Math.min(100, o.recent_4w.trained_days / planned * 100) : 0}%` }} /></i></span> : '—'}</td>
          <td>{rate == null ? '—' : `${rate}%`}</td>
          <td>{kg(o?.one_rm.squat)}</td><td>{kg(o?.one_rm.bench)}</td><td>{kg(o?.one_rm.deadlift)}</td>
          <td className="roster-flags">{p?.is_competing && <span title={`备赛${p.competition_date ? ' ' + shortDate(p.competition_date) : ''}`}>🏆</span>}{injured && <span title={p?.injury_notes || '有伤病记录'}>🩹</span>}</td>
        </tr>
      })}</tbody>
    </table></div>
  </main>
}

// ── 单人档案（下钻态，原 StudentBoard 主体不变）───────────────────
function StudentDetail({ students, studentId, onStudent, onBack }: { students: CoachStudent[]; studentId: string; onStudent: (id: string) => void; onBack: () => void }) {
  const [overview, setOverview] = useState<ExerciseStatsOverview | null>(null), [profile, setProfile] = useState<StudentOnboardingProfile | null>(null)
  const [exerciseId, setExerciseId] = useState(''), [detail, setDetail] = useState<ExerciseStatsDetail | null>(null), [query, setQuery] = useState('')
  useEffect(() => { setOverview(null); setProfile(null); setExerciseId(''); setDetail(null); if (!studentId) return; void Promise.all([getExerciseStatsOverview(studentId), getStudentOnboarding(studentId)]).then(([o, p]) => { setOverview(o); setProfile(p); setExerciseId(o.exercises[0]?.exercise_id ?? '') }) }, [studentId])
  useEffect(() => { setDetail(null); if (studentId && exerciseId) void getExerciseStats(studentId, exerciseId).then(setDetail) }, [studentId, exerciseId])
  const exercises = useMemo(() => overview?.exercises.filter((e) => e.name.toLowerCase().includes(query.toLowerCase())) ?? [], [overview, query])
  return <main className="data-page"><PageTop title="学员看板" students={students} studentId={studentId} onStudent={onStudent} onBack={onBack} tail={<span className="page-status">● 最近训练 {shortDate(overview?.last_trained_at)}</span>} />
    <div className="overview-cards"><article><h3>登记 1RM</h3><div className="rm-three"><span><b>{kg(overview?.one_rm.squat)}</b><small>深蹲</small></span><span><b>{kg(overview?.one_rm.bench)}</b><small>卧推</small></span><span><b>{kg(overview?.one_rm.deadlift)}</b><small>硬拉</small></span></div></article><article><h3>画像</h3><p>{profile ? profileLine(profile) : '加载中…'}</p><p>{profile?.is_competing ? `备赛 ${shortDate(profile.competition_date)} · ${profile.target_weight_class ?? '未填级别'}` : '暂无备赛计划'} · {profile?.injury_notes || '无伤病备注'}</p></article><article><h3>近 4 周</h3><p>出勤 {overview?.recent_4w.trained_days ?? '—'} / {overview?.recent_4w.total_planned_days ?? '—'} 天</p><p>完成率 {overview ? Math.round(overview.recent_4w.completion_rate * 100) : '—'}%</p></article></div>
    <div className="board-grid"><aside className="exercise-list"><input placeholder="搜索动作…" value={query} onChange={(e) => setQuery(e.target.value)} />{exercises.map((e) => <button className={exerciseId === e.exercise_id ? 'active' : ''} onClick={() => setExerciseId(e.exercise_id)} key={e.exercise_id}><span>{e.name}</span><small>{e.session_count} 次</small></button>)}</aside><section className="exercise-archive">{detail ? <><div><RmStrip detail={detail} /><h3>次数 PR</h3><table className="pr-table"><thead><tr><th>次数</th><th>重量</th><th>日期</th></tr></thead><tbody>{detail.rep_prs.map((p) => <tr key={p.reps}><td>{p.reps}RM</td><td>{kg(p.weight_kg)} {p.source === 'imported' && <i>导</i>}</td><td>{shortDate(p.logged_at)}</td></tr>)}</tbody></table><h3>近 6 次顶组 RPE</h3><div className="rpe-bars">{detail.recent_sessions.slice(0, 6).reverse().map((s) => { const rpe = Math.max(...s.sets.map((x) => Number(x.rpe ?? 0))); return <span key={s.date}><i style={{ height: `${Math.max(4, rpe * 5)}px` }} /><small>{rpe || '—'}</small></span> })}</div></div><div><h3>近期执行</h3><SessionDetail detail={detail} /></div></> : <div className="empty-state">选择动作查看档案</div>}</section></div>
  </main>
}

export function StudentBoard({ students }: { students: CoachStudent[] }) {
  const [detailId, setDetailId] = useState<string | null>(null)
  if (detailId && students.some((s) => s.id === detailId))
    return <StudentDetail students={students} studentId={detailId} onStudent={setDetailId} onBack={() => setDetailId(null)} />
  return <RosterBoard students={students} onOpen={setDetailId} />
}
