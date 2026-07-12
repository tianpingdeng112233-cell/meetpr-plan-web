import { useEffect, useMemo, useState } from 'react'
import { getExerciseStats, getExerciseStatsOverview } from '../../api/coach'
import { getStudentOnboarding } from '../../api/plans'
import type { CoachStudent, ExerciseStatsDetail, ExerciseStatsOverview, StudentOnboardingProfile } from '../../api/types'
import { PageTop, kg, profileLine, shortDate } from './WorkspaceCommon'

export function RmStrip({ detail, weight }: { detail: ExerciseStatsDetail; weight?: number | null }) {
  if (!detail.e1rm) return null
  const percent = weight != null ? Math.round(weight / Number(detail.e1rm.value) * 100) : null
  return <div className="rm-strip"><span><b>{kg(detail.e1rm.value)}</b><small>e1RM · 后端滚动值</small></span><span><b>{kg(detail.one_rm_reference)}</b><small>登记 1RM</small></span>{percent != null && <span><b className="red">{percent}%</b><small>{weight} ÷ e1RM</small></span>}</div>
}
export function SessionDetail({ detail, limit = 6 }: { detail: ExerciseStatsDetail; limit?: number }) {
  return <div className="sessions">{detail.recent_sessions.slice(0, limit).map((s) => <section className="session" key={s.date}><header><b>{shortDate(s.date)}</b><span>{s.sets.length} 组</span></header>{s.sets.map((set) => <div className="set-line" key={set.set_index}><span>{set.set_index}</span><b>{kg(set.weight_kg)}kg × {set.reps}</b><span>{set.rpe ? `@${Number(set.rpe)}` : '—'}</span>{set.assumed && <i>导</i>}{set.has_video && <button title="播放该组视频">▶</button>}<em className={set.failed ? 'failed' : ''}>{set.failed ? '力竭' : set.completed ? '✓' : '—'}</em></div>)}</section>)}</div>
}

export function StudentBoard({ students, studentId, onStudent }: { students: CoachStudent[]; studentId: string; onStudent: (id: string) => void }) {
  const [overview, setOverview] = useState<ExerciseStatsOverview | null>(null), [profile, setProfile] = useState<StudentOnboardingProfile | null>(null)
  const [exerciseId, setExerciseId] = useState(''), [detail, setDetail] = useState<ExerciseStatsDetail | null>(null), [query, setQuery] = useState('')
  useEffect(() => { setOverview(null); setProfile(null); setExerciseId(''); setDetail(null); if (!studentId) return; void Promise.all([getExerciseStatsOverview(studentId), getStudentOnboarding(studentId)]).then(([o, p]) => { setOverview(o); setProfile(p); setExerciseId(o.exercises[0]?.exercise_id ?? '') }) }, [studentId])
  useEffect(() => { setDetail(null); if (studentId && exerciseId) void getExerciseStats(studentId, exerciseId).then(setDetail) }, [studentId, exerciseId])
  const exercises = useMemo(() => overview?.exercises.filter((e) => e.name.toLowerCase().includes(query.toLowerCase())) ?? [], [overview, query])
  return <main className="data-page"><PageTop title="学员看板" students={students} studentId={studentId} onStudent={onStudent} tail={<span className="page-status">● 最近训练 {shortDate(overview?.last_trained_at)}</span>} />
    <div className="overview-cards"><article><h3>登记 1RM</h3><div className="rm-three"><span><b>{kg(overview?.one_rm.squat)}</b><small>深蹲</small></span><span><b>{kg(overview?.one_rm.bench)}</b><small>卧推</small></span><span><b>{kg(overview?.one_rm.deadlift)}</b><small>硬拉</small></span></div></article><article><h3>画像</h3><p>{profile ? profileLine(profile) : '加载中…'}</p><p>{profile?.is_competing ? `备赛 ${shortDate(profile.competition_date)} · ${profile.target_weight_class ?? '未填级别'}` : '暂无备赛计划'} · {profile?.injury_notes || '无伤病备注'}</p></article><article><h3>近 4 周</h3><p>出勤 {overview?.recent_4w.trained_days ?? '—'} / {overview?.recent_4w.total_planned_days ?? '—'} 天</p><p>完成率 {overview ? Math.round(overview.recent_4w.completion_rate * 100) : '—'}%</p></article></div>
    <div className="board-grid"><aside className="exercise-list"><input placeholder="搜索动作…" value={query} onChange={(e) => setQuery(e.target.value)} />{exercises.map((e) => <button className={exerciseId === e.exercise_id ? 'active' : ''} onClick={() => setExerciseId(e.exercise_id)} key={e.exercise_id}><span>{e.name}</span><small>{e.session_count} 次</small></button>)}</aside><section className="exercise-archive">{detail ? <><div><RmStrip detail={detail} /><h3>次数 PR</h3><table className="pr-table"><thead><tr><th>次数</th><th>重量</th><th>日期</th></tr></thead><tbody>{detail.rep_prs.map((p) => <tr key={p.reps}><td>{p.reps}RM</td><td>{kg(p.weight_kg)} {p.source === 'imported' && <i>导</i>}</td><td>{shortDate(p.logged_at)}</td></tr>)}</tbody></table><h3>近 6 次顶组 RPE</h3><div className="rpe-bars">{detail.recent_sessions.slice(0, 6).reverse().map((s) => { const rpe = Math.max(...s.sets.map((x) => Number(x.rpe ?? 0))); return <span key={s.date}><i style={{ height: `${Math.max(4, rpe * 5)}px` }} /><small>{rpe || '—'}</small></span> })}</div></div><div><h3>近期执行</h3><SessionDetail detail={detail} /></div></> : <div className="empty-state">选择动作查看档案</div>}</section></div>
  </main>
}
