import { describe, expect, it } from 'vitest'
import type { ExerciseResponse } from '../../../api/types'
import type { AIExercise } from '../../../api/planImports'
import { ExerciseIndex } from '../exerciseIndex'
import { buildWeeks } from './index'
import { aiWeeksToParsed } from './aiWeeks'
function exercise(
  id: string,
  name: string,
  opts: Partial<ExerciseResponse> = {},
): ExerciseResponse {
  return {
    id,
    name,
    name_en: null,
    exercise_type: 'accessory',
    main_lift_family: null,
    is_competition_lift: false,
    muscle_groups: ['core'],
    equipment: ['bodyweight'],
    movement_pattern: ['other'],
    competition_stance: null,
    created_by_coach_id: null,
    created_at: '2026-01-01T00:00:00Z',
    ...opts,
  }
}

const ai = (name: string, overrides: Partial<AIExercise> = {}): AIExercise => ({ name, sets: 1, reps: '5', intensity_kind: null, source_cells: [], intensity_values: [], weight_values: ['100'], note: '', family_guess: null, flags: [], ...overrides })
const parsed = (exercises: ReturnType<typeof ai>[]) => aiWeeksToParsed([{ index: 0, start_date: '2025-12-29', days: [{ weekday: 0, day_index: 1, rest: false, exercises }] }])
describe('buildWeeks from AI adapter output', () => {
  it.each([
    { kind: 'rir' as const, values: ['2', '3'], weights: [], value: '2', intensityMode: 'per_set' },
    { kind: 'pct' as const, values: ['75', '75'], weights: [], value: '75', intensityMode: 'uniform' },
    { kind: null, values: [], weights: ['100', '100'], value: '', intensityMode: undefined },
    { kind: null, values: [], weights: [], value: '', intensityMode: undefined },
    { kind: 'rpe' as const, values: [], weights: ['100', '100'], value: '', intensityMode: undefined },
    { kind: 'rpe' as const, values: [], weights: [], value: '', intensityMode: undefined },
  ])('preserves the independent $kind prescription with weights $weights', ({ kind, values, weights, value, intensityMode }) => {
    const { weeks } = buildWeeks(parsed([ai('Synthetic lift', {
      sets: 2, intensity_kind: kind, source_cells: [], intensity_values: values, weight_values: weights,
    })]), new ExerciseIndex([]), '2099-01-01')
    const row = weeks[0].days[0].rows[0]
    expect(row.mode).toBe('kg')
    expect(row.aux).toBe(false)
    expect(row.intensity).toEqual(values.length ? { mode: kind, value, high: '' } : null)
    expect(row.intensityMode).toBe(intensityMode)
    expect(row.intensityBoxes).toEqual(values.length ? values.map(val => ({ val, empty: false })) : undefined)
    expect(row.boxes).toEqual(weights.length ? [{ val: '100', empty: false }, { val: '100', empty: false }] : [{ val: '', empty: true }, { val: '', empty: true }])
    expect(row.weightMode).toBe('uniform')
  })
  it('keeps selected empty weeks and binds catalog hits and existing custom exercises', () => {
    const index = new ExerciseIndex([exercise('bench', '竞技卧推', { is_competition_lift: true }), exercise('custom', '自定义动作', { created_by_coach_id: 'coach-1' }), exercise('lowbar', '低杠位深蹲', { main_lift_family: 'squat' })])
    const input = parsed([ai('卧推'), ai('自定义动作', { sets: 0, reps: '—', weight_values: [], note: '4*12' }), ai('不存在'), ai('低杆深蹲')])
    input.push(...aiWeeksToParsed([{ index: 1, start_date: '2026-01-05', days: [] }], new Set([1])))
    const { weeks } = buildWeeks(input, index, '2099-01-01')
    expect(weeks).toHaveLength(2)
    expect(weeks[0].range).toBe('12/29 – 1/4')
    const [bench, custom, missing, lowbar] = weeks[0].days[0].rows
    expect(bench).toMatchObject({ exerciseId: 'bench', name: '竞技卧推', ku: true, custom: false, isMain: true, aux: false })
    expect(custom).toMatchObject({ exerciseId: 'custom', custom: true, aux: true })
    expect(missing).toMatchObject({ exerciseId: null, name: '不存在' })
    expect(lowbar).toMatchObject({ exerciseId: 'lowbar', isMain: true })
    expect(weeks[1].importDoubts).toEqual(['empty_week'])
  })
  it('keeps set-only rows without inventing intensity values', () => {
    const { weeks } = buildWeeks(parsed([ai('Synthetic lift', { sets: 4, reps: '10-12', weight_values: [] })]), new ExerciseIndex([]), '2099-01-01')
    expect(weeks[0].days[0].rows[0]).toMatchObject({ reps: '10-12', aux: false, boxes: Array(4).fill({ val: '', empty: true }) })
  })
  it('preserves composite names instead of splitting AI output into extra exercises', () => {
    const index = new ExerciseIndex([exercise('row', '海豹划船'), exercise('pull', '高位下拉')])
    const { weeks } = buildWeeks(parsed([ai('海豹划船+高位下拉')]), index, '2099-01-01')
    expect(weeks[0].days[0].rows.map(r => r.name)).toEqual(['海豹划船+高位下拉'])
  })
  it('preserves ambiguous choice names for the coach to review', () => {
    const { weeks } = buildWeeks(parsed([ai('二三头自选*2', { flags: ['note_fallback'], note: '原文' })]), new ExerciseIndex([]), '2099-01-01')
    expect(weeks[0].days[0].rows).toHaveLength(1)
    expect(weeks[0].days[0].rows[0]).toMatchObject({ name: '二三头自选*2', note: '原文' })
    expect(weeks[0].days[0].rows[0].importDoubts ?? []).toEqual([])
  })
  it('does not resolve aliases whose canonical exercise is absent', () => {
    const { weeks } = buildWeeks(parsed([ai('低杆深蹲')]), new ExerciseIndex([exercise('other', '杠铃卧推')]), '2099-01-01')
    expect(weeks[0].days[0].rows[0]).toMatchObject({ name: '低杆深蹲', exerciseId: null, ku: false })
  })
  it.each(['长暂停硬拉2s', '暂停硬拉1s'])('preserves the unrecognized original name %s', name => {
    const index = new ExerciseIndex([exercise('pause', '相扑暂停硬拉', { main_lift_family: 'deadlift' })], { deadliftStyle: 'sumo' })
    const { weeks } = buildWeeks(parsed([ai(name)]), index, '2099-01-01')
    expect(weeks[0].days[0].rows[0]).toMatchObject({ name, exerciseId: null, note: '' })
  })
})

it('binds Traditional exercise names from AI output without changing notes', () => {
  const index = new ExerciseIndex([exercise('bench', '竞技卧推'), exercise('deadlift', '相扑硬拉'), exercise('curl', '哑铃二头弯举')])
  for (const [hant, zh] of [['臥推', '卧推'], ['相撲硬舉', '相扑硬拉'], ['二頭彎舉', '二头弯举']]) {
    const create = (name: string) => buildWeeks(parsed([ai(name, { note: '教练原文备注' })]), index, '2026-10-19')
    expect(create(hant)).toEqual(create(zh))
  }
})

it('keeps a Taiwan name specification and percent through AI import and canonical binding', () => {
  const result = buildWeeks(parsed([ai('滑輪下拉（2cm)', {
    sets: 3, reps: '2', intensity_kind: 'rpe', intensity_values: ['8', '8', '8'], weight_values: [],
    note: '80% · 合成备注：慢放 · 合成反饋',
  })]), new ExerciseIndex([exercise('row', '高位下拉')]), '2026-01-05')
  expect(result.weeks[0].days[0].rows[0]).toMatchObject({
    exerciseId: 'row', name: '高位下拉', reps: '2',
    intensity: { mode: 'rpe', value: '8', high: '' },
    note: '80% · 合成备注：慢放 · 合成反饋 · （2cm)',
  })
})

it('preserves custom dimensions for both exact and fallback AI bindings', () => {
  const index = new ExerciseIndex([
    exercise('custom', '合成自建練習', { created_by_coach_id: 'synthetic-coach' }),
    exercise('exact', '合成自建練習（4cm)', { created_by_coach_id: 'synthetic-coach' }),
  ])
  const rows = buildWeeks(parsed([
    ai('合成自建練習（2cm)', { sets: 3, reps: '6', note: '原文' }),
    ai('合成自建練習（4cm)', { sets: 3, reps: '6', note: '原文' }),
  ]), index, '2026-01-05').weeks[0].days[0].rows
  expect(rows[0]).toMatchObject({ exerciseId: 'custom', name: '合成自建練習', note: '原文 · （2cm)' })
  expect(rows[1]).toMatchObject({ exerciseId: 'exact', name: '合成自建練習（4cm)', note: '原文' })
})
