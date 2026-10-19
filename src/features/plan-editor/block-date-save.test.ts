import { expect, it, vi } from 'vitest'
import * as plans from '../../api/plans'
import type { PlanDayResponse, PlanExerciseResponse, PlanWithChildren } from '../../api/types'
import { mapPlanToWeeks } from './mapping'
import { buildBlockGrid, insertBlockDay, deleteBlockDay, cloneBlockRows, changeBlockPattern, changeBlockDate, changeBlockWeekday } from './blockGridModel'
import { reconcilePlan } from './reconcile'
import { saveBlockPlan } from './saveBlockPlan'

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


it.each(['date', 'weekday', 'date adapter', 'weekday adapter'] as const)('saves a published %s move atomically without losing or duplicating saved rows', async action => {
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
  const moved = action.startsWith('date')
    ? changeBlockDate(weeks, { weekNumber: 1, dx: 0 }, '2026-10-21', live.start_date)
    : changeBlockWeekday(weeks, 0, 2, live.start_date)
  const save = action.endsWith('adapter') ? saveBlockPlan : reconcilePlan
  const result = await save('p', moved, undefined, { published: true })
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

it.each(['insert', 'delete'] as const)('reconciles a published day %s and reads back the exact structure without orphan rows', async action => {
  vi.resetAllMocks()
  const first = serverDay([serverExercise('pe1', 'squat', 0)])
  const other = { ...serverDay([serverExercise('pe2', 'bench', 0)], 'day2'), day_of_week: 5 }
  other.exercises[0].plan_day_id = 'day2'
  let live = { ...serverPlan([first, other]), start_date: '2026-10-19', end_date: '2026-10-25' }
  vi.mocked(plans.getPlan).mockImplementation(async () => structuredClone(live))
  vi.mocked(plans.batchDays).mockImplementation(async (_id, body) => {
    live = { ...live, days: [...live.days.filter(day => !body.delete_day_ids.includes(day.id)), ...serverDaysFromBatch(body.upsert_days)] }
    return structuredClone(live)
  })
  const catalog = new Map([['squat', { name: 'Squat', custom: false }], ['bench', { name: 'Bench', custom: false }]])
  const weeks = mapPlanToWeeks(live, catalog)
  const next = action === 'insert' ? insertBlockDay(weeks, 1, '2026-10-22', live.start_date) : deleteBlockDay(weeks, 1, 0)
  if (action === 'insert') next[0].days[3].rows = cloneBlockRows(weeks[0].days[0].rows)
  const saved = await reconcilePlan('p', next, undefined, { published: true })
  expect(plans.batchDays).toHaveBeenCalledTimes(1)
  const body = vi.mocked(plans.batchDays).mock.calls[0][1]
  expect(body.delete_day_ids).toEqual(action === 'insert' ? [] : ['day1'])
  expect(body.upsert_days.map(day => [day.week_number, day.day_of_week])).toEqual(action === 'insert' ? [[1,4]] : [])
  expect(live.days.find(day => day.id === 'day2')).toEqual(other)
  const loaded = mapPlanToWeeks(await plans.getPlan('p'), catalog)
  expect(loaded[0].days.filter(day => day.rows.length).map(day => day.dow)).toEqual(action === 'insert' ? [0,3,4] : [4])
  expect(loaded[0].days.flatMap(day => day.rows).map(row => row.name)).toEqual(action === 'insert' ? ['Squat','Squat','Bench'] : ['Bench'])
  expect(live.days.flatMap(day => day.exercises).every(row => live.days.some(day => day.id === row.plan_day_id))).toBe(true)
  await reconcilePlan('p', saved.weeks, undefined, { published: true })
  expect(plans.batchDays).toHaveBeenCalledTimes(1)
})


it.each(['draft', 'published'] as const)('saves empty draft days but refuses empty published updates (%s)', async status => {
  vi.resetAllMocks()
  let live = { ...serverPlan([serverDay([serverExercise('pe1', 'squat', 0)])], status), start_date: '2026-10-19', end_date: '2026-10-25', updated_at: '2026-10-19T00:00:00Z' }
  vi.mocked(plans.getPlan).mockImplementation(async () => structuredClone(live))
  vi.mocked(plans.batchDays).mockImplementation(async (_id, body) => {
    live = { ...live, days: [...live.days.filter(day => !body.delete_day_ids.includes(day.id)), ...serverDaysFromBatch(body.upsert_days)] }
    return structuredClone(live)
  })
  const weeks = mapPlanToWeeks(live, new Map())
  const inserted = insertBlockDay(weeks, 1, '2026-10-22', live.start_date)
  if (status === 'published') {
    await expect(saveBlockPlan('p', inserted, undefined, { published: true })).rejects.toThrow('EMPTY_TRAINING_DAY')
    expect(plans.getPlan).not.toHaveBeenCalled()
    expect(plans.batchDays).not.toHaveBeenCalled()
    return
  }
  const saved = await saveBlockPlan('p', inserted)
  expect(plans.batchDays).toHaveBeenCalledTimes(1)
  expect(vi.mocked(plans.batchDays).mock.calls[0][1]).toMatchObject({ expected_updated_at: live.updated_at, delete_day_ids: [], upsert_days: [{ week_number: 1, day_of_week: 4, exercises: [] }] })
  expect(saved.weeks[0].days[3].serverDayId).toBeTruthy()
  const loaded = mapPlanToWeeks(await plans.getPlan('p'), new Map())
  expect(buildBlockGrid(loaded, live.start_date, [0], [3]).rows[0].cells.map(c => c.dayNumber)).toEqual([1,2])
  await saveBlockPlan('p', saved.weeks)
  expect(plans.batchDays).toHaveBeenCalledTimes(1)
  const deleted = await saveBlockPlan('p', deleteBlockDay(loaded, 1, 3), undefined, { published: true, deletedDayIds: ['batch-day-1-4'] })
  expect(plans.batchDays).toHaveBeenCalledTimes(2)
  expect(vi.mocked(plans.batchDays).mock.calls[1][1]).toMatchObject({ delete_day_ids: ['batch-day-1-4'], upsert_days: [] })
  expect(live.days.map(day => day.day_of_week)).toEqual([1])
  expect(deleted.weeks[0].days[3].serverDayId).toBeFalsy()
})

it.each(['date', 'pattern'] as const)('does not infer deletion of a persisted empty day from a %s move', async action => {
  vi.resetAllMocks()
  let live = { ...serverPlan([serverDay([])], 'draft'), start_date: '2026-10-19', end_date: '2026-10-25', updated_at: '2026-10-19T00:00:00Z' }
  vi.mocked(plans.getPlan).mockImplementation(async () => structuredClone(live))
  vi.mocked(plans.batchDays).mockImplementation(async (_id, body) => {
    live = { ...live, days: [...live.days.filter(day => !body.delete_day_ids.includes(day.id)), ...serverDaysFromBatch(body.upsert_days)] }
    return structuredClone(live)
  })
  const weeks = mapPlanToWeeks(live, new Map())
  const moved = action === 'date' ? changeBlockDate(weeks, {weekNumber: 1, dx: 0}, '2026-10-21', live.start_date)
    : changeBlockPattern(weeks, [2], live.start_date, [0])!
  const result = await saveBlockPlan('p', moved)
  expect(result.weeks[0].days[0]).toMatchObject({ rest: false, serverDayId: 'day1' })
  expect(live.days.map(day => day.day_of_week)).toEqual([1,3])
  expect(vi.mocked(plans.batchDays).mock.calls[0][1].delete_day_ids).toEqual([])
  expect(live.days[0].exercises).toEqual([])
})

it('preserves a server empty day absent from the editor, including its identity for student-added records', async () => {
  vi.resetAllMocks()
  const hidden = { ...serverDay([], 'unseen-day'), day_of_week: 7 }
  let live = { ...serverPlan([serverDay([serverExercise('pe1', 'squat', 0)]), hidden], 'draft'), start_date: '2026-10-19', end_date: '2026-10-25' }
  vi.mocked(plans.getPlan).mockImplementation(async () => structuredClone(live))
  vi.mocked(plans.batchDays).mockImplementation(async (_id, body) => {
    live = { ...live, days: [...live.days.filter(day => !body.delete_day_ids.includes(day.id)), ...serverDaysFromBatch(body.upsert_days)] }
    return structuredClone(live)
  })
  const weeks = mapPlanToWeeks({ ...live, days: live.days.filter(day => day.id !== 'unseen-day') }, new Map())
  await saveBlockPlan('p', weeks)
  expect(live.days.find(day => day.id === 'unseen-day')).toEqual(hidden)
  expect(plans.batchDays).not.toHaveBeenCalled()
})

it('refuses empty-day writes when another client published the draft before this save', async () => {
  vi.resetAllMocks()
  const live = { ...serverPlan([serverDay([serverExercise('pe1', 'squat', 0)])]), start_date: '2026-10-19', end_date: '2026-10-25' }
  vi.mocked(plans.getPlan).mockResolvedValue(live)
  vi.mocked(plans.batchDays).mockResolvedValue(live)
  const weeks = insertBlockDay(mapPlanToWeeks(live, new Map()), 1, '2026-10-22', live.start_date)
  weeks[0].days[0].rows[0].boxes[0].val = '110'
  await expect(saveBlockPlan('p', weeks, undefined, { published: false })).rejects.toThrow('EMPTY_TRAINING_DAY')
  expect(plans.batchDays).not.toHaveBeenCalled()
})
