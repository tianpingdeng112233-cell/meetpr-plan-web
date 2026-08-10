import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ExerciseResponse } from '../../api/types'
import { ExerciseIndex } from './exerciseIndex'
import { PlanEditor } from './PlanEditor'
import type { DayCol, ExerciseRow, Week } from './types'

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

function exercise(id: string, name: string): ExerciseResponse {
  return {
    id, name, name_en: null, exercise_type: 'accessory', main_lift_family: null,
    is_competition_lift: false, muscle_groups: ['core'], equipment: ['bodyweight'],
    movement_pattern: ['other'], competition_stance: null, created_by_coach_id: null,
    created_at: '2026-01-01T00:00:00Z',
  }
}

function emptyRow(): ExerciseRow {
  return {
    id: 'row', serverRowId: null, serverSortOrder: null, hasLogs: false, conflictMessage: null,
    exerciseId: null, name: '', ku: false, custom: false, isMain: false,
    aux: false, reps: '5', mode: 'kg', boxes: [{ val: '', empty: true }], note: '',
  }
}

function week(): Week {
  return {
    num: 1, num2: '01', range: '', isCurrent: false, vol: '',
    days: Array.from({ length: 7 }, (_, dow): DayCol => ({
      dow, dowLabel: `周${dow + 1}`, dateLabel: '', rest: dow !== 0,
      rows: dow === 0 ? [emptyRow()] : [],
    })),
  }
}

function setInput(input: HTMLInputElement, value: string): void {
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(input, value)
  input.dispatchEvent(new Event('input', { bubbles: true }))
}

describe('PlanEditor exercise picker keyboard binding', () => {
  let host: HTMLDivElement
  let root: Root

  beforeEach(() => {
    host = document.createElement('div')
    document.body.appendChild(host)
    root = createRoot(host)
  })

  afterEach(() => {
    act(() => root.unmount())
    host.remove()
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('moves the controlled highlight and binds the highlighted hit with Enter', () => {
    const index = new ExerciseIndex([
      exercise('press-1', '测试推举一'),
      exercise('press-2', '测试推举二'),
    ])
    act(() => root.render(
      <PlanEditor initialWeeks={[week()]} weeksCount={1} studentName="学员" planName="计划" exerciseIndex={index}/>,
    ))
    const input = host.querySelector<HTMLInputElement>('[data-c="name"] input')!
    act(() => { input.focus(); setInput(input, '测试推举') })
    expect(host.querySelector('[role="option"][data-active="true"]')?.textContent).toContain('测试推举一')

    act(() => input.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true })))
    expect(host.querySelector('[role="option"][data-active="true"]')?.textContent).toContain('测试推举二')
    act(() => input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true })))

    expect(input.value).toBe('测试推举二')
    expect(host.querySelector('[data-popover]')).toBeNull()
    expect(host.querySelector('[data-rowid="row"]')?.textContent).toContain('✓')
    expect(index.search('测试推举')[0].id).toBe('press-2')
  })

  it('does not use Enter to bind an exercise while an IME composition is active', () => {
    const index = new ExerciseIndex([exercise('press-1', '测试推举一')])
    act(() => root.render(
      <PlanEditor initialWeeks={[week()]} weeksCount={1} studentName="学员" planName="计划" exerciseIndex={index}/>,
    ))
    const input = host.querySelector<HTMLInputElement>('[data-c="name"] input')!
    act(() => { input.focus(); setInput(input, '测试推举') })
    expect(host.querySelector('[role="option"][data-active="true"]')).not.toBeNull()

    act(() => {
      input.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }))
      input.dispatchEvent(new KeyboardEvent('keydown', {
        key: 'Enter',
        bubbles: true,
        cancelable: true,
        isComposing: true,
      }))
    })

    expect(input.value).toBe('测试推举')
    expect(host.querySelector('[data-popover]')).not.toBeNull()
    expect(host.querySelector('[data-rowid="row"]')?.textContent).not.toContain('✓')
    act(() => input.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true })))
  })

  it('uses exact alias resolution on blur before hiding the popover', async () => {
    vi.useFakeTimers()
    const index = new ExerciseIndex([exercise('squat', '低杠位深蹲')])
    act(() => root.render(
      <PlanEditor initialWeeks={[week()]} weeksCount={1} studentName="学员" planName="计划" exerciseIndex={index}/>,
    ))
    const input = host.querySelector<HTMLInputElement>('[data-c="name"] input')!
    act(() => { input.focus(); setInput(input, '低杆深蹲'); input.blur() })
    expect(input.value).toBe('低杆深蹲')

    await act(async () => { await vi.advanceTimersByTimeAsync(160) })
    expect(input.value).toBe('低杠位深蹲')
    expect(host.querySelector('[data-rowid="row"]')?.textContent).toContain('✓')
    expect(host.querySelector('[data-popover]')).toBeNull()
  })

  it('never auto-binds fuzzy-only matches on blur', async () => {
    vi.useFakeTimers()
    const index = new ExerciseIndex([exercise('curl', '哑铃二头弯举')])
    act(() => root.render(
      <PlanEditor initialWeeks={[week()]} weeksCount={1} studentName="学员" planName="计划" exerciseIndex={index}/>,
    ))
    const input = host.querySelector<HTMLInputElement>('[data-c="name"] input')!
    act(() => { input.focus(); setInput(input, '二头弯举加停顿'); input.blur() })

    await act(async () => { await vi.advanceTimersByTimeAsync(160) })
    expect(input.value).toBe('二头弯举加停顿')
    expect(host.querySelector('[data-rowid="row"]')?.textContent).not.toContain('✓')
    expect(host.querySelector('[data-popover]')).toBeNull()
  })

  it('cancels the pending blur auto-bind when the same row resumes editing', async () => {
    vi.useFakeTimers()
    const index = new ExerciseIndex([exercise('squat', '低杠位深蹲')])
    act(() => root.render(
      <PlanEditor initialWeeks={[week()]} weeksCount={1} studentName="学员" planName="计划" exerciseIndex={index}/>,
    ))
    const input = host.querySelector<HTMLInputElement>('[data-c="name"] input')!
    act(() => { input.focus(); setInput(input, '低杆深蹲'); input.blur() })
    await act(async () => { await vi.advanceTimersByTimeAsync(80) })
    act(() => { input.focus() })

    await act(async () => { await vi.advanceTimersByTimeAsync(400) })
    expect(input.value).toBe('低杆深蹲')
    expect(host.querySelector('[data-rowid="row"]')?.textContent).not.toContain('✓')
    expect(host.querySelector('[data-popover]')).not.toBeNull()
  })

  it('bumps usage only when a created exercise binds into a plan row', async () => {
    const index = new ExerciseIndex([])
    const bumpSpy = vi.spyOn(index, 'bump')
    const onCreateExercise = vi.fn(async () => ({ id: 'custom-1', name: '自定义动作' }))
    act(() => root.render(
      <PlanEditor initialWeeks={[week()]} weeksCount={1} studentName="学员" planName="计划"
        exerciseIndex={index} onCreateExercise={onCreateExercise}/>,
    ))
    const submitDialog = async () => {
      const nameInput = Array.from(host.querySelectorAll<HTMLInputElement>('form input'))
        .find((el) => el.placeholder.includes('平板侧支撑'))!
      const form = nameInput.closest('form')!
      await act(async () => { form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })) })
    }

    // Toolbar「＋ 动作」only adds to the catalog — must not count as usage.
    const toolbarBtn = Array.from(host.querySelectorAll('button')).find((b) => b.textContent?.trim() === '＋ 动作')!
    act(() => toolbarBtn.click())
    const dialogInput = Array.from(host.querySelectorAll<HTMLInputElement>('form input'))
      .find((el) => el.placeholder.includes('平板侧支撑'))!
    act(() => setInput(dialogInput, '自定义动作'))
    await submitDialog()
    expect(onCreateExercise).toHaveBeenCalledTimes(1)
    expect(bumpSpy).not.toHaveBeenCalled()

    // Creating through the picker binds the row — this one counts.
    const rowInput = host.querySelector<HTMLInputElement>('[data-c="name"] input')!
    act(() => { rowInput.focus(); setInput(rowInput, '自定义动作二') })
    act(() => rowInput.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true })))
    await submitDialog()
    expect(onCreateExercise).toHaveBeenCalledTimes(2)
    expect(bumpSpy).toHaveBeenCalledTimes(1)
    expect(bumpSpy).toHaveBeenCalledWith('custom-1')
  })
})
