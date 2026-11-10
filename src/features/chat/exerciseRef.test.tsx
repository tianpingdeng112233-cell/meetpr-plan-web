import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { expect, it, vi } from 'vitest'
(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

import fixture from './fixtures/exercise-note.json'
import { ExerciseRefCard, parseExerciseRefMessage } from './exerciseRef'

it('renders the dated exercise and untouched note, with hover/leave and click callbacks', () => {
  const parsed = parseExerciseRefMessage({ kind: 'text', ...fixture })!
  expect(parsed.note).toBe('最后一组有点晃\n需要减重量吗？')
  const host = document.createElement('div'); document.body.append(host)
  const root = createRoot(host), hover = vi.fn(), open = vi.fn()
  try {
    act(() => root.render(<ExerciseRefCard parsed={parsed} onHover={hover} onOpen={open} />))
    expect(host.querySelector('small')?.textContent).toBe('11/10 · 暂停卧推')
    expect(host.querySelector('p')?.textContent).toBe(parsed.note)
    const card = host.querySelector('button')!
    act(() => card.dispatchEvent(new MouseEvent('mouseover', { bubbles: true })))
    expect(hover).toHaveBeenLastCalledWith(parsed.exerciseRef)
    act(() => card.dispatchEvent(new MouseEvent('mouseout', { bubbles: true })))
    expect(hover).toHaveBeenLastCalledWith(null)
    act(() => card.click())
    expect(open).toHaveBeenCalledWith(parsed.exerciseRef)
    act(() => root.render(<ExerciseRefCard parsed={parsed} unavailable onOpen={open} />))
    expect(host.textContent).toContain('原动作已不在计划中')
  } finally { act(() => root.unmount()); host.remove() }
})

it('falls back to plain text for unknown refs without stripping the student text', () => {
  expect(parseExerciseRefMessage({ kind: 'text', ...fixture, exercise_ref: { v: 2 } })).toBeNull()
  expect(parseExerciseRefMessage({ kind: 'text', ...fixture, body: '普通原文' })?.note).toBe('普通原文')
})
