import { useCallback, useEffect, useLayoutEffect, useMemo, useState, type CSSProperties } from 'react'
import { getExerciseStats } from '../../../api/coach'
import type { ExerciseStatsDetail, ExerciseStatsOverview, StudentOnboardingProfile } from '../../../api/types'
import type { DayCol, ExerciseRow } from '../types'
import { rowWeightBoxes } from '../intensityModel'
import { getBoundRowInputIssue } from '../inputGuard'
import { kg, profileLine, shortDate, techniqueStyleLine } from '../../workspace/WorkspaceCommon'
import { fmt, resolveLocale, S } from '../../../i18n/strings'

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
  if (profile === undefined) return S.stats.context.profileLoading
  if (profile === null) return S.stats.context.profileMissing
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
 * single line has no room for the inline block). While filling, history depth
 * (rep PRs, last session per-set, set-count bucket ×2) renders as side-by-side
 * columns inside the fixed-height header rather than growing it.
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
            <b>{studentName}</b><span>{S.stats.context.profileSuffix}</span>
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
  const stop = (event: { stopPropagation(): void }) => event.stopPropagation()
  const sets = activeRow.boxes.length
  const bucket = detail && sets > 0 ? (detail.by_set_count[String(sets)] ?? []).slice(0, 2) : []
  const last = detail?.recent_sessions[0]
  return (
    <div className="dayhead-context exercise" data-dayhead-context="" data-context-state="exercise" title={fmt.exerciseName({ name: activeRow.name, name_en: activeRow.nameEn }) || S.stats.context.unnamedExercise}>
      <div className="dayhead-context-id">
        <b className="dayhead-context-name">{fmt.exerciseName({ name: activeRow.name, name_en: activeRow.nameEn }) || S.stats.context.unnamedExercise}</b>
        {/* The one-line 上次 summary duplicates the per-set panel; show it only
            while that panel is absent (loading / failed / no history). */}
        {!(last && last.sets.length > 0) && (
          <span className="dayhead-context-history">
            {pending ? S.stats.context.recordsLoading
              : failedId === exerciseId ? S.stats.context.recordsFailed
                : summary ? `${S.stats.context.lastPrefix} ${summary}` : S.stats.context.noRecords}
          </span>
        )}
        {/* No RPE in the logs means the backend cannot compute a rolling e1RM;
            fall back to the registered 1RM so the line never just vanishes. */}
        {detail && (
          <span className="dayhead-context-e1rm">
            {detail.e1rm ? `e1RM ${kg(detail.e1rm.value)}kg`
              : detail.one_rm_reference ? `${S.stats.context.registered1rm} ${kg(detail.one_rm_reference)}kg`
                : 'e1RM —'}
          </span>
        )}
      </div>
      {detail && detail.rep_prs.length > 0 && (
        <div className="dayhead-panel" onMouseDown={stop} onClick={stop}>
          <h4>{S.stats.context.repsPr}</h4>
          {detail.rep_prs.slice(0, 4).map((p) => (
            <div className="dayhead-panel-line" key={p.reps}>
              <span>{p.reps}RM</span>
              <b>{kg(p.weight_kg)}kg</b>
              <em>{shortDate(p.logged_at)}{p.source === 'imported' ? S.stats.context.imported : ''}</em>
            </div>
          ))}
        </div>
      )}
      {last && last.sets.length > 0 && (
        <div className="dayhead-panel" onMouseDown={stop} onClick={stop}>
          <h4>{S.stats.context.latest(shortDate(last.date))}</h4>
          <div className="dayhead-panel-sets">
            {/* Ordinal position, not set_index — the backend indexes sets from 0. */}
            {last.sets.map((set, index) => (
              <div className="dayhead-panel-line" key={set.set_index}>
                <span>{index + 1}</span>
                <b>{kg(set.weight_kg)}×{set.reps}</b>
                <em>{set.rpe ? `@${Number(set.rpe)}` : '—'}{set.failed ? S.stats.context.failureSuffix : set.completed ? ' ✓' : ''}</em>
              </div>
            ))}
          </div>
        </div>
      )}
      {bucket.length > 0 && (
        <div className="dayhead-panel" onMouseDown={stop} onClick={stop}>
          <h4>{S.stats.context.recentSets(sets, bucket.length)}</h4>
          {bucket.map((x) => (
            <div className="dayhead-panel-line" key={x.date}>
              <span>{shortDate(x.date)}</span>
              <b>{S.stats.context.topSet(`${kg(x.best_weight_kg)}kg`)}</b>
              <em>{x.completed_sets}/{x.set_count}</em>
            </div>
          ))}
        </div>
      )}
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
      { value: overview?.e1rm?.squat ? kg(overview.e1rm.squat.value) : '—', label: S.stats.context.squatE1rm },
      { value: overview?.e1rm?.bench ? kg(overview.e1rm.bench.value) : '—', label: S.stats.context.benchE1rm },
      { value: overview?.e1rm?.deadlift ? kg(overview.e1rm.deadlift.value) : '—', label: S.stats.context.deadliftE1rm },
    ]
  }
  const cells: MetricCell[] = []
  const repPr = level === 4 ? detail.rep_prs.find((p) => p.reps === reps) : undefined
  if (isMainLiftDetail(detail)) {
    cells.push({ value: kg(detail.one_rm_reference), label: S.stats.context.registered1rm })
    cells.push({ value: detail.e1rm ? kg(detail.e1rm.value) : '—', label: S.stats.context.rollingE1rm })
  } else {
    const best = repPr ?? detail.rep_prs[0]
    cells.push({ value: best ? kg(best.weight_kg) : '—', label: best ? S.stats.context.repsBestShort(String(best.reps)) : S.stats.context.noData })
    const last = detail.recent_sessions[0]
    const top = last ? Math.max(...last.sets.map((s) => Number(s.weight_kg))) : null
    if (top) cells.push({ value: kg(String(top)), label: S.stats.context.latestTopSet })
  }
  const e1rm = detail.e1rm ? Number(detail.e1rm.value) : null
  if (level === 4 && weight != null && e1rm) {
    cells.push({ value: `${Math.round((weight / e1rm) * 100)}%`, label: S.stats.context.ratioE1rm, tone: 'accent' })
  } else if (isMainLiftDetail(detail) && repPr) {
    cells.push({ value: kg(repPr.weight_kg), label: S.stats.context.repsBestShort(String(reps)) })
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
            title={mode === 'follow' ? S.stats.context.pinRight : S.stats.context.followSelection}
            aria-label={mode === 'follow' ? S.stats.context.pinRight : S.stats.context.followSelection}
            aria-pressed={mode === 'dock'}
          >
            {mode === 'follow' ? '⇥' : '⇤'}
          </button>
        )}
        <button onClick={onClose} aria-label={S.stats.context.close}>✕</button>
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
              <b>{row ? fmt.exerciseName({ name: row.name, name_en: row.nameEn }) : ''}</b>
              <span>{S.stats.context.setsReps(sets || '—', reps || '—')}</span>
            </div>
            {loading && <div className="empty-state">{S.stats.context.loadingProfile}</div>}
            {detail && detail.recent_sessions.length === 0 && (
              <>
                <div className="empty-state">{S.stats.context.noRecords}</div>
                <details><summary>{S.stats.context.profile}</summary><Profile profile={profile} compact /></details>
              </>
            )}

            {level === 2 && detail && detail.recent_sessions.length > 0 && (
              <>
                <h3>{S.stats.context.repsPr}</h3>
                <table className="pr-table"><tbody>
                  {detail.rep_prs.slice(0, 4).map((p) => (
                    <tr key={p.reps}>
                      <td>{p.reps}RM</td>
                      <td>{kg(p.weight_kg)} {p.source === 'imported' && <i>{S.stats.context.importedShort}</i>}</td>
                      <td>{shortDate(p.logged_at)}</td>
                    </tr>
                  ))}
                </tbody></table>
                <h3>{S.stats.context.latestShort}</h3>
                <Sessions sessions={detail.recent_sessions.slice(0, 1)} />
              </>
            )}

            {level === 3 && detail && (
              <>
                <h3>{S.stats.context.trainingSetsRecent(sets)}</h3>
                {bucket.slice(0, 3).map((x) => (
                  <div className="bucket-line" key={x.date}>
                    <b>{shortDate(x.date)}</b>
                    <span>{S.stats.context.topSet(`${kg(x.best_weight_kg)}kg`)} · {x.completed_sets}/{x.set_count}</span>
                  </div>
                ))}
                {bucket.length === 0 && <div className="empty-state">{S.stats.context.noSetRecord}</div>}
              </>
            )}

            {level === 4 && detail && (
              <>
                {(() => {
                  const pr = detail.rep_prs.find((p) => p.reps === reps)
                  return (
                    <div className="rail-best">
                      <b>{pr ? `${kg(pr.weight_kg)}kg` : '—'}</b>
                      <span>{S.stats.context.repsBest(String(reps))}{pr ? ` · ${shortDate(pr.logged_at)}` : ''}</span>
                    </div>
                  )
                })()}
                <h3>{S.stats.context.historyRecent(sets, reps)}</h3>
                {matching.length > 0
                  ? <Sessions sessions={matching} />
                  : <div className="empty-state">{S.stats.context.noMatchingRecord}</div>}
              </>
            )}

            {detail && detail.recent_sessions.length > 0 && (
              <details><summary>{S.stats.context.profile}</summary><Profile profile={profile} compact /></details>
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
          <header><b>{shortDate(s.date)}</b><span>{S.common.countSets(s.sets.length)}</span></header>
          {s.sets.map((set) => (
            <div className="set-line" key={set.set_index}>
              <span>{set.set_index}</span>
              <b>{kg(set.weight_kg)}kg × {set.reps}</b>
              <span>{set.rpe ? `@${Number(set.rpe)}` : '—'}</span>
              <em className={set.failed ? 'failed' : ''}>{set.failed ? S.common.failure : set.completed ? '✓' : '—'}</em>
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
      {!compact && <h3>{S.stats.context.onboarding}</h3>}
      <dl>
        <dt>{S.stats.context.basics}</dt><dd>{profileLine(profile)}</dd>
        <dt>{S.stats.context.years}</dt><dd>{profile.training_years != null ? S.workspace.requests.yearsAndDays(profile.training_years, profile.training_days?.length ?? '—') : S.common.notProvided}</dd>
        <dt>{S.stats.context.style}</dt><dd>{techniqueStyleLine(profile)}</dd>
        <dt>{S.stats.context.selfReport}</dt><dd>S {kg(profile.squat_1rm_kg)} / B {kg(profile.bench_1rm_kg)} / D {kg(profile.deadlift_1rm_kg)}</dd>
        <dt>{S.stats.context.injuries}</dt><dd>{profile.injury_notes || profile.injury_areas?.join(resolveLocale() === 'zh' ? '、' : ', ') || S.common.noInjury}</dd>
        <dt>{S.stats.context.competition}</dt><dd>{profile.is_competing ? `${shortDate(profile.competition_date)} · ${profile.target_weight_class || S.stats.context.levelMissing}` : S.stats.context.notCompeting}</dd>
      </dl>
      {profile.note_to_coach && <blockquote>“{profile.note_to_coach}”</blockquote>}
    </div>
  )
}
