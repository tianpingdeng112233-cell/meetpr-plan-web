import { expect, it } from 'vitest'
import { aiWeeksToParsed, placeAIWeekdays } from './aiWeeks'
import { buildWeeks } from './index'
import { ExerciseIndex } from '../exerciseIndex'

it('keeps RPE and target weight as independent per-set tracks', () => {
  const parsed = aiWeeksToParsed([{ index: 0, start_date: '2026-10-19', days: [{ weekday: 0, day_index: 1, rest: false, exercises: [{
    name: 'Synthetic lift', sets: 2, reps: '5', intensity_kind: 'rpe',
    source_cells: [], intensity_values: ['6', '6'], weight_values: ['227.5', '227.5'],
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
    { index: 4, start_date: '2026-10-19', days: [{ weekday: 2, day_index: 1, rest: false, exercises: [{ name: 'Synthetic lift', sets: 2, reps: '8+', intensity_kind: 'rpe', source_cells: [], intensity_values: ['7', '8'], weight_values: [], note: 'tempo', family_guess: 'squat', flags: ['note_fallback', 'inferred'] }] }] },
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
  const weeks = buildWeeks(aiWeeksToParsed([{ index: 0, start_date: null, days: [{ weekday: 0, day_index: 1, rest: false, exercises: [{ name: 'Synthetic', sets: 1, reps: '5', intensity_kind: null, source_cells: [], intensity_values: [], weight_values: ['10'], note: 'tempo', family_guess: null, flags: ['note_fallback'] }] }] }]), new ExerciseIndex([]), '2026-10-19').weeks
  expect(weeks[0].days[0].rows[0].importDoubts ?? []).toEqual([])
  expect(weeks[0].importDoubts ?? []).toEqual([])
})


it('places four Day-indexed training days on Mon/Wed/Fri/Sat in day_index order', () => {
  const weeks = [{ index: 0, start_date: null, days: [3, 1, 4, 2].map(day_index => ({
    weekday: null, day_index, rest: false, exercises: [{
      name: `Lift ${day_index}`, sets: 1, reps: '5', intensity_kind: null,
      source_cells: [], intensity_values: [], weight_values: ['100'], note: '', family_guess: null, flags: [],
    }],
  })) }]
  const placed = placeAIWeekdays(weeks, [0, 2, 4, 5], 0)
  expect(aiWeeksToParsed(placed)[0].days.map(day => [day.dayOfWeek, day.exercises[0].rawName])).toEqual([
    [0, 'Lift 1'], [2, 'Lift 2'], [4, 'Lift 3'], [5, 'Lift 4'],
  ])
  expect(weeks[0].days.map(day => day.weekday)).toEqual([null, null, null, null])
})

it('rotates a custom four-day choice from D1, ignores rest slots and preserves known weekdays', () => {
  const known = { index: 1, start_date: '2026-10-19', days: [{ weekday: 4, day_index: 1, rest: false, exercises: [] }] }
  const placed = placeAIWeekdays([
    { index: 0, start_date: null, days: [4, 2, 1, 3].map(day_index => ({ weekday: null, day_index, rest: false, exercises: [] })).concat([{ weekday: null, day_index: 5, rest: true, exercises: [] }]) },
    known,
  ], [0, 1, 3, 6], 3)
  expect(placed[0].days.map(day => [day.day_index, day.weekday])).toEqual([[1, 3], [2, 6], [3, 0], [4, 1]])
  expect(placed[1]).toEqual(known)
  expect(() => placeAIWeekdays([placed[0], { index: 2, start_date: null, days: [{ weekday: null, day_index: 1, rest: false, exercises: [] }] }], [0, 2], 0)).toThrow('IMPORT_WEEKDAY_COUNT')
})
