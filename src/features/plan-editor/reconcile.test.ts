import { describe, it, expect, vi, beforeEach } from 'vitest'
import * as plans from '../../api/plans'
import { ApiException } from '../../api/client'
import { LockedRowMutationError, ReconcileConflict, reconcileImportedPlan, reconcilePlan } from './reconcile'
import type { Week, ExerciseRow, DayCol } from './types'
import type { PlanDayResponse, PlanExerciseResponse, PlanWithChildren } from '../../api/types'
import { mapPlanToWeeks } from './mapping'
import { displayedWeightMode, materializeIntensityRow } from './intensityModel'
import { reorderRowsInWeek } from './weekBandModel'

vi.mock('../../api/plans')

function row(partial: Partial<ExerciseRow>): ExerciseRow {
  return {
    id: 'r', serverRowId: null, serverSortOrder: null, hasLogs: false, conflictMessage: null,
    exerciseId: null, name: '', ku: false, custom: false,
    isMain: false, aux: false, reps: '5', mode: 'kg', boxes: [], note: '',
    ...partial,
  }
}

// One training day (Mon) carrying `rows`; the other six days are rest.
function weekWithMondayRows(rows: ExerciseRow[]): Week {
  const days: DayCol[] = Array.from({ length: 7 }, (_, d) => ({
    dow: d, dowLabel: '', dateLabel: '', rest: d !== 0, rows: d === 0 ? rows : [],
  }))
  return { num: 1, num2: '01', range: '', isCurrent: true, vol: '', days }
}

function numberedWeekWithMondayRows(num: number, rows: ExerciseRow[]): Week {
  return { ...weekWithMondayRows(rows), num, num2: String(num).padStart(2, '0'), isCurrent: num === 1 }
}

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

function legacyRpeExercise(id: string, exerciseId: string, values: string[], hasLogs = false): PlanExerciseResponse {
  return {
    ...serverExercise(id, exerciseId, 0, values[0], hasLogs),
    sets: values.map((value, index) => ({
      ...serverExercise(id, exerciseId, 0, value, hasLogs).sets[0],
      id: `s-${id}-${index + 1}`,
      set_number: index + 1,
      intensity_mode: 'rpe',
      target_value: value,
      load_mode: null,
      target_weight: null,
    })),
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
    total_shift_days: 0, latest_shift_created_at: null, days,
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

function mockBatchEcho(): void {
  vi.mocked(plans.batchDays).mockImplementation(async (_planId, body) => (
    serverPlan(serverDaysFromBatch(body.upsert_days), 'draft')
  ))
}

function boundRow(id: string, serverId: string | null, exerciseId: string, value = '100', partial: Partial<ExerciseRow> = {}): ExerciseRow {
  return row({
    id, serverRowId: serverId, serverSortOrder: partial.serverSortOrder ?? null,
    exerciseId, name: exerciseId, ku: true, boxes: [{ val: value, empty: false }],
    ...partial,
  })
}

describe('reconcilePlan — week-local row order', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockBatchEcho()
  })

  it('persists reordered sort_order only in the week that was changed', async () => {
    const firstServer = [
      serverExercise('w1-a', 'a', 0),
      serverExercise('w1-b', 'b', 1),
      serverExercise('w1-c', 'c', 2),
    ]
    const secondServer = [
      serverExercise('w2-a', 'a', 0),
      serverExercise('w2-c', 'c', 1),
      serverExercise('w2-b', 'b', 2),
    ]
    vi.mocked(plans.getPlan).mockResolvedValue({
      ...serverPlan([
        serverDay(firstServer, 'day-w1'),
        { ...serverDay(secondServer, 'day-w2'), week_number: 2 },
      ], 'draft'),
      plan_weeks: 2,
    })
    const weeks = [
      numberedWeekWithMondayRows(1, firstServer.map((item) => (
        boundRow(item.id, item.id, item.exercise_id, '100', { serverSortOrder: item.sort_order })
      ))),
      numberedWeekWithMondayRows(2, secondServer.map((item) => (
        boundRow(item.id, item.id, item.exercise_id, '100', { serverSortOrder: item.sort_order })
      ))),
    ]
    const reordered = reorderRowsInWeek(weeks, () => 'main', 2, 0, 'w2-a', 'w2-b', 'after')!

    await reconcilePlan('p', reordered)

    const persistedDays = vi.mocked(plans.batchDays).mock.calls[0][1].upsert_days
    expect(persistedDays.map((day) => day.week_number)).toEqual([2])
    expect(persistedDays[0].exercises.map((item) => [item.exercise_id, item.sort_order])).toEqual([
      ['c', 0], ['b', 1], ['a', 2],
    ])
    expect(vi.mocked(plans.batchDays).mock.calls[0][1].upsert_days
      .every((day) => day.exercises.every((exercise) => !Object.hasOwn(exercise, 'target')))).toBe(true)
  })
})

describe('reconcilePlan — skippedRows counts only contentful unbound rows', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(plans.getPlan).mockResolvedValue({ id: 'p', plan_weeks: 1, start_date: '2026-01-01', days: [] } as never)
    mockBatchEcho()
    vi.mocked(plans.deleteExercise).mockResolvedValue(undefined as never)
    vi.mocked(plans.createExercise).mockImplementation(async (_dayId, body) => ({
      id: `new-${body.exercise_id}-${body.sort_order}`,
    } as never))
  })

  it('counts a named-but-unbound row and ignores empty placeholder rows', async () => {
    const rows = [
      row({ id: 'a', exerciseId: 'ex1', name: '深蹲', boxes: [{ val: '100', empty: false }] }), // bound
      row({ id: 'b', exerciseId: null, name: '卧推' }),                                          // named, unbound → counts
      row({ id: 'c', exerciseId: null, name: '', boxes: [] }),                                   // empty placeholder → ignored
    ]
    const res = await reconcilePlan('p', [weekWithMondayRows(rows)])
    expect(res.skippedRows).toBe(1)
  })

  it('counts an unbound row that carries set values but no name', async () => {
    const rows = [
      row({ id: 'a', exerciseId: 'ex1', name: '深蹲', boxes: [{ val: '100', empty: false }] }), // bound
      row({ id: 'b', exerciseId: null, name: '', boxes: [{ val: '80', empty: false }] }),        // values, unbound → counts
    ]
    const res = await reconcilePlan('p', [weekWithMondayRows(rows)])
    expect(res.skippedRows).toBe(1)
  })

  it('reports zero skipped when every row is either bound or an empty placeholder', async () => {
    const rows = [
      row({ id: 'a', exerciseId: 'ex1', name: '深蹲', boxes: [{ val: '100', empty: false }] }),
      row({ id: 'c', exerciseId: null, name: '', boxes: [] }),
    ]
    const res = await reconcilePlan('p', [weekWithMondayRows(rows)])
    expect(res.skippedRows).toBe(0)
  })

  it.each([
    ['intensity-only', {
      intensity: { mode: 'rpe' as const, value: '8', high: '' },
      intensityMode: 'per_set' as const,
      intensityBoxes: [{ val: '8', empty: false }, { val: '8.5', empty: false }],
      boxes: [{ val: '', empty: true }, { val: '', empty: true }],
    }],
    ['weight-only', {
      intensity: null,
      boxes: [{ val: '170', empty: false }, { val: '172.5', empty: false }],
    }],
    ['sparse mixed per-set', {
      intensity: { mode: 'rpe' as const, value: '8', high: '' },
      intensityMode: 'per_set' as const,
      intensityBoxes: [
        { val: '8', empty: false },
        { val: '', empty: true },
        { val: '9', empty: false },
      ],
      boxes: [
        { val: '', empty: true },
        { val: '172.5', empty: false },
        { val: '', empty: true },
      ],
    }],
  ])('does not skip or reject a complete %s row', async (_label, partial) => {
    const res = await reconcilePlan('p', [weekWithMondayRows([
      row({ id: 'complete', exerciseId: 'ex', name: '深蹲', ...partial }),
    ])])

    expect(res).toMatchObject({ changedDays: 1, skippedRows: 0 })
    expect(vi.mocked(plans.batchDays)).toHaveBeenCalledTimes(1)
    expect(vi.mocked(plans.batchDays).mock.calls[0][1].upsert_days[0].exercises[0].sets)
      .toHaveLength(partial.boxes.length)
  })

  it('writes rep ranges as target_reps_max and includes the max in diffing', async () => {
    const rows = [
      row({
        id: 'a',
        exerciseId: 'ex1',
        name: '帕洛夫推+旋转',
        reps: '10-12',
        boxes: [{ val: '9', empty: false }],
        mode: 'rpe',
      }),
    ]

    await reconcilePlan('p', [weekWithMondayRows(rows)])

    expect(vi.mocked(plans.batchDays).mock.calls[0][1].upsert_days[0].exercises[0].sets[0]).toEqual({
      set_number: 1, target_reps: 10, target_reps_max: 12,
      intensity_mode: 'rpe', target_value: '9',
      set_type: 'working', rest_seconds: null, coach_note: null,
    })
  })

  it('opens a legacy per-set RPE row without autosave rewriting load_mode', async () => {
    const legacy = legacyRpeExercise('legacy', 'legacy-ex', ['7.5', '8'])
    const baseline = serverPlan([serverDay([legacy])], 'draft')
    vi.mocked(plans.getPlan).mockResolvedValue(baseline)
    const weeks = mapPlanToWeeks(baseline, new Map([['legacy-ex', { name: '旧 RPE', custom: false }]]))

    await expect(reconcilePlan('p', weeks)).resolves.toMatchObject({ changedDays: 0 })
    expect(plans.batchDays).not.toHaveBeenCalled()
    expect(plans.deleteExercise).not.toHaveBeenCalled()
    expect(plans.createExercise).not.toHaveBeenCalled()
  })

  it('treats a legacy pct row without pct_anchor as the default and performs no writes', async () => {
    const stored = serverExercise('legacy-pct', 'pct-ex', 0, '75')
    stored.sets[0] = {
      ...stored.sets[0],
      load_mode: 'pct',
      target_pct: '75',
      target_weight: null,
    }
    const baseline = serverPlan([serverDay([stored])], 'draft')
    vi.mocked(plans.getPlan).mockResolvedValue(baseline)
    const weeks = mapPlanToWeeks(baseline, new Map([['pct-ex', { name: '百分比动作', custom: false }]]))

    expect(weeks[0].days[0].rows[0].pctAnchor).toBe('one_rm')
    await expect(reconcilePlan('p', weeks)).resolves.toMatchObject({ changedDays: 0, skippedRows: 0 })
    expect(plans.batchDays).not.toHaveBeenCalled()
    expect(plans.deleteExercise).not.toHaveBeenCalled()
    expect(plans.createExercise).not.toHaveBeenCalled()
    expect(plans.createSet).not.toHaveBeenCalled()
  })

  it('presents a legacy pure-weight row without autosave migrating load_mode', async () => {
    const legacy = serverExercise('legacy-weight', 'legacy-ex', 0, '170')
    legacy.sets[0] = { ...legacy.sets[0], load_mode: null, target_weight: null }
    const baseline = serverPlan([serverDay([legacy])], 'draft')
    vi.mocked(plans.getPlan).mockResolvedValue(baseline)
    const weeks = mapPlanToWeeks(baseline, new Map([['legacy-ex', { name: '旧重量', custom: false }]]))

    expect(weeks[0].days[0].rows[0]).toMatchObject({
      legacyWeightSource: true,
      intensity: null,
      boxes: [{ val: '170', empty: false }],
    })
    await expect(reconcilePlan('p', weeks)).resolves.toMatchObject({ changedDays: 0, skippedRows: 0 })
    expect(plans.batchDays).not.toHaveBeenCalled()
    expect(plans.deleteExercise).not.toHaveBeenCalled()
    expect(plans.createExercise).not.toHaveBeenCalled()
  })

  it('opens stored per-set fixed_weight values without folding or writing them', async () => {
    const stored = serverExercise('fixed-per-set', 'fixed-ex', 0, '170')
    stored.sets = ['170', '172.5'].map((targetWeight, index) => ({
      ...stored.sets[0],
      id: `fixed-set-${index + 1}`,
      set_number: index + 1,
      load_mode: 'fixed_weight',
      target_weight: targetWeight,
      target_value: targetWeight,
    }))
    const baseline = serverPlan([serverDay([stored])], 'draft')
    vi.mocked(plans.getPlan).mockResolvedValue(baseline)
    const weeks = mapPlanToWeeks(baseline, new Map([['fixed-ex', { name: '存量固定重量', custom: false }]]))
    const mapped = weeks[0].days[0].rows[0]

    expect(mapped.boxes).toEqual([
      { val: '170', empty: false },
      { val: '172.5', empty: false },
    ])
    expect(displayedWeightMode(mapped)).toBe('per_set')
    await expect(reconcilePlan('p', weeks)).resolves.toMatchObject({ changedDays: 0, skippedRows: 0 })
    expect(plans.batchDays).not.toHaveBeenCalled()
    expect(plans.deleteExercise).not.toHaveBeenCalled()
    expect(plans.createExercise).not.toHaveBeenCalled()
  })

  it('converts a legacy RPE row to per-set load_mode only after an explicit row edit', async () => {
    const legacy = legacyRpeExercise('legacy', 'legacy-ex', ['7.5', '8'])
    const baseline = serverPlan([serverDay([legacy])], 'draft')
    vi.mocked(plans.getPlan).mockResolvedValue(baseline)
    mockBatchEcho()
    const weeks = mapPlanToWeeks(baseline, new Map([['legacy-ex', { name: '旧 RPE', custom: false }]]))
    weeks[0].days[0].rows[0] = { ...materializeIntensityRow(weeks[0].days[0].rows[0]), reps: '6' }

    await reconcilePlan('p', weeks)

    const sets = vi.mocked(plans.batchDays).mock.calls[0][1].upsert_days[0].exercises[0].sets
    expect(sets).toEqual([
      expect.objectContaining({ target_reps: 6, load_mode: 'rpe', target_rpe: '7.5', target_weight: null }),
      expect.objectContaining({ target_reps: 6, load_mode: 'rpe', target_rpe: '8', target_weight: null }),
    ])
    expect(sets.every((set) => set.intensity_mode === undefined && set.target_value === undefined)).toBe(true)
  })

  it('writes strength modes and all four weight modes without changing backend compatibility', async () => {
    const modes: ExerciseRow[] = [
      row({ id: 'pct', exerciseId: 'pct', name: 'pct', intensity: { mode: 'pct', value: '72.5', high: '' }, pctAnchor: 'e1rm', intensityMode: 'per_set', intensityBoxes: [{ val: '72.5', empty: false }, { val: '75', empty: false }], boxes: [{ val: '170', empty: false }, { val: '', empty: true }] }),
      row({ id: 'pct-default', exerciseId: 'pct-default', name: 'pct-default', intensity: { mode: 'pct', value: '70', high: '' }, boxes: [{ val: '', empty: true }] }),
      row({ id: 'rpe', exerciseId: 'rpe', name: 'rpe', intensity: { mode: 'rpe', value: '8', high: '' }, boxes: [{ val: '', empty: true }, { val: '', empty: true }] }),
      row({ id: 'rir', exerciseId: 'rir', name: 'rir', intensity: { mode: 'rir', value: '2', high: '' }, boxes: [{ val: '', empty: true }] }),
      row({ id: 'wr', exerciseId: 'wr', name: 'wr', intensity: { mode: 'weight_range', value: '165', high: '175' }, boxes: [{ val: '', empty: true }] }),
      row({ id: 'rr', exerciseId: 'rr', name: 'rr', intensity: { mode: 'rpe_range', value: '7', high: '8.5' }, boxes: [{ val: '170', empty: false }] }),
      row({ id: 'fixed', exerciseId: 'fixed', name: 'fixed', intensity: null, boxes: [{ val: '170', empty: false }, { val: '170', empty: false }], weightMode: 'uniform' }),
      row({ id: 'per', exerciseId: 'per', name: 'per', intensity: null, boxes: [{ val: '170', empty: false }, { val: '172.5', empty: false }], weightMode: 'per_set' }),
      row({ id: 'fixed-wire', exerciseId: 'fixed-wire', name: 'fixed-wire', intensity: { mode: 'fixed_weight', value: '', high: '' }, boxes: [{ val: '180', empty: false }], weightMode: 'uniform' }),
    ]

    await reconcilePlan('p', [weekWithMondayRows(modes)])

    const exercises = vi.mocked(plans.batchDays).mock.calls[0][1].upsert_days[0].exercises
    const byId = new Map(exercises.map((exercise) => [exercise.exercise_id, exercise.sets]))
    expect(byId.get('pct')).toEqual([
      expect.objectContaining({ load_mode: 'pct', target_pct: '72.5', pct_anchor: 'e1rm', target_weight: '170' }),
      expect.objectContaining({ load_mode: 'pct', target_pct: '75', pct_anchor: 'e1rm', target_weight: null }),
    ])
    expect(byId.get('pct-default')?.[0]).toEqual(expect.objectContaining({ load_mode: 'pct', pct_anchor: null }))
    expect(byId.get('rpe')?.[0]).toEqual(expect.objectContaining({ load_mode: 'rpe', target_rpe: '8' }))
    expect(byId.get('rir')?.[0]).toEqual(expect.objectContaining({ load_mode: 'rir', rir_target: '2' }))
    expect(byId.get('wr')?.[0]).toEqual(expect.objectContaining({ load_mode: 'weight_range', weight_low: '165', weight_high: '175', target_weight: null }))
    expect(byId.get('rr')?.[0]).toEqual(expect.objectContaining({ load_mode: 'rpe_range', rpe_low: '7', rpe_high: '8.5', target_weight: '170' }))
    expect(byId.get('fixed')).toEqual([
      expect.objectContaining({ load_mode: null, target_weight: '170' }),
      expect.objectContaining({ load_mode: null, target_weight: '170' }),
    ])
    expect(byId.get('per')).toEqual([
      expect.objectContaining({ load_mode: null, target_weight: '170' }),
      expect.objectContaining({ load_mode: null, target_weight: '172.5' }),
    ])
    expect(byId.get('fixed-wire')?.[0]).toEqual(expect.objectContaining({ load_mode: 'fixed_weight', target_weight: '180' }))
    expect(exercises.filter((exercise) => !exercise.exercise_id.startsWith('pct'))
      .flatMap((exercise) => exercise.sets)
      .every((set) => !Object.hasOwn(set, 'pct_anchor'))).toBe(true)
    expect(exercises.flatMap((exercise) => exercise.sets).every((set) => (
      set.intensity_mode === undefined && set.target_value === undefined
    ))).toBe(true)
  })

  it('persists bodyweight rows as publishable sets with a bodyweight coach note', async () => {
    const rows = [
      row({
        id: 'a',
        exerciseId: 'ex1',
        name: '双杠臂屈伸',
        reps: '10-15',
        mode: 'bodyweight',
        boxes: Array.from({ length: 4 }, () => ({ val: '', empty: true })),
        note: '先自重',
      }),
    ]

    await reconcilePlan('p', [weekWithMondayRows(rows)])

    const sets = vi.mocked(plans.batchDays).mock.calls[0][1].upsert_days[0].exercises[0].sets
    expect(sets).toHaveLength(4)
    expect(sets[0]).toEqual(expect.objectContaining({
      target_reps: 10,
      target_reps_max: 15,
      intensity_mode: 'rpe',
      target_value: '10',
      coach_note: '自重',
      rest_seconds: null,
    }))
  })

  it('does not impose a client-side status gate on published plans', async () => {
    vi.mocked(plans.getPlan).mockResolvedValue({
      id: 'p', plan_weeks: 1, start_date: '2026-01-01', status: 'published', days: [],
    } as never)

    await expect(reconcilePlan('p', [weekWithMondayRows([
      row({ exerciseId: 'ex1', name: '深蹲', boxes: [{ val: '100', empty: false }] }),
    ])])).resolves.toMatchObject({ changedDays: 1 })
    expect(plans.batchDays).toHaveBeenCalledTimes(1)
  })

  it('rejects incomplete bound prescriptions before replacing any server day', async () => {
    vi.mocked(plans.getPlan).mockResolvedValue({
      id: 'p',
      plan_weeks: 1,
      start_date: '2026-01-01',
      days: [{ id: 'old-day', week_number: 1, day_of_week: 1, exercises: [] }],
    } as never)
    const incomplete = row({
      exerciseId: 'ex1',
      name: '深蹲',
      reps: '5',
      boxes: [{ val: '', empty: true }],
    })

    await expect(reconcilePlan('p', [weekWithMondayRows([incomplete])])).rejects.toMatchObject({
      code: 'PLAN_SET_SPEC_INCOMPLETE',
    })
    expect(plans.batchDays).not.toHaveBeenCalled()
  })

  it.each([
    ['out-of-range KG', { boxes: [{ val: '1000', empty: false }] }],
    ['off-step RPE', { mode: 'rpe' as const, boxes: [{ val: '7.3', empty: false }] }],
    ['out-of-range reps', { reps: '99', boxes: [{ val: '100', empty: false }] }],
  ])('rejects %s through the shared guard before replacing any server day', async (_label, partial) => {
    vi.mocked(plans.getPlan).mockResolvedValue({
      id: 'p',
      plan_weeks: 1,
      start_date: '2026-01-01',
      days: [{ id: 'old-day', week_number: 1, day_of_week: 1, exercises: [] }],
    } as never)

    await expect(reconcilePlan('p', [weekWithMondayRows([
      row({ exerciseId: 'ex1', name: '深蹲', ...partial }),
    ])])).rejects.toMatchObject({ code: 'PLAN_SET_SPEC_INCOMPLETE' })
    expect(plans.batchDays).not.toHaveBeenCalled()
  })

  it('refuses backend plans with richer per-set fields rather than flattening them', async () => {
    vi.mocked(plans.getPlan).mockResolvedValue({
      id: 'p',
      plan_weeks: 1,
      start_date: '2026-01-01',
      days: [{
        id: 'old-day',
        week_number: 1,
        day_of_week: 1,
        exercises: [{
          id: 'pe1',
          exercise_id: 'ex1',
          is_main_lift: false,
          sort_order: 0,
          notes: null,
          sets: [{
            id: 'set1',
            set_number: 1,
            target_reps: 5,
            target_reps_max: null,
            intensity_mode: 'weight',
            target_value: '100',
            set_type: 'working',
            coach_note: null,
            rest_seconds: 120,
          }],
        }],
      }],
    } as never)

    await expect(reconcilePlan('p', [weekWithMondayRows([])])).rejects.toMatchObject({
      code: 'PLAN_REQUIRES_NATIVE_EDITOR',
    })
    expect(plans.batchDays).not.toHaveBeenCalled()
  })
})

describe('reconcilePlan — derived rest-day authority', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockBatchEcho()
  })

  it('keeps server actions intact when a legacy day is rest:true but still has rows', async () => {
    const stored = serverExercise('stored', 'squat', 0)
    vi.mocked(plans.getPlan).mockResolvedValue(serverPlan([serverDay([stored])], 'draft'))
    const week = weekWithMondayRows([
      boundRow('local', 'stored', 'squat', '100', { serverSortOrder: 0 }),
    ])
    week.days[0] = { ...week.days[0], rest: true }

    const result = await reconcilePlan('p', [week])

    expect(result.changedDays).toBe(0)
    expect(result.weeks[0].days[0].rows[0]).toMatchObject({ serverRowId: 'stored' })
    expect(plans.deleteDay).not.toHaveBeenCalled()
    expect(plans.deleteExercise).not.toHaveBeenCalled()
    expect(plans.batchDays).not.toHaveBeenCalled()
  })
})

describe('reconcilePlan — exercise-granularity history locks', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockBatchEcho()
    vi.mocked(plans.deleteExercise).mockResolvedValue(undefined as never)
    vi.mocked(plans.createSet).mockResolvedValue(undefined as never)
    vi.mocked(plans.patchPlan).mockResolvedValue({} as never)
    vi.mocked(plans.createExercise).mockImplementation(async (_dayId, body) => ({
      id: `new-${body.exercise_id}-${body.sort_order}`,
    } as never))
  })

  it('keeps a mixed day out of whole-day delete/recreate and performs row CRUD only', async () => {
    const locked = serverExercise('locked', 'lock-ex', 0, '90', true)
    const changed = serverExercise('changed', 'change-ex', 1, '100')
    const removed = serverExercise('removed', 'remove-ex', 2, '70')
    vi.mocked(plans.getPlan).mockResolvedValue(serverPlan([serverDay([locked, changed, removed])]))

    const result = await reconcilePlan('p', [weekWithMondayRows([
      boundRow('l', 'locked', 'lock-ex', '90', { hasLogs: true, serverSortOrder: 0 }),
      boundRow('c', 'changed', 'change-ex', '105', { serverSortOrder: 1 }),
      boundRow('n', null, 'new-ex', '50', { serverSortOrder: 2 }),
    ])])

    expect(plans.deleteDay).not.toHaveBeenCalled()
    expect(plans.batchDays).not.toHaveBeenCalled()
    expect(plans.deleteExercise).toHaveBeenCalledWith('changed')
    expect(plans.deleteExercise).toHaveBeenCalledWith('removed')
    expect(plans.deleteExercise).not.toHaveBeenCalledWith('locked')
    expect(plans.createExercise).toHaveBeenCalledTimes(2)
    expect(plans.createExercise).toHaveBeenCalledWith('day1', expect.objectContaining({ exercise_id: 'change-ex', sort_order: 1 }))
    expect(plans.createExercise).toHaveBeenCalledWith('day1', expect.objectContaining({ exercise_id: 'new-ex', sort_order: 2 }))
    expect(vi.mocked(plans.createExercise).mock.calls[1][1]).not.toHaveProperty('target')
    expect(result.changedDays).toBe(1)
  })

  it('uses the createSet path to send anchors only for pct rows and encodes 1RM as null', async () => {
    const locked = serverExercise('locked', 'lock-ex', 0, '90', true)
    vi.mocked(plans.getPlan).mockResolvedValue(serverPlan([serverDay([locked])]))

    await reconcilePlan('p', [weekWithMondayRows([
      boundRow('locked-row', 'locked', 'lock-ex', '90', { hasLogs: true, serverSortOrder: 0 }),
      row({
        id: 'pct-e1rm', exerciseId: 'pct-e1rm', name: 'pct-e1rm',
        intensity: { mode: 'pct', value: '75', high: '' }, pctAnchor: 'e1rm',
        boxes: [{ val: '', empty: true }],
      }),
      row({
        id: 'pct-default', exerciseId: 'pct-default', name: 'pct-default',
        intensity: { mode: 'pct', value: '70', high: '' }, pctAnchor: 'one_rm',
        boxes: [{ val: '', empty: true }],
      }),
      row({
        id: 'rpe', exerciseId: 'rpe', name: 'rpe',
        intensity: { mode: 'rpe', value: '8', high: '' }, pctAnchor: 'top_set',
        boxes: [{ val: '', empty: true }],
      }),
    ])])

    const bodies = vi.mocked(plans.createSet).mock.calls.map(([, body]) => body)
    expect(bodies).toEqual([
      expect.objectContaining({ load_mode: 'pct', pct_anchor: 'e1rm' }),
      expect.objectContaining({ load_mode: 'pct', pct_anchor: null }),
      expect.objectContaining({ load_mode: 'rpe' }),
    ])
    expect(bodies[2]).not.toHaveProperty('pct_anchor')
    expect(plans.batchDays).not.toHaveBeenCalled()
  })

  it('sends zero writes for a locked row and blocks a local locked-row mutation before other writes', async () => {
    const locked = serverExercise('locked', 'lock-ex', 0, '90', true)
    vi.mocked(plans.getPlan).mockResolvedValue(serverPlan([serverDay([locked])]))
    const weeks = [weekWithMondayRows([
      boundRow('l', 'locked', 'lock-ex', '95', { hasLogs: true, serverSortOrder: 0 }),
    ])]

    await expect(reconcilePlan('p', weeks)).rejects.toBeInstanceOf(LockedRowMutationError)
    expect(plans.deleteDay).not.toHaveBeenCalled()
    expect(plans.batchDays).not.toHaveBeenCalled()
    expect(plans.deleteExercise).not.toHaveBeenCalled()
    expect(plans.createExercise).not.toHaveBeenCalled()
  })

  it('does not treat an untouched locked legacy per-set RPE row as a mutation', async () => {
    const locked = legacyRpeExercise('locked-legacy', 'legacy-ex', ['7.5', '8'], true)
    const baseline = serverPlan([serverDay([locked])])
    vi.mocked(plans.getPlan).mockResolvedValue(baseline)
    const weeks = mapPlanToWeeks(baseline, new Map([['legacy-ex', { name: '旧 RPE', custom: false }]]))

    await expect(reconcilePlan('p', weeks)).resolves.toMatchObject({ changedDays: 0 })
    expect(plans.batchDays).not.toHaveBeenCalled()
    expect(plans.deleteExercise).not.toHaveBeenCalled()
    expect(plans.createExercise).not.toHaveBeenCalled()
  })

  it('routes a day without logs through whole-day batch upsert', async () => {
    const original = serverExercise('old', 'ex', 0, '100')
    vi.mocked(plans.getPlan).mockResolvedValue(serverPlan([serverDay([original])], 'draft'))
    await reconcilePlan('p', [weekWithMondayRows([boundRow('r', 'old', 'ex', '105')])])
    expect(plans.batchDays).toHaveBeenCalledWith('p', expect.objectContaining({
      // The changed day's original must be deleted in the same batch:
      // upsert_days is pure INSERT, so keeping it would duplicate the day.
      delete_day_ids: ['day1'],
      upsert_days: [expect.objectContaining({ week_number: 1, day_of_week: 1 })],
    }))
    expect(plans.deleteDay).not.toHaveBeenCalled()
    expect(plans.deleteExercise).not.toHaveBeenCalled()
  })

  it('never sends calendar plan_patch from published reconcile and rejects published import defensively', async () => {
    vi.mocked(plans.getPlan).mockResolvedValue(serverPlan([], 'published'))
    await reconcilePlan('p', [weekWithMondayRows([])], undefined, { published: true })
    expect(plans.patchPlan).not.toHaveBeenCalled()
    expect(plans.batchDays).not.toHaveBeenCalled()
    await expect(reconcileImportedPlan('p', [weekWithMondayRows([])], '2026-01-01', undefined, { published: true }))
      .rejects.toMatchObject({ code: 'PUBLISHED_IMPORT_FORBIDDEN' })
    expect(plans.patchPlan).not.toHaveBeenCalled()
  })

  it('runs the unlocked batch before mixed-day row CRUD and reports both progress routes', async () => {
    const unlocked = serverExercise('unlocked', 'unlocked-ex', 0, '100')
    const locked = { ...serverExercise('locked', 'locked-ex', 0, '90', true), plan_day_id: 'mixed-day' }
    const mutable = { ...serverExercise('mutable', 'mutable-ex', 1, '80'), plan_day_id: 'mixed-day' }
    const mixedDay = { ...serverDay([locked, mutable], 'mixed-day'), day_of_week: 2 }
    const initial = serverPlan([serverDay([unlocked]), mixedDay])
    vi.mocked(plans.getPlan).mockResolvedValue(initial)
    vi.mocked(plans.batchDays).mockResolvedValue(initial)
    const week = weekWithMondayRows([boundRow('u', 'unlocked', 'unlocked-ex', '105')])
    week.days[1] = { ...week.days[1], rest: false, rows: [
      boundRow('l', 'locked', 'locked-ex', '90', { hasLogs: true, serverSortOrder: 0 }),
      boundRow('m', 'mutable', 'mutable-ex', '85', { serverSortOrder: 1 }),
    ] }
    const progress = vi.fn()

    const result = await reconcilePlan('p', [week], progress)

    expect(vi.mocked(plans.batchDays).mock.calls[0][1].upsert_days).toEqual([
      expect.objectContaining({ week_number: 1, day_of_week: 1 }),
    ])
    expect(plans.deleteExercise).toHaveBeenCalledWith('mutable')
    expect(vi.mocked(plans.batchDays).mock.invocationCallOrder[0])
      .toBeLessThan(vi.mocked(plans.deleteExercise).mock.invocationCallOrder[0])
    expect(progress.mock.calls).toEqual([[1, 2], [2, 2]])
    expect(result.changedDays).toBe(2)
  })
})

describe('reconcilePlan — batch payload and errors', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockBatchEcho()
  })

  it('upserts only changed non-empty days, deletes a cleared day, and preserves result counts', async () => {
    const changed = serverDay([serverExercise('changed', 'change-ex', 0, '100')], 'changed-day')
    const unchangedExercise = { ...serverExercise('same', 'same-ex', 0, '80'), plan_day_id: 'same-day' }
    const unchanged = { ...serverDay([unchangedExercise], 'same-day'), day_of_week: 2 }
    const clearedExercise = { ...serverExercise('clear', 'clear-ex', 0, '60'), plan_day_id: 'clear-day' }
    const cleared = { ...serverDay([clearedExercise], 'clear-day'), day_of_week: 3 }
    vi.mocked(plans.getPlan).mockResolvedValue(serverPlan([changed, unchanged, cleared], 'draft'))
    const week = weekWithMondayRows([
      boundRow('changed-row', 'changed', 'change-ex', '105'),
      row({ id: 'unbound', name: '未绑定动作' }),
    ])
    week.days[1] = { ...week.days[1], rest: false, rows: [boundRow('same-row', 'same', 'same-ex', '80')] }

    const result = await reconcilePlan('p', [week])

    expect(plans.batchDays).toHaveBeenCalledTimes(1)
    expect(vi.mocked(plans.batchDays).mock.calls[0][1]).toEqual({
      delete_day_ids: ['changed-day', 'clear-day'],
      upsert_days: [{
        week_number: 1, day_of_week: 1, sort_order: 0,
        exercises: [{
          exercise_id: 'change-ex', is_main_lift: false, sort_order: 0, notes: null,
          sets: [{
            set_number: 1, target_reps: 5, target_reps_max: null, load_mode: null,
            target_pct: null, target_rpe: null, rir_target: null, rpe_low: null, rpe_high: null,
            weight_low: null, weight_high: null, target_weight: '105',
            set_type: 'working', rest_seconds: null, coach_note: null,
          }],
        }],
      }],
    })
    expect(result).toMatchObject({ changedDays: 2, skippedRows: 1 })
    expect(result.weeks[0].days[0].rows[0].serverRowId).toBe('batch-ex-1-1-0')
  })

  it('sends no batch request when the live baseline already matches', async () => {
    const same = { ...serverExercise('same', 'same-ex', 0, '80'), target: 'retired-value' }
    vi.mocked(plans.getPlan).mockResolvedValue(serverPlan([serverDay([same])], 'draft'))

    const result = await reconcilePlan('p', [weekWithMondayRows([
      boundRow('same-row', 'same', 'same-ex', '80'),
    ])])

    expect(plans.batchDays).not.toHaveBeenCalled()
    expect(result.changedDays).toBe(0)
    expect(result.weeks[0].days[0].rows[0].serverRowId).toBe('same')
  })

  it('propagates EXERCISE_NOT_FOUND_OR_HIDDEN without a 409 refetch/merge', async () => {
    const error = new ApiException(400, 'EXERCISE_NOT_FOUND_OR_HIDDEN')
    vi.mocked(plans.getPlan).mockResolvedValue(serverPlan([], 'draft'))
    vi.mocked(plans.batchDays).mockRejectedValueOnce(error)

    await expect(reconcilePlan('p', [weekWithMondayRows([
      boundRow('new', null, 'hidden-ex', '50'),
    ])])).rejects.toBe(error)
    expect(plans.getPlan).toHaveBeenCalledTimes(1)
  })

  it('chunks more than 60 upserts sequentially and sends import patch/deletes only in the first chunk', async () => {
    let dayIndex = 0
    const weeks: Week[] = Array.from({ length: 9 }, (_, weekIndex) => ({
      num: weekIndex + 1,
      num2: String(weekIndex + 1).padStart(2, '0'),
      range: '', isCurrent: false, vol: '',
      days: Array.from({ length: 7 }, (_, dow) => {
        const index = dayIndex++
        return {
          dow, dowLabel: '', dateLabel: '', rest: index >= 61,
          rows: index < 61 ? [boundRow(`row-${index}`, null, `exercise-${index}`, '50')] : [],
        }
      }),
    }))
    const outside = { ...serverDay([], 'outside'), week_number: 10 }
    const baseline = { ...serverPlan([outside], 'draft'), plan_weeks: 10 }
    vi.mocked(plans.getPlan).mockResolvedValue(baseline)
    const liveDays = new Map<string, PlanDayResponse>([['outside', outside]])
    vi.mocked(plans.batchDays).mockImplementation(async (_planId, body) => {
      for (const id of body.delete_day_ids) liveDays.delete(id)
      for (const day of serverDaysFromBatch(body.upsert_days)) liveDays.set(day.id, day)
      return { ...baseline, days: [...liveDays.values()] }
    })
    const progress = vi.fn()

    const result = await reconcileImportedPlan('p', weeks, '2026-01-01', progress)

    expect(plans.batchDays).toHaveBeenCalledTimes(2)
    const first = vi.mocked(plans.batchDays).mock.calls[0][1]
    const second = vi.mocked(plans.batchDays).mock.calls[1][1]
    expect(first.plan_patch).toEqual({
      plan_weeks: 9, start_date: '2026-01-01', end_date: '2026-03-04',
    })
    expect(first.delete_day_ids).toEqual(['outside'])
    expect(first.upsert_days).toHaveLength(60)
    expect(second).not.toHaveProperty('plan_patch')
    expect(second.delete_day_ids).toEqual([])
    expect(second.upsert_days).toHaveLength(1)
    expect(progress.mock.calls).toEqual([[1, 2], [2, 2]])
    expect(result.changedDays).toBe(61)
    expect(result.weeks[0].days[0].rows[0].serverRowId).toBe('batch-ex-1-1-0')
    expect(result.weeks[8].days[4].rows[0].serverRowId).toBe('batch-ex-9-5-0')
  })
})

describe('reconcilePlan — partial success identity convergence', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(plans.deleteExercise).mockResolvedValue(undefined as never)
    vi.mocked(plans.createSet).mockResolvedValue(undefined as never)
  })

  it('claims a new row whose POST succeeded but response was lost, without duplicating it on resave', async () => {
    const locked = serverExercise('locked', 'lock', 0, '90', true)
    const landed = serverExercise('landed', 'new', 1, '50')
    vi.mocked(plans.getPlan)
      .mockResolvedValueOnce(serverPlan([serverDay([locked])]))
      .mockResolvedValueOnce(serverPlan([serverDay([locked, landed])]))
    vi.mocked(plans.createExercise).mockRejectedValueOnce(new Error('response lost'))
    const weeks = [weekWithMondayRows([
      boundRow('l', 'locked', 'lock', '90', { hasLogs: true, serverSortOrder: 0 }),
      boundRow('n', null, 'new', '50'),
    ])]

    await expect(reconcilePlan('p', weeks)).rejects.toThrow('response lost')
    const result = await reconcilePlan('p', weeks)
    expect(plans.createExercise).toHaveBeenCalledTimes(1)
    expect(result.weeks[0].days[0].rows[1].serverRowId).toBe('landed')
    expect(result.changedDays).toBe(0)
  })

  it('downgrades a row with a successful DELETE and failed recreate POST to a new row on resave', async () => {
    const locked = serverExercise('locked', 'lock', 0, '90', true)
    const old = serverExercise('old', 'edit', 1, '100')
    vi.mocked(plans.getPlan)
      .mockResolvedValueOnce(serverPlan([serverDay([locked, old])]))
      .mockResolvedValueOnce(serverPlan([serverDay([locked])]))
    vi.mocked(plans.createExercise)
      .mockRejectedValueOnce(new Error('post failed'))
      .mockResolvedValueOnce({ id: 'replacement' } as never)
    const weeks = [weekWithMondayRows([
      boundRow('l', 'locked', 'lock', '90', { hasLogs: true, serverSortOrder: 0 }),
      boundRow('e', 'old', 'edit', '105', { serverSortOrder: 1 }),
    ])]

    await expect(reconcilePlan('p', weeks)).rejects.toThrow('post failed')
    const result = await reconcilePlan('p', weeks)
    expect(plans.deleteExercise).toHaveBeenCalledTimes(1)
    expect(plans.createExercise).toHaveBeenCalledTimes(2)
    expect(plans.createExercise).toHaveBeenLastCalledWith('day1', expect.objectContaining({ sort_order: 1 }))
    expect(result.weeks[0].days[0].rows[1].serverRowId).toBe('replacement')
  })

  it('gives a valid id first claim over an orphan when two rows have identical canon', async () => {
    const locked = serverExercise('locked', 'lock', 0, '90', true)
    const a = serverExercise('a', 'dup', 1, '100')
    const b = serverExercise('b', 'dup', 2, '100')
    vi.mocked(plans.getPlan).mockResolvedValue(serverPlan([serverDay([locked, a, b])]))
    const result = await reconcilePlan('p', [weekWithMondayRows([
      boundRow('l', 'locked', 'lock', '90', { hasLogs: true, serverSortOrder: 0 }),
      boundRow('valid', 'a', 'dup', '100', { serverSortOrder: 1 }),
      boundRow('orphan', 'gone', 'dup', '100', { serverSortOrder: 2 }),
    ])])

    const rows = result.weeks[0].days[0].rows
    expect(rows.find((item) => item.id === 'valid')?.serverRowId).toBe('a')
    expect(rows.find((item) => item.id === 'orphan')?.serverRowId).toBe('b')
    expect(plans.deleteExercise).not.toHaveBeenCalled()
    expect(plans.createExercise).not.toHaveBeenCalled()
  })
})

describe('reconcilePlan — mixed-day sort_order invariants', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(plans.deleteExercise).mockResolvedValue(undefined as never)
    vi.mocked(plans.createSet).mockResolvedValue(undefined as never)
    vi.mocked(plans.createExercise).mockImplementation(async (_day, body) => ({ id: `new-${body.exercise_id}` } as never))
  })

  it.each([
    ['locked before', [serverExercise('lock', 'lock', 0, '90', true), serverExercise('edit', 'edit', 1)], 1],
    ['locked after', [serverExercise('edit', 'edit', 0), serverExercise('lock', 'lock', 1, '90', true)], 0],
  ])('reuses the edited row slot with %s and never writes the locked slot', async (_name, baseline, expectedSlot) => {
    vi.mocked(plans.getPlan).mockResolvedValue(serverPlan([serverDay(baseline)]))
    const lock = baseline.find((exercise) => exercise.has_logs)!
    const edit = baseline.find((exercise) => !exercise.has_logs)!
    const result = await reconcilePlan('p', [weekWithMondayRows([
      boundRow('lock-row', lock.id, lock.exercise_id, '90', { hasLogs: true, serverSortOrder: lock.sort_order }),
      boundRow('edit-row', edit.id, edit.exercise_id, '105', { serverSortOrder: edit.sort_order }),
    ])])
    expect(plans.createExercise).toHaveBeenCalledWith('day1', expect.objectContaining({ sort_order: expectedSlot }))
    expect(plans.deleteExercise).not.toHaveBeenCalledWith(lock.id)
    const visible = result.weeks[0].days[0].rows.map((item) => item.serverSortOrder)
    expect(visible).toEqual([...visible].sort((a, b) => a! - b!))
  })

  it('reuses multiple replacement slots, fills released slots, then appends overflow at max+1', async () => {
    const baseline = [
      serverExercise('a', 'a', 0), serverExercise('b', 'b', 1),
      serverExercise('lock', 'lock', 2, '90', true), serverExercise('remove', 'remove', 3),
    ]
    vi.mocked(plans.getPlan).mockResolvedValue(serverPlan([serverDay(baseline)]))
    const result = await reconcilePlan('p', [weekWithMondayRows([
      boundRow('a-row', 'a', 'a', '101', { serverSortOrder: 0 }),
      boundRow('b-row', 'b', 'b', '102', { serverSortOrder: 1 }),
      boundRow('lock-row', 'lock', 'lock', '90', { hasLogs: true, serverSortOrder: 2 }),
      boundRow('new-1', null, 'new-1', '50', { serverSortOrder: 3 }),
      boundRow('new-2', null, 'new-2', '60'),
    ])])
    const calls = vi.mocked(plans.createExercise).mock.calls.map(([, body]) => [body.exercise_id, body.sort_order])
    expect(calls).toEqual([['a', 0], ['b', 1], ['new-1', 3], ['new-2', 4]])
    expect(result.weeks[0].days[0].rows.map((item) => item.serverSortOrder)).toEqual([0, 1, 2, 3, 4])
  })

  it('puts a pure append after the current maximum sort_order', async () => {
    const baseline = [serverExercise('edit', 'edit', 2), serverExercise('lock', 'lock', 5, '90', true)]
    vi.mocked(plans.getPlan).mockResolvedValue(serverPlan([serverDay(baseline)]))
    await reconcilePlan('p', [weekWithMondayRows([
      boundRow('edit-row', 'edit', 'edit', '100', { serverSortOrder: 2 }),
      boundRow('lock-row', 'lock', 'lock', '90', { hasLogs: true, serverSortOrder: 5 }),
      boundRow('new', null, 'new', '50'),
    ])])
    expect(plans.createExercise).toHaveBeenCalledWith('day1', expect.objectContaining({ exercise_id: 'new', sort_order: 6 }))
  })

  it('keeps a pure append at the tail instead of consuming an unrelated removed slot', async () => {
    const baseline = [
      serverExercise('lock', 'lock', 0, '90', true),
      serverExercise('remove', 'remove', 1),
      serverExercise('keep', 'keep', 2),
    ]
    vi.mocked(plans.getPlan).mockResolvedValue(serverPlan([serverDay(baseline)]))
    await reconcilePlan('p', [weekWithMondayRows([
      boundRow('lock-row', 'lock', 'lock', '90', { hasLogs: true, serverSortOrder: 0 }),
      boundRow('keep-row', 'keep', 'keep', '100', { serverSortOrder: 2 }),
      boundRow('new', null, 'new', '50'),
    ])])
    expect(plans.createExercise).toHaveBeenCalledWith('day1', expect.objectContaining({ exercise_id: 'new', sort_order: 3 }))
  })
})

describe('reconcilePlan — scoped 409 merge', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockBatchEcho()
    vi.mocked(plans.createSet).mockResolvedValue(undefined as never)
    vi.mocked(plans.deleteExercise).mockResolvedValue(undefined as never)
    vi.mocked(plans.createExercise).mockResolvedValue({ id: 'new' } as never)
  })

  it('EXERCISE_HISTORY_IMMUTABLE restores and locks only the named row', async () => {
    const lock = serverExercise('existing-lock', 'lock', 0, '90', true)
    const target = serverExercise('target', 'target', 1, '100')
    const other = serverExercise('other', 'other', 2, '70')
    const freshTarget = { ...target, has_logs: true }
    vi.mocked(plans.getPlan)
      .mockResolvedValueOnce(serverPlan([serverDay([lock, target, other])]))
      .mockResolvedValueOnce(serverPlan([serverDay([lock, freshTarget, other])]))
    vi.mocked(plans.deleteExercise).mockRejectedValueOnce(new ApiException(409, 'EXERCISE_HISTORY_IMMUTABLE', {
      details: { exercise_ids: ['target'] },
    }))
    const weeks = [weekWithMondayRows([
      boundRow('l', 'existing-lock', 'lock', '90', { hasLogs: true, serverSortOrder: 0 }),
      boundRow('t', 'target', 'target', '105', { serverSortOrder: 1 }),
      boundRow('o', 'other', 'other', '75', { serverSortOrder: 2 }),
    ])]

    const error = await reconcilePlan('p', weeks).catch((caught) => caught)
    expect(error).toBeInstanceOf(ReconcileConflict)
    const conflict = error as ReconcileConflict
    const rows = conflict.weeks[0].days[0].rows
    expect(rows.find((item) => item.id === 't')).toMatchObject({ hasLogs: true, boxes: [{ val: '100', empty: false }] })
    expect(rows.find((item) => item.id === 't')?.conflictMessage).toContain('已锁定并还原')
    expect(rows.find((item) => item.id === 'o')?.boxes[0].val).toBe('75')
  })

  it('DAY_HISTORY_IMMUTABLE reclassifies to mixed, restores only newly frozen rows, and resaves by row', async () => {
    const target = serverExercise('target', 'target', 0, '100')
    const other = serverExercise('other', 'other', 1, '70')
    const fresh = serverDay([{ ...target, has_logs: true }, other])
    vi.mocked(plans.getPlan)
      .mockResolvedValueOnce(serverPlan([serverDay([target, other])], 'published'))
      .mockResolvedValueOnce(serverPlan([fresh], 'published'))
      .mockResolvedValueOnce(serverPlan([fresh], 'published'))
    vi.mocked(plans.batchDays).mockRejectedValueOnce(new ApiException(409, 'DAY_HISTORY_IMMUTABLE', {
      details: { day_id: 'day1' },
    }))
    const local = [weekWithMondayRows([
      boundRow('t', 'target', 'target', '105', { serverSortOrder: 0 }),
      boundRow('o', 'other', 'other', '75', { serverSortOrder: 1 }),
    ])]
    const conflict = await reconcilePlan('p', local).catch((caught) => caught) as ReconcileConflict
    expect(conflict.weeks[0].days[0].rows[0]).toMatchObject({ hasLogs: true, boxes: [{ val: '100', empty: false }] })
    expect(conflict.weeks[0].days[0].rows[1].boxes[0].val).toBe('75')

    vi.mocked(plans.deleteExercise).mockResolvedValue(undefined as never)
    await reconcilePlan('p', conflict.weeks)
    expect(plans.batchDays).toHaveBeenCalledTimes(1)
    expect(plans.deleteExercise).toHaveBeenCalledWith('other')
    expect(plans.deleteExercise).not.toHaveBeenCalledWith('target')
  })

  it('DAY_HISTORY_IMMUTABLE scope is strict: named day restored, other newly frozen day keeps local edits', async () => {
    const t1 = serverExercise('t1', 't1-ex', 0, '100')
    const t2 = { ...serverExercise('t2', 't2-ex', 0, '80'), plan_day_id: 'day2' }
    const day2 = { ...serverDay([t2], 'day2'), day_of_week: 2 }
    const freshDay1 = serverDay([{ ...t1, has_logs: true }])
    const freshDay2 = { ...serverDay([{ ...t2, has_logs: true }], 'day2'), day_of_week: 2 }
    vi.mocked(plans.getPlan)
      .mockResolvedValueOnce(serverPlan([serverDay([t1]), day2], 'published'))
      .mockResolvedValueOnce(serverPlan([freshDay1, freshDay2], 'published'))
    vi.mocked(plans.batchDays).mockRejectedValueOnce(new ApiException(409, 'DAY_HISTORY_IMMUTABLE', {
      details: { day_ids: ['day1'] },
    }))
    const week = weekWithMondayRows([boundRow('a', 't1', 't1-ex', '105', { serverSortOrder: 0 })])
    week.days[1] = { ...week.days[1], rest: false, rows: [boundRow('b', 't2', 't2-ex', '85', { serverSortOrder: 0 })] }

    const conflict = await reconcilePlan('p', [week]).catch((caught) => caught) as ReconcileConflict
    expect(conflict).toBeInstanceOf(ReconcileConflict)
    expect(conflict.weeks[0].days[0].rows[0]).toMatchObject({ hasLogs: true, boxes: [{ val: '100', empty: false }] })
    // out-of-scope day: content stays local-wins; lock metadata still refreshes so the
    // next save surfaces a per-row conflict instead of another blind 409
    expect(conflict.weeks[0].days[1].rows[0]).toMatchObject({ hasLogs: true, boxes: [{ val: '85', empty: false }] })
  })

  it('missing 409 details never widens server-wins beyond newly frozen rows', async () => {
    const lock = serverExercise('existing-lock', 'lock', 0, '90', true)
    const target = serverExercise('target', 'target', 1, '100')
    const other = serverExercise('other', 'other', 2, '70')
    vi.mocked(plans.getPlan)
      .mockResolvedValueOnce(serverPlan([serverDay([lock, target, other])]))
      .mockResolvedValueOnce(serverPlan([serverDay([lock, { ...target, has_logs: true }, other])]))
    vi.mocked(plans.deleteExercise).mockRejectedValueOnce(new ApiException(409, 'EXERCISE_HISTORY_IMMUTABLE'))
    const weeks = [weekWithMondayRows([
      boundRow('l', 'existing-lock', 'lock', '90', { hasLogs: true, serverSortOrder: 0 }),
      boundRow('t', 'target', 'target', '105', { serverSortOrder: 1 }),
      boundRow('o', 'other', 'other', '75', { serverSortOrder: 2 }),
    ])]

    const conflict = await reconcilePlan('p', weeks).catch((caught) => caught) as ReconcileConflict
    expect(conflict).toBeInstanceOf(ReconcileConflict)
    const rows = conflict.weeks[0].days[0].rows
    expect(rows.find((item) => item.id === 't')).toMatchObject({ hasLogs: true, boxes: [{ val: '100', empty: false }] })
    expect(rows.find((item) => item.id === 'o')).toMatchObject({ hasLogs: false, boxes: [{ val: '75', empty: false }] })
    expect(rows.find((item) => item.id === 'l')?.conflictMessage).toBeNull()
  })

  it('rebinds a successfully posted new row during 409 merge and locks the named row in the other day', async () => {
    const lock1 = serverExercise('lock1', 'l1', 0, '90', true)
    const lock2 = { ...serverExercise('lock2', 'l2', 0, '80', true), plan_day_id: 'day2' }
    const eOld = { ...serverExercise('e-old', 'e-ex', 1, '70'), plan_day_id: 'day2' }
    const day2 = { ...serverDay([lock2, eOld], 'day2'), day_of_week: 2 }
    const posted = serverExercise('new', 'new-ex', 1, '50')
    const freshDay1 = serverDay([lock1, posted])
    const freshDay2 = { ...serverDay([lock2, { ...eOld, has_logs: true }], 'day2'), day_of_week: 2 }
    vi.mocked(plans.getPlan)
      .mockResolvedValueOnce(serverPlan([serverDay([lock1]), day2], 'published'))
      .mockResolvedValueOnce(serverPlan([freshDay1, freshDay2], 'published'))
    vi.mocked(plans.deleteExercise).mockRejectedValueOnce(new ApiException(409, 'EXERCISE_HISTORY_IMMUTABLE', {
      details: { exercise_ids: ['e-old'] },
    }))
    const week = weekWithMondayRows([
      boundRow('k1', 'lock1', 'l1', '90', { hasLogs: true, serverSortOrder: 0 }),
      boundRow('n', null, 'new-ex', '50'),
    ])
    week.days[1] = { ...week.days[1], rest: false, rows: [
      boundRow('k2', 'lock2', 'l2', '80', { hasLogs: true, serverSortOrder: 0 }),
      boundRow('e', 'e-old', 'e-ex', '78', { serverSortOrder: 1 }),
    ] }

    const conflict = await reconcilePlan('p', [week]).catch((caught) => caught) as ReconcileConflict
    expect(conflict).toBeInstanceOf(ReconcileConflict)
    const day1Rows = conflict.weeks[0].days[0].rows
    expect(day1Rows.find((item) => item.id === 'n')?.serverRowId).toBe('new')
    const day2Rows = conflict.weeks[0].days[1].rows
    expect(day2Rows.find((item) => item.id === 'e')).toMatchObject({ hasLogs: true, boxes: [{ val: '70', empty: false }] })
    expect(day2Rows.find((item) => item.id === 'k2')?.conflictMessage).toBeNull()
  })

  it('PLAN_HISTORY_IMMUTABLE refreshes has_logs but preserves all local row content', async () => {
    const target = serverExercise('target', 'target', 0, '100')
    vi.mocked(plans.getPlan)
      .mockResolvedValueOnce(serverPlan([serverDay([target])], 'published'))
      .mockResolvedValueOnce(serverPlan([serverDay([{ ...target, has_logs: true }])], 'published'))
    vi.mocked(plans.batchDays).mockRejectedValueOnce(new ApiException(409, 'PLAN_HISTORY_IMMUTABLE'))
    const local = [weekWithMondayRows([boundRow('t', 'target', 'target', '105', {
      serverSortOrder: 0, exerciseId: null, name: '本地未绑定改名', ku: false,
    })])]
    const conflict = await reconcilePlan('p', local).catch((caught) => caught) as ReconcileConflict
    expect(conflict.topMessage).toBe('计划已有训练记录,日历不可改')
    expect(conflict.weeks[0].days[0].rows[0]).toMatchObject({
      hasLogs: true, exerciseId: null, name: '本地未绑定改名', boxes: [{ val: '105', empty: false }],
    })
  })
})
