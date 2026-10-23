import { expect, it } from 'vitest'
import { aiWeeksToParsed } from './aiWeeks'
import { buildWeeks } from './index'
import { ExerciseIndex } from '../exerciseIndex'

it('keeps RPE and target weight as independent per-set tracks', () => {
  const parsed = aiWeeksToParsed([{ index: 0, start_date: '2026-10-19', days: [{ weekday: 0, rest: false, exercises: [{
    name: 'Synthetic lift', sets: 2, reps: '5', intensity_kind: 'rpe',
    intensity_values: ['6', '6'], weight_values: ['227.5', '227.5'],
    note: '', family_guess: null, flags: [],
  }] }] }])
  const row = buildWeeks(parsed, new ExerciseIndex([]), '2026-10-19').weeks[0].days[0].rows[0]
  expect(row).toMatchObject({
    mode: 'kg', aux: false,
    intensity: { mode: 'rpe', value: '6', high: '' }, intensityMode: 'uniform',
    intensityBoxes: [{ val: '6', empty: false }, { val: '6', empty: false }],
    weightMode: 'uniform', boxes: [{ val: '227.5', empty: false }, { val: '227.5', empty: false }],
  })
})

it('adapts AI weeks, preserving blank weeks, original names, RPE and only inferred/empty-week doubts', () => {
  const parsed = aiWeeksToParsed([
    { index: 4, start_date: '2026-10-19', days: [{ weekday: 2, rest: false, exercises: [{ name: 'Synthetic lift', sets: 2, reps: '8+', intensity_kind: 'rpe', intensity_values: ['7', '8'], weight_values: [], note: 'tempo', family_guess: 'squat', flags: ['note_fallback', 'inferred'] }] }] },
    { index: 5, start_date: null, days: [] },
  ], new Set([5]))
  const built = buildWeeks(parsed, new ExerciseIndex([]), '2099-01-01')
  expect(built.startDate).toBe('2026-10-19')
  expect(built.weeks).toHaveLength(2)
  const row = built.weeks[0].days[2].rows[0]
  expect(row).toMatchObject({ name: 'Synthetic lift', reps: '8+', intensityBoxes: [{ val: '7', empty: false }, { val: '8', empty: false }], importDoubts: ['inferred'] })
  expect(built.weeks[1].importDoubts).toEqual(['empty_week'])
})

it('does not mark undated weeks or note-only rows as import doubts', () => {
  const weeks = buildWeeks(aiWeeksToParsed([{ index: 0, start_date: null, days: [{ weekday: 0, rest: false, exercises: [{ name: 'Synthetic', sets: 1, reps: '5', intensity_kind: null, intensity_values: [], weight_values: ['10'], note: 'tempo', family_guess: null, flags: ['note_fallback'] }] }] }]), new ExerciseIndex([]), '2026-10-19').weeks
  expect(weeks[0].days[0].rows[0].importDoubts ?? []).toEqual([])
  expect(weeks[0].importDoubts ?? []).toEqual([])
})
