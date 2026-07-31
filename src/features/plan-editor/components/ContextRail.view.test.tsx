import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { describe, expect, it } from 'vitest'
import { ContextRailView } from './ContextRail'
import type { DayCol } from '../types'
import type { ExerciseStatsOverview, StudentOnboardingProfile } from '../../../api/types'

;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const profile = {
  gender: 'male', training_years: 3, training_days: [1, 2, 3],
  squat_stance: 'high_bar', deadlift_style: 'sumo', bench_grip: 'standard',
  squat_1rm_kg: '240', bench_1rm_kg: '100', deadlift_1rm_kg: '270',
  injury_areas: [], injury_notes: '', is_competing: false,
  competition_date: null, target_weight_class: null, note_to_coach: '',
} as unknown as StudentOnboardingProfile

const overview = {
  exercises: [], one_rm: { squat: '240', bench: '100', deadlift: '270' },
  e1rm: {
    squat: { value: '221.50', computed_at: '2026-07-27' },
    bench: null,
    deadlift: { value: '228.50', computed_at: '2026-07-27' },
  },
  last_trained_at: null,
  recent_4w: { trained_days: 0, total_planned_days: 0, completion_rate: 0 },
} as ExerciseStatsOverview

const day: DayCol = { dow: 0, dowLabel: '周一', dateLabel: '8/3', rest: false, rows: [] }

describe('context rail view at day level', () => {
  it('leads the band with rolling e1RMs and keeps self-reported 1RMs in the profile', () => {
    const host = document.createElement('div')
    const root = createRoot(host)

    act(() => root.render(
      <ContextRailView studentName="史俊义" day={day} row={null}
        profile={profile} detail={null} overview={overview} onClose={() => {}} />,
    ))

    const band = host.querySelector('[data-metric-band]')!
    expect(band.textContent).toContain('221.5')
    expect(band.textContent).toContain('深蹲 e1RM')
    expect(band.textContent).toContain('硬拉 e1RM')
    // Untrained family reads a dash instead of the self-reported number.
    expect(band.textContent).toContain('—')
    expect(band.textContent).not.toContain('100')

    // Self-reported 1RMs now live in the profile block.
    const body = host.querySelector('.rail-body')!
    expect(body.textContent).toContain('自报')
    expect(body.textContent).toContain('S 240 / B 100 / D 270')

    act(() => root.unmount())
  })
})
