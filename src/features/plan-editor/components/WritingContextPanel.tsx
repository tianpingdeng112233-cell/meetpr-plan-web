import { useEffect, useLayoutEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { getExerciseStats } from '../../../api/coach'
import type { ExerciseStatsDetail, StudentOnboardingProfile } from '../../../api/types'
import type { DayCol, ExerciseRow } from '../types'
import { RmStrip, SessionDetail } from '../../workspace/StatsViews'
import { kg, profileLine, shortDate } from '../../workspace/WorkspaceCommon'

export function writingContextLevel(row: ExerciseRow | null): 1 | 2 | 3 | 4 {
  if (!row?.exerciseId) return 1
  if (Number.parseInt(row.reps, 10) > 0) return 4
  return row.boxes.length > 0 ? 3 : 2
}

export function profileEmptyMessage(profile: StudentOnboardingProfile | null | undefined): string | null {
  if (profile === undefined) return '画像载入中…'
  if (profile === null) return '学员未填写画像'
  return null
}

const PANEL_WIDTH = 316
const PANEL_GAP = 10
const VIEWPORT_MARGIN = 8

export function writingContextPosition(rect: Pick<DOMRect, 'left' | 'right' | 'top'>, viewportWidth: number, viewportHeight: number) {
  const roomOnRight = viewportWidth - rect.right
  const roomOnLeft = rect.left
  const flip = roomOnRight < PANEL_WIDTH + PANEL_GAP && roomOnLeft > roomOnRight
  const preferredLeft = flip ? rect.left - PANEL_WIDTH - PANEL_GAP : rect.right + PANEL_GAP
  return {
    top: Math.max(58, Math.min(rect.top, viewportHeight - 520)),
    left: Math.max(VIEWPORT_MARGIN, Math.min(preferredLeft, viewportWidth - PANEL_WIDTH - VIEWPORT_MARGIN)),
    flip,
  }
}

export function WritingContextPanel({ studentId, studentName, profile, day, row, onClose }: { studentId: string; studentName: string; profile: StudentOnboardingProfile | null | undefined; day: DayCol; row: ExerciseRow | null; onClose: () => void }) {
  const [cache, setCache] = useState<Record<string, ExerciseStatsDetail>>({}), [loadingId, setLoadingId] = useState(''), [pos, setPos] = useState({ top: 120, left: 90, flip: false })
  const exerciseId = row?.exerciseId ?? null
  useEffect(() => { if (!exerciseId || cache[exerciseId]) return; setLoadingId(exerciseId); void getExerciseStats(studentId, exerciseId).then((d) => setCache((c) => ({ ...c, [exerciseId]: d }))).finally(() => setLoadingId('')) }, [studentId, exerciseId, cache])
  useLayoutEffect(() => { const place = () => { const el = document.querySelector<HTMLElement>('.day.sel'); if (!el) return; setPos(writingContextPosition(el.getBoundingClientRect(), window.innerWidth, window.innerHeight)) }; place(); window.addEventListener('resize', place); document.querySelector('.scroller')?.addEventListener('scroll', place, true); return () => { window.removeEventListener('resize', place); document.querySelector('.scroller')?.removeEventListener('scroll', place, true) } }, [day])
  const detail = exerciseId ? cache[exerciseId] : null
  const sets = row?.boxes.length ?? 0, reps = row ? Number.parseInt(row.reps, 10) : 0
  const level = writingContextLevel(row)
  const matching = useMemo(() => detail?.recent_sessions.filter((s) => s.sets.length === sets && s.sets.every((x) => x.reps === reps)).slice(0, 2) ?? [], [detail, sets, reps])
  const weight = row?.mode === 'kg' ? row.boxes.map((b) => Number(b.val)).find((x) => Number.isFinite(x) && x > 0) ?? null : null
  return createPortal(<aside className={`writing-panel${pos.flip ? ' flip' : ''}`} style={{ top: pos.top, left: pos.left }} data-context-state={level}><span className="panel-arrow" /><header><span><b>{studentName}</b><small>{day.dateLabel} · {day.dowLabel}</small></span><button onClick={onClose} aria-label="关闭撰写上下文">✕</button></header><div className="writing-body">
    {level === 1 && <Profile profile={profile} />}
    {level > 1 && <>{detail?.e1rm && <RmStrip detail={detail} weight={level === 4 ? weight : null} />}<div className="context-chips"><b>{row?.name}</b><span>{sets || '—'} 组</span><span>× {reps || '—'} 次</span></div>{loadingId === exerciseId && <div className="empty-state">载入训练档案…</div>}{detail && detail.recent_sessions.length === 0 && <><div className="empty-state">暂无训练记录</div><details><summary>查看学员画像</summary><Profile profile={profile} compact /></details></>}
      {level === 2 && detail && detail.recent_sessions.length > 0 && <><h3>次数 PR</h3><table className="pr-table"><tbody>{detail.rep_prs.map((p) => <tr key={p.reps}><td>{p.reps}RM</td><td>{kg(p.weight_kg)} {p.source === 'imported' && <i>导</i>}</td><td>{shortDate(p.logged_at)}</td></tr>)}</tbody></table><h3>最近 3 次</h3><SessionDetail detail={{ ...detail, recent_sessions: detail.recent_sessions.slice(0, 3) }} limit={3} /></>}
      {level === 3 && detail && <><h3>{sets} 组训练 · 最近记录</h3>{(detail.by_set_count[String(sets)] ?? []).map((x) => <div className="bucket-line" key={x.date}><b>{shortDate(x.date)}</b><span>顶组 {kg(x.best_weight_kg)}kg · {x.completed_sets}/{x.set_count} 完成</span></div>)}{(detail.by_set_count[String(sets)] ?? []).length === 0 && <div className="empty-state">暂无该组数记录</div>}</>}
      {level === 4 && detail && <>{(() => { const pr = detail.rep_prs.find((p) => p.reps === reps); return <div className="best-line"><b>{pr ? `${kg(pr.weight_kg)}kg` : '—'}</b><span>{reps} 次最好成绩{pr ? ` · ${shortDate(pr.logged_at)}` : ''}</span></div> })()}<h3>{sets}×{reps} 历史 · 最近 2 次</h3>{matching.length > 0 ? <SessionDetail detail={{ ...detail, recent_sessions: matching }} limit={2} /> : <div className="empty-state">暂无组×次匹配记录</div>}</>}
    </>}
  </div></aside>, document.body)
}

function Profile({ profile, compact = false }: { profile: StudentOnboardingProfile | null | undefined; compact?: boolean }) {
  if (profile == null) return <div className="empty-state">{profileEmptyMessage(profile)}</div>
  return <div className={`panel-profile${compact ? ' compact' : ''}`}><h3>学员画像 · ONBOARDING</h3><dl><dt>基础</dt><dd>{profileLine(profile)}</dd><dt>训练年限</dt><dd>{profile.training_years != null ? `${profile.training_years} 年 · 每周 ${profile.training_days?.length ?? '—'} 天` : '未填写'}</dd><dt>技术风格</dt><dd>{[profile.squat_stance, profile.deadlift_style, profile.bench_grip].filter(Boolean).join(' · ') || '未填写'}</dd><dt>自报 1RM</dt><dd>S {kg(profile.squat_1rm_kg)} / B {kg(profile.bench_1rm_kg)} / D {kg(profile.deadlift_1rm_kg)}</dd><dt>伤病</dt><dd>{profile.injury_notes || profile.injury_areas?.join('、') || '无'}</dd><dt>备赛</dt><dd>{profile.is_competing ? `${shortDate(profile.competition_date)} · ${profile.target_weight_class || '未填级别'}` : '暂不备赛'}</dd></dl>{profile.note_to_coach && <blockquote>“{profile.note_to_coach}”</blockquote>}</div>
}
