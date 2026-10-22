import { expect, it } from 'vitest'
import { aiWeeksToParsed } from './aiWeeks'
import { buildWeeks } from './index'
import { ExerciseIndex } from '../exerciseIndex'

it('adapts AI weeks, preserving blank weeks, original names, RPE and all import doubts', () => {
  const parsed = aiWeeksToParsed([
    { index: 4, start_date: '2026-10-19', days: [{ weekday: 2, rest: false, exercises: [{ name: 'Synthetic lift', sets: 2, reps: '8+', mode: 'rpe', values: ['7', '8'], note: 'tempo', family_guess: 'squat', flags: ['note_fallback', 'inferred'] }] }] },
    { index: 5, start_date: null, days: [] },
  ], new Set(['Synthetic lift']), new Set([5]))
  const built = buildWeeks(parsed, new ExerciseIndex([]), '2099-01-01')
  expect(built.startDate).toBe('2026-10-19')
  expect(built.weeks).toHaveLength(2)
  const row = built.weeks[0].days[2].rows[0]
  expect(row).toMatchObject({ name: 'Synthetic lift', reps: '8+', intensityBoxes: [{ val: '7', empty: false }, { val: '8', empty: false }], importDoubts: ['new_exercise', 'note_fallback', 'inferred'] })
  expect(built.weeks[1].importDoubts).toEqual(['no_date', 'empty_week'])
})

it('clears no-date doubts throughout a week when a date is set, retaining other doubts', async () => {
  const { clearDateDoubts } = await import('./doubts')
  const weeks = buildWeeks(aiWeeksToParsed([{ index: 0, start_date: null, days: [{ weekday: 0, rest: false, exercises: [{ name: 'Synthetic', sets: 1, reps: '5', mode: 'kg', values: ['10'], note: '', family_guess: null, flags: ['inferred'] }] }] }]), new ExerciseIndex([]), '2026-10-19').weeks
  expect(weeks[0].days[0].rows[0].importDoubts).toEqual(['inferred','no_date'])
  const dated = clearDateDoubts(weeks)
  expect(dated[0].days[0].rows[0].importDoubts).toEqual(['inferred'])
  expect(dated[0].importDoubts).toEqual([])
})
