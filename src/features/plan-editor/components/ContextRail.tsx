import { useCallback, useEffect, useLayoutEffect, useMemo, useState, type CSSProperties } from 'react'
import { getExerciseStats } from '../../../api/coach'
import type { ExerciseStatsDetail, ExerciseStatsOverview, StudentOnboardingProfile } from '../../../api/types'
import type { DayCol, ExerciseRow } from '../types'
import { rowWeightBoxes } from '../intensityModel'
import { getBoundRowInputIssue } from '../inputGuard'
import { kg, profileLine, shortDate, techniqueStyleLine } from '../../workspace/WorkspaceCommon'

/**
 * Progressive disclosure ladder, driven purely by how much of the row the coach
 * has filled in. 1 = day only, 2 = exercise bound, 3 = sets typed, 4 = reps typed.
 */
export function contextRailLevel(row: ExerciseRow | null): 1 | 2 | 3 | 4 {
  if (!row?.exerciseId) return 1
  if (Number.parseInt(row.reps, 10) > 0) return 4
  return row.boxes.length > 0 ? 3 : 2
}

/**
 * A finished line needs nothing from the rail: bound exercise, sets, reps and a
 * strength value in every live box. Reaching this state auto-collapses the rail;
 * editing the row back into an incomplete state brings it right back.
 */
export function isRowComplete(row: ExerciseRow | null): boolean {
  if (!row?.exerciseId) return false
  if (!(Number.parseInt(row.reps, 10) > 0)) return false
  if (row.boxes.length === 0) return false
  // Bodyweight sets carry no load at all — mapping and reconcile both store them
  // as empty boxes — so sets plus reps is the whole prescription.
  if (row.mode === 'bodyweight') return true
  return getBoundRowInputIssue(row) === null
}

export function profileEmptyMessage(profile: StudentOnboardingProfile | null | undefined): string | null {
  if (profile === undefined) return '画像载入中…'
  if (profile === null) return '学员未填写画像'
  return null
}

export const RAIL_WIDTH = 260
/** The week band itself bottoms out at 760px; below this combined width the rail docks. */
export const RAIL_MIN_GRID_WIDTH = 760
const RAIL_GAP = 8

export type RailMode = 'follow' | 'dock'
export const RAIL_MODE_KEY = 'meetpr.plan-editor.rail-mode'

/** Coach-chosen placement, remembered across sessions. Follow is the default. */
export function useRailMode() {
  const [mode, setMode] = useState<RailMode>(() => {
    try {
      return window.localStorage.getItem(RAIL_MODE_KEY) === 'dock' ? 'dock' : 'follow'
    } catch {
      return 'follow'
    }
  })
  const toggleMode = useCallback(() => {
    setMode((current) => {
      const next = current === 'follow' ? 'dock' : 'follow'
      try {
        window.localStorage.setItem(RAIL_MODE_KEY, next)
      } catch {
        // Storage can be unavailable in private or locked-down browser contexts.
      }
      return next
    })
  }, [])
  return [mode, toggleMode] as const
}

/**
 * Keep the rail within arm's reach of what the coach is typing: docked just to
 * the right of the selected day, flipped to its left when the day sits near the
 * right edge, and clamped so it never leaves the editor.
 */
export function railPlacement(
  dayRect: { left: number; right: number },
  containerWidth: number,
  viewport = { left: 0, right: containerWidth },
): { left: number } {
  const visibleLeft = Math.max(0, viewport.left)
  const visibleRight = Math.min(containerWidth, viewport.right)
  const right = dayRect.right + RAIL_GAP
  const left = dayRect.left - RAIL_GAP - RAIL_WIDTH
  if (right >= visibleLeft && right + RAIL_WIDTH <= visibleRight) return { left: right }
  if (left >= visibleLeft && left + RAIL_WIDTH <= visibleRight) return { left }
  // Neither side fits: keep the whole rail visible by pinning it to the
  // viewport's right edge (expressed in container-relative coordinates).
  return { left: Math.max(visibleLeft, visibleRight - RAIL_WIDTH) }
}

export interface RailLayout {
  style?: CSSProperties
  /** May temporarily differ from the saved preference on a narrow viewport. */
  placementMode: RailMode
}

/**
 * Follow mode keeps the rail pinned beside `.day.sel`; dock mode returns undefined
 * so the CSS right-edge placement applies. Re-runs on selection, scroll and resize.
 */
export function useRailPlacement(
  mode: RailMode,
  active: boolean,
  containerRef: { current: HTMLElement | null },
  selectionKey: string,
): RailLayout {
  const [layout, setLayout] = useState<RailLayout>({ placementMode: mode })
  useLayoutEffect(() => {
    const wrap = containerRef.current
    if (!active || !wrap) { setLayout({ placementMode: mode }); return }
    const place = () => {
      const wr = wrap.getBoundingClientRect()
      const viewportWidth = window.innerWidth || document.documentElement.clientWidth
      const viewport = {
        left: Math.max(0, -wr.left),
        right: Math.min(wr.width, viewportWidth - wr.left),
      }
      const narrow = viewportWidth < RAIL_WIDTH + RAIL_MIN_GRID_WIDTH
      if (mode === 'dock' || narrow) {
        const normalDockLeft = wr.width - RAIL_WIDTH
        const normalDockFits = normalDockLeft >= viewport.left
          && normalDockLeft + RAIL_WIDTH <= viewport.right
        setLayout({
          placementMode: 'dock',
          style: normalDockFits
            ? undefined
            : { left: Math.max(viewport.left, viewport.right - RAIL_WIDTH), right: 'auto' },
        })
        return
      }
      const dayEl = wrap.querySelector<HTMLElement>('.day.sel')
      if (!dayEl) return
      const dr = dayEl.getBoundingClientRect()
      setLayout({
        placementMode: 'follow',
        style: railPlacement(
          { left: dr.left - wr.left, right: dr.right - wr.left },
          wr.width,
          viewport,
        ),
      })
    }
    place()
    const scroller = wrap.querySelector('.scroller')
    scroller?.addEventListener('scroll', place)
    window.addEventListener('resize', place)
    return () => { scroller?.removeEventListener('scroll', place); window.removeEventListener('resize', place) }
  }, [mode, active, containerRef, selectionKey])
  return layout
}

/** Main lift = the backend supplies a 登记 1RM reference (null for accessories). */
export function isMainLiftDetail(detail: ExerciseStatsDetail | null): boolean {
  return detail?.one_rm_reference != null
}

export function topSetWeight(row: ExerciseRow | null): number | null {
  if (!row || row.mode === 'bodyweight') return null
  const values = rowWeightBoxes(row).filter((b) => !b.empty).map((b) => Number(b.val)).filter((v) => Number.isFinite(v) && v > 0)
  return values.length > 0 ? Math.max(...values) : null
}

interface MetricCell { value: string; label: string; tone?: 'accent' }

/** One-line history used by the v1.3 day-header context experiment. */
export function recentSessionSummary(detail: ExerciseStatsDetail | null): string | null {
  const session = detail?.recent_sessions[0]
  if (!session || session.sets.length === 0) return null
  const reps = session.sets.map((set) => set.reps).filter((value) => Number.isFinite(value))
  const weights = session.sets.map((set) => Number(set.weight_kg)).filter((value) => Number.isFinite(value) && value > 0)
  const rpes = session.sets.map((set) => Number(set.rpe)).filter((value) => Number.isFinite(value) && value > 0)
  const repLabel = reps.length > 0 && reps.every((value) => value === reps[0])
    ? String(reps[0])
    : reps.length > 0 ? `${Math.min(...reps)}–${Math.max(...reps)}` : '—'
  const loadLabel = weights.length > 0 ? ` @ ${kg(String(Math.max(...weights)))}kg` : ''
  const rpeLabel = rpes.length > 0 ? ` / RPE ${Math.max(...rpes)}` : ''
  return `${shortDate(session.date)} · ${session.sets.length}×${repLabel}${loadLabel}${rpeLabel}`
}

/**
 * Compact context mounted inside the selected training-day header. It intentionally
 * shares the rail's existing history endpoint and profile renderer. The exercise
 * history occupies the header only while the coach is actively filling the row;
 * before a row is selected and once it is complete, the header shows the full
 * student profile inline (rest-day headers keep the click-to-open popover — their
 * single line has no room for the inline block).
 */
export function DayHeaderContext({ studentId, studentName, row, profile }: {
  studentId: string
  studentName: string
  row: ExerciseRow | null
  profile: StudentOnboardingProfile | null | undefined
}) {
  const [cache, setCache] = useState<Record<string, ExerciseStatsDetail>>({})
  const [failedId, setFailedId] = useState('')
  // Exercise context only while actively filling a bound row: an unbound row has
  // no history to show, and a complete row hands the header back to the profile.
  const activeRow = row?.exerciseId && !isRowComplete(row) ? row : null
  const exerciseId = activeRow?.exerciseId ?? null
  const hasDetail = exerciseId != null && Object.prototype.hasOwnProperty.call(cache, exerciseId)
  const detail = exerciseId && hasDetail ? cache[exerciseId] : null

  useEffect(() => {
    if (!exerciseId || hasDetail) return
    let cancelled = false
    setFailedId('')
    void getExerciseStats(studentId, exerciseId)
      .then((next) => {
        if (!cancelled) setCache((current) => ({ ...current, [exerciseId]: next }))
      })
      .catch(() => {
        if (!cancelled) setFailedId(exerciseId)
      })
    return () => { cancelled = true }
  }, [studentId, exerciseId, hasDetail])

  if (!activeRow) {
    const stop = (event: { stopPropagation(): void }) => event.stopPropagation()
    return (
      <div className="dayhead-context student" data-dayhead-context="" data-context-state="student">
        <div className="dayhead-profile-inline" onMouseDown={stop} onClick={stop}>
          <b className="dayhead-profile-inline-name">{studentName}</b>
          <Profile profile={profile} compact />
        </div>
        <details className="dayhead-profile">
          <summary onMouseDown={stop} onClick={stop}>
            <b>{studentName}</b><span>· 画像</span>
          </summary>
          <div className="dayhead-profile-popover" onMouseDown={stop} onClick={stop}>
            <Profile profile={profile} compact />
          </div>
        </details>
      </div>
    )
  }

  const summary = recentSessionSummary(detail)
  const pending = !!exerciseId && !hasDetail && failedId !== exerciseId
  return (
    <div className="dayhead-context exercise" data-dayhead-context="" data-context-state="exercise" title={activeRow.name || '未命名动作'}>
      <b className="dayhead-context-name">{activeRow.name || '未命名动作'}</b>
      <span className="dayhead-context-history">
        {pending ? '训练记录载入中…'
          : failedId === exerciseId ? '记录载入失败'
            : summary ? `上次 ${summary}` : '暂无训练记录'}
      </span>
      {detail?.e1rm && <span className="dayhead-context-e1rm">e1RM {kg(detail.e1rm.value)}kg</span>}
    </div>
  )
}

/**
 * The band is the one thing the coach must read at a glance, so it always fills
 * with the most decision-relevant numbers available at the current level.
 */
export function metricCells(args: {
  level: 1 | 2 | 3 | 4
  profile: StudentOnboardingProfile | null | undefined
  detail: ExerciseStatsDetail | null
  overview?: ExerciseStatsOverview | null
  reps: number
  weight: number | null
}): MetricCell[] {
  const { level, detail, overview, reps, weight } = args
  if (level === 1 || !detail) {
    // Day level leads with measured rolling e1RMs (self-reported 1RM lives in
    // the profile block below); an older backend without the field reads「—」.
    return [
      { value: overview?.e1rm?.squat ? kg(overview.e1rm.squat.value) : '—', label: '深蹲 e1RM' },
      { value: overview?.e1rm?.bench ? kg(overview.e1rm.bench.value) : '—', label: '卧推 e1RM' },
      { value: overview?.e1rm?.deadlift ? kg(overview.e1rm.deadlift.value) : '—', label: '硬拉 e1RM' },
    ]
  }
  const cells: MetricCell[] = []
  const repPr = level === 4 ? detail.rep_prs.find((p) => p.reps === reps) : undefined
  if (isMainLiftDetail(detail)) {
    cells.push({ value: kg(detail.one_rm_reference), label: '登记 1RM' })
    cells.push({ value: detail.e1rm ? kg(detail.e1rm.value) : '—', label: 'e1RM · 滚动' })
  } else {
    const best = repPr ?? detail.rep_prs[0]
    cells.push({ value: best ? kg(best.weight_kg) : '—', label: best ? `${best.reps} 次最好` : '暂无记录' })
    const last = detail.recent_sessions[0]
    const top = last ? Math.max(...last.sets.map((s) => Number(s.weight_kg))) : null
    if (top) cells.push({ value: kg(String(top)), label: '最近一次顶组' })
  }
  const e1rm = detail.e1rm ? Number(detail.e1rm.value) : null
  if (level === 4 && weight != null && e1rm) {
    cells.push({ value: `${Math.round((weight / e1rm) * 100)}%`, label: `本次 ÷ e1RM`, tone: 'accent' })
  } else if (isMainLiftDetail(detail) && repPr) {
    cells.push({ value: kg(repPr.weight_kg), label: `${reps} 次最好` })
  }
  return cells.slice(0, 3)
}

/** Presentational rail: no data fetching, so mocks and tests can drive every state. */
export function ContextRailView({
  studentName, day, row, profile, detail, overview = null, loading = false, style, mode = 'follow', placementMode = mode, onToggleMode, onClose,
}: {
  studentName: string
  day: DayCol
  row: ExerciseRow | null
  profile: StudentOnboardingProfile | null | undefined
  detail: ExerciseStatsDetail | null
  overview?: ExerciseStatsOverview | null
  loading?: boolean
  /** Placement override; absent = docked to the editor's right edge. */
  style?: React.CSSProperties
  mode?: RailMode
  placementMode?: RailMode
  onToggleMode?: () => void
  onClose: () => void
}) {
  const level = contextRailLevel(row)
  const sets = row?.boxes.length ?? 0
  const reps = row ? Number.parseInt(row.reps, 10) || 0 : 0
  const weight = topSetWeight(row)
  const cells = metricCells({ level, profile, detail, overview, reps, weight })
  const matching = useMemo(
    () => detail?.recent_sessions.filter((s) => s.sets.length === sets && s.sets.every((x) => x.reps === reps)).slice(0, 2) ?? [],
    [detail, sets, reps],
  )
  const bucket = detail?.by_set_count[String(sets)] ?? []

  return (
    <aside className={`context-rail${placementMode === 'follow' ? ' floating' : ''}`} style={style} data-context-rail="" data-context-state={level}>
      <header className="rail-head">
        <span className="rail-title">
          <b>{studentName}</b>
          <small>{day.dateLabel} · {day.dowLabel}</small>
        </span>
        {onToggleMode && (
          <button
            className="rail-mode-toggle"
            onClick={onToggleMode}
            title={mode === 'follow' ? '改为固定在右缘' : '改为跟着选中日'}
            aria-label={mode === 'follow' ? '改为固定在右缘' : '改为跟着选中日'}
            aria-pressed={mode === 'dock'}
          >
            {mode === 'follow' ? '⇥' : '⇤'}
          </button>
        )}
        <button onClick={onClose} aria-label="关闭上下文栏">✕</button>
      </header>

      <div className="metric-band" data-metric-band="">
        {cells.map((cell) => (
          <span className="metric" key={cell.label}>
            <b className={cell.tone === 'accent' ? 'accent' : undefined}>{cell.value}</b>
            <small>{cell.label}</small>
          </span>
        ))}
      </div>

      <div className="rail-body">
        {level === 1 && <Profile profile={profile} />}

        {level > 1 && (
          <>
            <div className="rail-row-chip">
              <b>{row?.name}</b>
              <span>{sets || '—'} 组 × {reps || '—'} 次</span>
            </div>
            {loading && <div className="empty-state">载入训练档案…</div>}
            {detail && detail.recent_sessions.length === 0 && (
              <>
                <div className="empty-state">暂无训练记录</div>
                <details><summary>学员画像</summary><Profile profile={profile} compact /></details>
              </>
            )}

            {level === 2 && detail && detail.recent_sessions.length > 0 && (
              <>
                <h3>次数 PR</h3>
                <table className="pr-table"><tbody>
                  {detail.rep_prs.slice(0, 4).map((p) => (
                    <tr key={p.reps}>
                      <td>{p.reps}RM</td>
                      <td>{kg(p.weight_kg)} {p.source === 'imported' && <i>导</i>}</td>
                      <td>{shortDate(p.logged_at)}</td>
                    </tr>
                  ))}
                </tbody></table>
                <h3>最近一次</h3>
                <Sessions sessions={detail.recent_sessions.slice(0, 1)} />
              </>
            )}

            {level === 3 && detail && (
              <>
                <h3>{sets} 组训练 · 最近记录</h3>
                {bucket.slice(0, 3).map((x) => (
                  <div className="bucket-line" key={x.date}>
                    <b>{shortDate(x.date)}</b>
                    <span>顶组 {kg(x.best_weight_kg)}kg · {x.completed_sets}/{x.set_count}</span>
                  </div>
                ))}
                {bucket.length === 0 && <div className="empty-state">暂无该组数记录</div>}
              </>
            )}

            {level === 4 && detail && (
              <>
                {(() => {
                  const pr = detail.rep_prs.find((p) => p.reps === reps)
                  return (
                    <div className="rail-best">
                      <b>{pr ? `${kg(pr.weight_kg)}kg` : '—'}</b>
                      <span>{reps} 次最好成绩{pr ? ` · ${shortDate(pr.logged_at)}` : ''}</span>
                    </div>
                  )
                })()}
                <h3>{sets}×{reps} 历史 · 最近 2 次</h3>
                {matching.length > 0
                  ? <Sessions sessions={matching} />
                  : <div className="empty-state">暂无组×次匹配记录</div>}
              </>
            )}

            {detail && detail.recent_sessions.length > 0 && (
              <details><summary>学员画像</summary><Profile profile={profile} compact /></details>
            )}
          </>
        )}
      </div>
    </aside>
  )
}

/** Container used by the editor: keeps the per-exercise stats cache. */
export function ContextRail({ studentId, ...rest }: {
  studentId: string
  studentName: string
  day: DayCol
  row: ExerciseRow | null
  profile: StudentOnboardingProfile | null | undefined
  overview?: ExerciseStatsOverview | null
  style?: React.CSSProperties
  mode?: RailMode
  placementMode?: RailMode
  onToggleMode?: () => void
  onClose: () => void
}) {
  const [cache, setCache] = useState<Record<string, ExerciseStatsDetail>>({})
  const [loadingId, setLoadingId] = useState('')
  const exerciseId = rest.row?.exerciseId ?? null
  useEffect(() => {
    if (!exerciseId || cache[exerciseId]) return
    setLoadingId(exerciseId)
    void getExerciseStats(studentId, exerciseId)
      .then((d) => setCache((c) => ({ ...c, [exerciseId]: d })))
      .finally(() => setLoadingId(''))
  }, [studentId, exerciseId, cache])
  return <ContextRailView {...rest} detail={exerciseId ? cache[exerciseId] ?? null : null} loading={loadingId === exerciseId} />
}

function Sessions({ sessions }: { sessions: ExerciseStatsDetail['recent_sessions'] }) {
  return (
    <div className="rail-sessions">
      {sessions.map((s) => (
        <section key={s.date}>
          <header><b>{shortDate(s.date)}</b><span>{s.sets.length} 组</span></header>
          {s.sets.map((set) => (
            <div className="set-line" key={set.set_index}>
              <span>{set.set_index}</span>
              <b>{kg(set.weight_kg)}kg × {set.reps}</b>
              <span>{set.rpe ? `@${Number(set.rpe)}` : '—'}</span>
              <em className={set.failed ? 'failed' : ''}>{set.failed ? '力竭' : set.completed ? '✓' : '—'}</em>
            </div>
          ))}
        </section>
      ))}
    </div>
  )
}

function Profile({ profile, compact = false }: { profile: StudentOnboardingProfile | null | undefined; compact?: boolean }) {
  if (profile == null) return <div className="empty-state">{profileEmptyMessage(profile)}</div>
  return (
    <div className={`panel-profile${compact ? ' compact' : ''}`}>
      {!compact && <h3>学员画像 · ONBOARDING</h3>}
      <dl>
        <dt>基础</dt><dd>{profileLine(profile)}</dd>
        <dt>年限</dt><dd>{profile.training_years != null ? `${profile.training_years} 年 · 每周 ${profile.training_days?.length ?? '—'} 天` : '未填写'}</dd>
        <dt>风格</dt><dd>{techniqueStyleLine(profile)}</dd>
        <dt>自报</dt><dd>S {kg(profile.squat_1rm_kg)} / B {kg(profile.bench_1rm_kg)} / D {kg(profile.deadlift_1rm_kg)}</dd>
        <dt>伤病</dt><dd>{profile.injury_notes || profile.injury_areas?.join('、') || '无'}</dd>
        <dt>备赛</dt><dd>{profile.is_competing ? `${shortDate(profile.competition_date)} · ${profile.target_weight_class || '未填级别'}` : '暂不备赛'}</dd>
      </dl>
      {profile.note_to_coach && <blockquote>“{profile.note_to_coach}”</blockquote>}
    </div>
  )
}
