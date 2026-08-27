import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CustomExerciseDialog, guessLiftFamily } from './CustomExerciseDialog'
import type { CreateCustomExerciseInput } from '../../../api/exercises'
import type { ExerciseResponse } from '../../../api/types'
import { ExerciseIndex } from '../exerciseIndex'
import { isReloadBlocked } from '../../../reloadSafety'

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

function selectByLabel(host: HTMLElement, text: string): HTMLSelectElement {
  const labels = [...host.querySelectorAll<HTMLLabelElement>('label')]
  const wrap = labels.find((item) => item.querySelector('span')?.textContent === text)
  const select = wrap?.querySelector('select')
  if (!select) throw new Error(`select not found: ${text}`)
  return select
}

function exercise(id: string, name: string): ExerciseResponse {
  return {
    id, name, name_en: null, exercise_type: 'accessory', main_lift_family: null,
    is_competition_lift: false, muscle_groups: ['core'], equipment: ['bodyweight'],
    movement_pattern: ['other'], competition_stance: null, created_by_coach_id: null,
    created_at: '2026-08-01T00:00:00Z',
  }
}

describe('custom exercise dialog 分类', () => {
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
  })

  const render = async (props: Partial<Parameters<typeof CustomExerciseDialog>[0]> = {}) => {
    await act(async () => {
      root.render(
        <CustomExerciseDialog
          open
          initialName="高杆节奏蹲310"
          saving={false}
          error=""
          onClose={vi.fn()}
          onSubmit={vi.fn()}
          {...props}
        />,
      )
    })
  }

  it('defaults to 主项变式 with the guessed family when opened from the main section', async () => {
    await render({ initialTier: 'main' })
    expect(isReloadBlocked()).toBe(true)
    expect(selectByLabel(host, '分类').value).toBe('main_lift_variation')
    expect(selectByLabel(host, '所属主项').value).toBe('squat')
  })

  it('defaults to 辅助项 and hides 所属主项 when opened from the accessory section', async () => {
    await render({ initialTier: 'aux' })
    expect(selectByLabel(host, '分类').value).toBe('accessory')
    expect(() => selectByLabel(host, '所属主项')).toThrow()
  })

  it('submits exerciseType and mainLiftFamily for a variation', async () => {
    const onSubmit = vi.fn<(input: CreateCustomExerciseInput) => void>()
    await render({ initialTier: 'main', onSubmit })
    const form = host.querySelector('form')
    if (!form) throw new Error('form not found')
    await act(async () => {
      form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
    })
    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({
      name: '高杆节奏蹲310',
      nameEn: null,
      exerciseType: 'main_lift_variation',
      mainLiftFamily: 'squat',
    }))
  })

  it('shows any-order library candidates and selects one without submitting create', async () => {
    const onSubmit = vi.fn()
    const onUseExisting = vi.fn()
    await render({
      initialName: '平板侧支撑',
      index: new ExerciseIndex([exercise('side-plank', '侧平板支撑')]),
      onSubmit,
      onUseExisting,
    })

    expect(host.querySelector('.catalog-existing-candidates')?.textContent).toContain('侧平板支撑')
    const useButton = [...host.querySelectorAll<HTMLButtonElement>('.catalog-existing-candidates button')][0]
    act(() => useButton.click())
    expect(onUseExisting).toHaveBeenCalledWith(expect.objectContaining({ id: 'side-plank' }))
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('guesses the lift family from the exercise name', () => {
    expect(guessLiftFamily('节奏无腿卧推530')).toBe('bench')
    expect(guessLiftFamily('停顿硬拉')).toBe('deadlift')
    expect(guessLiftFamily('高杆节奏蹲310')).toBe('squat')
    expect(guessLiftFamily('平板侧支撑')).toBeNull()
  })
})
