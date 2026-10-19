import { expect, it, vi } from 'vitest'
import * as plans from '../../api/plans'
import type { PlanDayResponse, PlanExerciseResponse, PlanWithChildren } from '../../api/types'
import { mapPlanToWeeks } from './mapping'
import { changeBlockDate, changeBlockWeekday } from './blockGridModel'
import { reconcilePlan } from './reconcile'

vi.mock('../../api/plans')

function serverExercise(
  id: string, exerciseId: string, sortOrder: number, value = '100', hasLogs = false,
): PlanExerciseResponse {
  return {
    id, plan_day_id: 'day1', exercise_id: exerciseId, is_main_lift: false,
    sort_order: sortOrder, target: null, has_logs: hasLogs, notes: null,
    sets: [{
      id: `s-${id}`, plan_exercise_id: id, set_number: 1, target_reps: 5,
      target_reps_max: null, intensity_mode: 'weight', target_value: value,
      set_type: 'working', rest_seconds: null, coach_note: null, created_at: '',
    }],
  }
}


function serverDay(exercises: PlanExerciseResponse[], id = 'day1'): PlanDayResponse {
  return { id, plan_id: 'p', day_of_week: 1, week_number: 1, sort_order: 0, shifted_to_date: null, exercises }
}

function serverPlan(days: PlanDayResponse[], status: 'draft' | 'published' = 'published'): PlanWithChildren {
  return {
    id: 'p', coach_id: 'c', trainee_id: 't', name: '计划', start_date: '2026-01-01',
    end_date: '2026-01-07', plan_weeks: 1, source: 'coach', source_template_id: null,
    status, kind: 'regular', created_at: '', updated_at: '',
    total_shift_days: 0, latest_shift_created_at: null, latest_shift: null, days,
  }
}

function serverDaysFromBatch(days: Parameters<typeof plans.batchDays>[1]['upsert_days']): PlanDayResponse[] {
  return days.map((day) => ({
      id: `batch-day-${day.week_number}-${day.day_of_week}`,
      plan_id: 'p', day_of_week: day.day_of_week, week_number: day.week_number, sort_order: day.sort_order,
      shifted_to_date: null,
      exercises: day.exercises.map((exercise, exerciseIndex) => ({
        ...exercise,
        target: null,
        notes: exercise.notes ?? null,
        id: `batch-ex-${day.week_number}-${day.day_of_week}-${exerciseIndex}`,
        plan_day_id: `batch-day-${day.week_number}-${day.day_of_week}`,
        has_logs: false,
        sets: exercise.sets.map((set, setIndex) => ({
          ...set,
          intensity_mode: set.intensity_mode ?? (set.target_weight != null ? 'weight' : 'rpe'),
          target_value: set.target_value ?? set.target_weight ?? set.target_rpe ?? set.rpe_low
            ?? set.weight_low ?? set.target_pct ?? set.rir_target ?? '1',
          rir_target: set.rir_target == null ? null : Number(set.rir_target),
          id: `batch-set-${day.week_number}-${day.day_of_week}-${exerciseIndex}-${setIndex}`,
          plan_exercise_id: `batch-ex-${day.week_number}-${day.day_of_week}-${exerciseIndex}`,
          created_at: '',
        })),
      })),
    }))
}


it.each(['date', 'weekday'] as const)('saves a published %s move atomically without losing or duplicating saved rows', async action => {
  vi.resetAllMocks()
  const first = serverDay([serverExercise('pe1', 'squat', 0, '100'), serverExercise('pe2', 'squat', 1, '120')])
  first.exercises[0].notes = 'First prescription'
  first.exercises[1].notes = 'Second prescription'
  const other = { ...serverDay([serverExercise('pe3', 'bench', 0, '80')], 'day2'), day_of_week: 5 }
  other.exercises[0].plan_day_id = 'day2'
  let live = { ...serverPlan([first, other]), start_date: '2026-10-19', end_date: '2026-10-25' }
  vi.mocked(plans.getPlan).mockImplementation(async () => structuredClone(live))
  vi.mocked(plans.batchDays).mockImplementation(async (_id, body) => {
    live = { ...live, days: [...live.days.filter(day => !body.delete_day_ids.includes(day.id)), ...serverDaysFromBatch(body.upsert_days)] }
    return structuredClone(live)
  })
  const catalog = new Map([['squat', { name: 'Squat', custom: false }], ['bench', { name: 'Bench', custom: false }]])
  const weeks = mapPlanToWeeks(live, catalog)
  expect(weeks[0].days[0].rows.map(row => row.serverRowId)).toEqual(['pe1', 'pe2'])
  const moved = action === 'date'
    ? changeBlockDate(weeks, { weekNumber: 1, dx: 0 }, '2026-10-21', live.start_date)
    : changeBlockWeekday(weeks, 0, 2, live.start_date)
  const result = await reconcilePlan('p', moved, undefined, { published: true })
  expect(plans.batchDays).toHaveBeenCalledTimes(1)
  const body = vi.mocked(plans.batchDays).mock.calls[0][1]
  expect(body.delete_day_ids).toEqual(['day1'])
  expect(body.upsert_days).toHaveLength(1)
  expect(body.upsert_days[0]).toMatchObject({ week_number: 1, day_of_week: 3 })
  expect(body.upsert_days[0].exercises.map(row => [row.exercise_id, row.notes, row.sets[0].target_reps, row.sets[0].target_value ?? row.sets[0].target_weight]))
    .toEqual([['squat', 'First prescription', 5, '100'], ['squat', 'Second prescription', 5, '120']])
  expect(live.days.map(day => day.day_of_week).sort()).toEqual([3, 5])
  expect(live.days.find(day => day.id === 'day2')).toEqual(other)
  const savedRows = live.days.flatMap(day => day.exercises)
  expect(savedRows).toHaveLength(3)
  expect(new Set(savedRows.map(row => row.id)).size).toBe(3)
  expect(savedRows.every(row => live.days.some(day => day.id === row.plan_day_id))).toBe(true)
  expect(savedRows.some(row => row.id === 'pe1' || row.id === 'pe2')).toBe(false)
  expect(result.weeks[0].days[0].rows).toEqual([])
  expect(result.weeks[0].days[2].rows.map(row => row.serverRowId)).toEqual(live.days.find(day => day.day_of_week === 3)!.exercises.map(row => row.id))
  await reconcilePlan('p', result.weeks, undefined, { published: true })
  expect(plans.batchDays).toHaveBeenCalledTimes(1)
})
