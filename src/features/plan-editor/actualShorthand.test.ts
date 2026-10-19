import { expect, it } from 'vitest'
import type { ActualSet } from './actuals'
import { actualShorthand } from './actualShorthand'
const set = (index: number, reps: number, weight: string, rpe: string | null): ActualSet => ({ set_index: index, reps, weight_kg: weight, rpe, coach_rpe: '9', completed: true, failed: false })
it('uses recorded sets including extra and failed sets, slash values and missing athlete RPE without coach substitution', () => {
  const sets = [set(2, 2, '125.00', null), set(0, 3, '120.00', '8'), { ...set(1, 1, '122.50', '8.5'), completed: false, failed: true }]
  expect(actualShorthand({ mode: 'kg' }, sets)).toBe('3×3/1/2 @8/8.5/— · 120/122.5/125')
  expect(actualShorthand(null, [set(0, 12, '45', null), set(1, 10, '45', null)])).toBe('2×12/10 · 45')
  expect(actualShorthand({ mode: 'bodyweight' }, [set(0, 8, '0', '7')])).toBe('1×8 @7 · 自重')
  expect(actualShorthand(null, [])).toBe('—')
})
it('shows the recorded load when the athlete adds weight to a bodyweight prescription', () => {
  expect(actualShorthand({ mode: 'bodyweight' }, [set(0, 8, '15', '7')])).toBe('1×8 @7 · 15')
})

it('013 repair 1 omits wholly absent RPE and weight segments but preserves partial gaps', () => {
  expect(actualShorthand({ mode: 'kg' }, [0, 1, 2].map(i => set(i, 10, '140', null)))).toBe('3×10 · 140')
  expect(actualShorthand(null, [8, 8, 7, 6].map((reps, i) => set(i, reps, '', null)))).toBe('4×8/8/7/6')
  expect(actualShorthand(null, ['8', null, '9'].map((rpe, i) => set(i, 3, '120', rpe)))).toBe('3×3 @8/—/9 · 120')
  expect(actualShorthand(null, ['', '120', ''].map((weight, i) => set(i, 3, weight, null)))).toBe('3×3 · —/120/—')
  expect(actualShorthand(null, [set(0, 8, '', '7')])).toBe('1×8 @7')
  expect(actualShorthand({ mode: 'bodyweight' }, [set(0, 8, '0', null)])).toBe('1×8 · 自重')
})
