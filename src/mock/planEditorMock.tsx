/**
 * Login-free harness for the real PlanEditor, used to eyeball the context-rail
 * wiring (layout, follow/dock placement, auto-collapse) without a backend.
 * Entry: mock-plan-editor.html → http://localhost:5181/mock-plan-editor.html
 */
import React from 'react'
import ReactDOM from 'react-dom/client'
import { PlanEditor } from '../features/plan-editor/PlanEditor'
import type { DayCol, ExerciseRow, Week } from '../features/plan-editor/types'
import type { StudentOnboardingProfile } from '../api/types'
import '../index.css'

const box = (val: string) => ({ val, empty: false })

function row(over: Partial<ExerciseRow> & { id: string; name: string }): ExerciseRow {
  return {
    serverRowId: null, serverSortOrder: null, hasLogs: false, conflictMessage: null,
    exerciseId: null, ku: false, custom: false, isMain: false, aux: false,
    reps: '', mode: 'kg', boxes: [], note: '', ...over,
  }
}

const training = (dow: number, dowLabel: string, dateLabel: string, main: string, aux: string, mainDone = true): DayCol => ({
  dow, dowLabel, dateLabel, rest: false,
  rows: [
    row({ id: `${dow}-m`, name: main, exerciseId: `ex-${dow}-m`, ku: true, isMain: true, reps: '5', boxes: mainDone ? [box('120'), box('120'), box('120')] : [box(''), box('')] }),
    row({ id: `${dow}-a`, name: aux, exerciseId: `ex-${dow}-a`, ku: true, reps: '10', boxes: [box('40'), box('40')] }),
  ],
})

const rest = (dow: number, dowLabel: string, dateLabel: string): DayCol => ({ dow, dowLabel, dateLabel, rest: true, rows: [] })

const week: Week = {
  num: 4, num2: '04', range: '8/3 – 8/9', isCurrent: true, vol: '',
  days: [
    training(0, '周一', '8/3', '相扑硬拉', '坐姿腿屈伸', false),
    training(1, '周二', '8/4', '竞技卧推', '哑铃飞鸟'),
    rest(2, '周三', '8/5'),
    training(3, '周四', '8/6', '低杠位深蹲', '腿举'),
    training(4, '周五', '8/7', '窄距卧推', '面拉'),
    rest(5, '周六', '8/8'),
    training(6, '周日', '8/9', '高杠位深蹲', '罗马尼亚硬拉'),
  ],
}

const profile = {
  gender: 'male', birth_date: '2005-03-02', height_cm: '188', weight_kg: '85',
  training_years: 3, training_days: [1, 2, 3, 4, 5, 6],
  squat_stance: 'high_bar', deadlift_style: 'sumo', bench_grip: 'standard',
  squat_1rm_kg: '240', bench_1rm_kg: '100', deadlift_1rm_kg: '270',
  injury_areas: [], injury_notes: '', is_competing: false,
  competition_date: null, target_weight_class: null,
  note_to_coach: '想先把硬拉锁定环节练稳。',
} as unknown as StudentOnboardingProfile

const overview = {
  exercises: [], one_rm: { squat: '240', bench: '100', deadlift: '270' },
  e1rm: {
    squat: { value: '221.50', computed_at: '2026-07-27' },
    bench: { value: '96.00', computed_at: '2026-07-20' },
    deadlift: { value: '228.50', computed_at: '2026-07-27' },
  },
  last_trained_at: null,
  recent_4w: { trained_days: 0, total_planned_days: 0, completion_rate: 0 },
} as import('../api/types').ExerciseStatsOverview

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column' }}>
      <PlanEditor
        initialWeeks={[week]} weeksCount={1} studentId="student-mock" studentName="史俊义"
        planName="硬拉300" onboardingProfile={profile} exerciseStatsOverview={overview}
      />
    </div>
  </React.StrictMode>,
)
