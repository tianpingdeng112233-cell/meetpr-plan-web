/**
 * Standalone UI mock for the docked context rail (方案 A).
 * Runs without login or backend: real DayColumn + real CSS + canned stats.
 * Entry: mock-context-rail.html → http://localhost:5180/mock-context-rail.html
 */
import React, { useRef, useState } from 'react'
import ReactDOM from 'react-dom/client'
import { DayColumn } from '../features/plan-editor/components/DayColumn'
import { ContextRailView, isRowComplete, useRailMode, useRailPlacement } from '../features/plan-editor/components/ContextRail'
import { COL_DEFAULTS, type DayCol, type ExerciseRow } from '../features/plan-editor/types'
import type { ExerciseStatsDetail, ExerciseStatsOverview, StudentOnboardingProfile } from '../api/types'
import '../index.css'

const overview = {
  exercises: [], one_rm: { squat: '240', bench: '100', deadlift: '270' },
  e1rm: {
    squat: { value: '221.50', computed_at: '2026-07-27' },
    bench: { value: '96.00', computed_at: '2026-07-20' },
    deadlift: { value: '228.50', computed_at: '2026-07-27' },
  },
  last_trained_at: null,
  recent_4w: { trained_days: 0, total_planned_days: 0, completion_rate: 0 },
} as ExerciseStatsOverview

const profile: StudentOnboardingProfile = {
  gender: 'male', birth_date: '2005-03-02', height_cm: '188', weight_kg: '85',
  training_years: 3, training_days: [1, 2, 3, 4, 5, 6],
  squat_stance: 'high_bar', deadlift_style: 'sumo', bench_grip: 'standard',
  squat_1rm_kg: '240', bench_1rm_kg: '100', deadlift_1rm_kg: '270',
  injury_areas: [], injury_notes: '', is_competing: false,
  competition_date: null, target_weight_class: null,
  note_to_coach: '想先把硬拉锁定环节练稳。',
} as unknown as StudentOnboardingProfile

const mainDetail: ExerciseStatsDetail = {
  one_rm_reference: '270',
  e1rm: { value: '228.5', computed_at: '2026-07-27' },
  rep_prs: [
    { reps: 1, weight_kg: '250', logged_at: '2026-06-21', source: 'logged' },
    { reps: 3, weight_kg: '215', logged_at: '2026-07-14', source: 'logged' },
    { reps: 5, weight_kg: '200', logged_at: '2026-07-07', source: 'imported' },
    { reps: 8, weight_kg: '175', logged_at: '2026-05-30', source: 'logged' },
  ],
  recent_sessions: [
    { date: '2026-07-27', sets: [
      { set_index: 1, weight_kg: '185', reps: 5, rpe: '7.5', completed: true, failed: false, assumed: false, has_video: true },
      { set_index: 2, weight_kg: '185', reps: 5, rpe: '8', completed: true, failed: false, assumed: false, has_video: false },
      { set_index: 3, weight_kg: '185', reps: 5, rpe: '8.5', completed: true, failed: false, assumed: false, has_video: false },
      { set_index: 4, weight_kg: '185', reps: 5, rpe: '9', completed: true, failed: false, assumed: false, has_video: false },
    ] },
    { date: '2026-07-14', sets: [
      { set_index: 1, weight_kg: '215', reps: 3, rpe: '8.5', completed: true, failed: false, assumed: false, has_video: false },
    ] },
    { date: '2026-07-07', sets: [
      { set_index: 1, weight_kg: '205', reps: 3, rpe: '8', completed: true, failed: false, assumed: false, has_video: false },
    ] },
  ],
  by_set_count: {
    '1': [
      { date: '2026-07-14', set_count: 1, best_weight_kg: '215', total_reps: 3, completed_sets: 1 },
      { date: '2026-07-07', set_count: 1, best_weight_kg: '205', total_reps: 3, completed_sets: 1 },
    ],
    '4': [{ date: '2026-07-27', set_count: 4, best_weight_kg: '185', total_reps: 20, completed_sets: 4 }],
  },
}

const auxDetail: ExerciseStatsDetail = {
  one_rm_reference: null,
  e1rm: null,
  rep_prs: [
    { reps: 10, weight_kg: '55', logged_at: '2026-07-24', source: 'logged' },
    { reps: 12, weight_kg: '50', logged_at: '2026-07-10', source: 'logged' },
  ],
  recent_sessions: [
    { date: '2026-07-24', sets: [
      { set_index: 1, weight_kg: '55', reps: 10, rpe: '8', completed: true, failed: false, assumed: false, has_video: false },
      { set_index: 2, weight_kg: '55', reps: 10, rpe: '9', completed: true, failed: false, assumed: false, has_video: false },
    ] },
    { date: '2026-07-17', sets: [
      { set_index: 1, weight_kg: '50', reps: 10, rpe: '8', completed: true, failed: false, assumed: false, has_video: false },
      { set_index: 2, weight_kg: '50', reps: 10, rpe: '8.5', completed: true, failed: false, assumed: false, has_video: false },
    ] },
  ],
  by_set_count: {
    '2': [
      { date: '2026-07-24', set_count: 2, best_weight_kg: '55', total_reps: 20, completed_sets: 2 },
      { date: '2026-07-17', set_count: 2, best_weight_kg: '50', total_reps: 20, completed_sets: 2 },
    ],
  },
}

function row(over: Partial<ExerciseRow> & { id: string; name: string }): ExerciseRow {
  return {
    serverRowId: null, serverSortOrder: null, hasLogs: false, conflictMessage: null,
    exerciseId: null, ku: false, custom: false, isMain: false, aux: false,
    reps: '', mode: 'kg', boxes: [], note: '', ...over,
  }
}

const box = (val: string) => ({ val, empty: false })
type Stage = 1 | 2 | 3 | 4 | 5
type Tier = 'main' | 'aux'

/** The selected row grows as the coach types: bound → sets → reps → strength. */
function selectedRow(stage: Stage, tier: Tier): ExerciseRow | null {
  if (stage === 1) return null
  const base = tier === 'main'
    ? { id: 'r-main', name: '相扑硬拉', exerciseId: 'ex-sumo-dl', ku: true, isMain: true }
    : { id: 'r-aux', name: '坐姿腿屈伸', exerciseId: 'ex-leg-ext', ku: true }
  if (stage === 2) return row(base)
  if (stage === 3) return row({ ...base, boxes: tier === 'main' ? [box('')] : [box(''), box('')] })
  if (stage === 4) {
    return tier === 'main'
      ? row({ ...base, reps: '3', boxes: [box('')] })
      : row({ ...base, reps: '10', boxes: [box(''), box('')] })
  }
  return tier === 'main'
    ? row({ ...base, reps: '3', boxes: [box('215')] })
    : row({ ...base, reps: '10', boxes: [box('55'), box('55')] })
}

function buildDay(stage: Stage, tier: Tier, dow: number, dowLabel: string, dateLabel: string): DayCol {
  const sel = selectedRow(stage, tier)
  const main = tier === 'main' && sel ? sel : row({ id: 'r-main', name: '相扑硬拉', exerciseId: 'ex-sumo-dl', ku: true, isMain: true, reps: '5', boxes: [box('185'), box('185'), box('185'), box('185')] })
  const aux = tier === 'aux' && sel ? sel : row({ id: 'r-aux', name: '坐姿腿屈伸', exerciseId: 'ex-leg-ext', ku: true, reps: '10', boxes: [box('55'), box('55')] })
  return {
    dow, dowLabel, dateLabel, rest: false,
    rows: [main, aux, row({ id: 'r-3', name: '哥本哈根侧平板', exerciseId: 'ex-cope', ku: true, reps: '10', mode: 'bodyweight', boxes: [box(''), box('')] })],
  }
}

const restDay = (dow: number, dowLabel: string, dateLabel: string): DayCol => ({ dow, dowLabel, dateLabel, rest: true, rows: [] })

/** Filler training days so the week is wide enough to slide under the rail. */
const trainingDay = (dow: number, dowLabel: string, dateLabel: string, main: string, aux: string): DayCol => ({
  dow, dowLabel, dateLabel, rest: false,
  rows: [
    row({ id: `${dow}-m`, name: main, exerciseId: `ex-${dow}-m`, ku: true, isMain: true, reps: '5', boxes: [box('120'), box('120'), box('120')] }),
    row({ id: `${dow}-a`, name: aux, exerciseId: `ex-${dow}-a`, ku: true, reps: '10', boxes: [box('40'), box('40')] }),
  ],
})

const noop = () => {}

/** Mock-only chrome; nothing here ships with the feature. */
const MOCK_CSS = `
.mock-switch { flex: none; display: flex; align-items: center; gap: 6px; padding: 8px 12px; background: var(--surface-2); border-bottom: 1px solid var(--border); font-size: 11px; color: var(--fg-tertiary); }
.mock-switch button { padding: 4px 9px; border: 1px solid var(--border); border-radius: var(--r-sm); background: var(--surface-1); color: var(--fg-secondary); font-size: 11px; cursor: pointer; }
.mock-switch button.on { border-color: var(--ink, var(--fg-primary)); background: var(--surface-3); color: var(--fg-primary); font-weight: 600; }
.mock-switch .gap { width: 18px; }
`

const WEEK: { dow: number; dowLabel: string; dateLabel: string; main: string; aux: string; rest?: boolean }[] = [
  { dow: 0, dowLabel: '周一', dateLabel: '8/3', main: '相扑硬拉', aux: '坐姿腿屈伸' },
  { dow: 1, dowLabel: '周二', dateLabel: '8/4', main: '竞技卧推', aux: '哑铃飞鸟' },
  { dow: 2, dowLabel: '周三', dateLabel: '8/5', main: '', aux: '', rest: true },
  { dow: 3, dowLabel: '周四', dateLabel: '8/6', main: '低杠位深蹲', aux: '腿举' },
  { dow: 4, dowLabel: '周五', dateLabel: '8/7', main: '窄距卧推', aux: '面拉' },
  { dow: 5, dowLabel: '周六', dateLabel: '8/8', main: '', aux: '', rest: true },
  { dow: 6, dowLabel: '周日', dateLabel: '8/9', main: '高杠位深蹲', aux: '罗马尼亚硬拉' },
]

function Mock() {
  const [stage, setStage] = useState<Stage>(4)
  const [tier, setTier] = useState<Tier>('main')
  const [dismissed, setDismissed] = useState(false)
  const [mode, toggleMode] = useRailMode()
  const [selDow, setSelDow] = useState(0)
  const wrapRef = useRef<HTMLDivElement>(null)

  const selMeta = WEEK.find((d) => d.dow === selDow)!
  const day = buildDay(stage, tier, selMeta.dow, selMeta.dowLabel, selMeta.dateLabel)
  const sel = selectedRow(stage, tier)
  const detail = stage === 1 ? null : tier === 'main' ? mainDetail : auxDetail
  const days = WEEK.map((d) => d.dow === selDow
    ? day
    : d.rest ? restDay(d.dow, d.dowLabel, d.dateLabel) : trainingDay(d.dow, d.dowLabel, d.dateLabel, d.main, d.aux))

  // 方案 B: no inline tokens at all — every number lives in the rail.
  // The rail folds itself away once the row is finished; ▤ in the day head recalls it.
  const complete = isRowComplete(sel)
  const railVisible = !dismissed && !complete

  const placement = useRailPlacement(mode, railVisible, wrapRef, `${selDow}-${stage}-${tier}`)

  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', background: 'var(--page-bg)' }}>
      <style>{MOCK_CSS}</style>
      <div className="mock-switch">
        <span>层级</span>
        {([1, 2, 3, 4, 5] as Stage[]).map((s) => (
          <button key={s} className={stage === s ? 'on' : ''} onClick={() => { setStage(s); setDismissed(false) }}>
            {['① 只选中日子', '② 选中动作', '③ 填了组数', '④ 填了次数', '⑤ 强度填完 → 自动收起'][s - 1]}
          </button>
        ))}
        <span className="gap" />
        <span>动作</span>
        <button className={tier === 'main' ? 'on' : ''} onClick={() => setTier('main')}>主项</button>
        <button className={tier === 'aux' ? 'on' : ''} onClick={() => setTier('aux')}>辅项</button>
        <span className="gap" />
        <span>栏位置（教练偏好，记在本机）</span>
        <button className={mode === 'follow' ? 'on' : ''} onClick={() => { if (mode !== 'follow') toggleMode() }}>跟着选中日</button>
        <button className={mode === 'dock' ? 'on' : ''} onClick={() => { if (mode !== 'dock') toggleMode() }}>固定右缘</button>
        <span className="gap" />
        <span>在编辑</span>
        {WEEK.filter((d) => !d.rest).map((d) => (
          <button key={d.dow} className={selDow === d.dow ? 'on' : ''} onClick={() => { setSelDow(d.dow); setDismissed(false) }}>{d.dowLabel}</button>
        ))}
      </div>

      <div ref={wrapRef} className={`plan-with-rail${railVisible && mode === 'dock' ? ' rail-open' : ''}`}>
        <div className="scroller" style={{ flex: 1, overflow: 'auto', background: 'var(--page-bg)' }}>
          <div className="weekband" data-wnum={4}>
            <div className="weekband-head">
              <kbd>W04</kbd>
              <span className="weekband-name">第 4 周</span>
              <span className="weekband-range">8/3 – 8/9</span>
            </div>
            <div className="weekrow" data-weekrow="" style={{ display: 'flex', alignItems: 'stretch' }}>
              {days.map((d, i) => (
                <DayColumn
                  key={d.dow}
                  weekNumber={4}
                  columnLetter={String.fromCharCode(65 + i)}
                  day={d}
                  colW={COL_DEFAULTS}
                  selected={d.dow === selDow}
                  selectedRowId={d.dow === selDow ? sel?.id ?? null : null}
                  onRecallContext={d.dow === selDow && !railVisible ? () => { setDismissed(false); setStage(4) } : undefined}
                  onSelect={noop} onResizeStart={noop} onNameFocus={noop} onNameChange={noop}
                  onNameBlur={noop} onAddRow={noop} onEditRow={noop} onDeleteRow={noop}
                  rowTier={(r) => (r.isMain ? 'main' : 'aux')}
                />
              ))}
            </div>
          </div>
        </div>

        {railVisible && (
          <ContextRailView
            studentName="史俊义" day={day} row={sel} profile={profile} overview={overview}
            detail={detail} style={placement} mode={mode} onToggleMode={toggleMode}
            onClose={() => setDismissed(true)}
          />
        )}
      </div>
    </div>
  )
}

ReactDOM.createRoot(document.getElementById('root')!).render(<React.StrictMode><Mock /></React.StrictMode>)
