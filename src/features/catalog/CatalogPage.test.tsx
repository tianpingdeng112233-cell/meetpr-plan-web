import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ExerciseResponse } from '../../api/types'
import { installLocalStorageMock } from '../../test/localStorageMock'
import { ExerciseIndex } from '../plan-editor/exerciseIndex'
import type { Catalog } from '../plan-editor/mapping'
import { CatalogPage } from './CatalogPage'

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

function exercise(id: string, partial: Partial<ExerciseResponse>): ExerciseResponse {
  return {
    id,
    name: id,
    name_en: null,
    exercise_type: 'accessory',
    main_lift_family: null,
    is_competition_lift: false,
    muscle_groups: ['core'],
    equipment: ['bodyweight'],
    movement_pattern: ['other'],
    competition_stance: null,
    created_by_coach_id: null,
    created_at: '2026-07-13T00:00:00.000Z',
    ...partial,
  }
}

const exercises = [
  exercise('squat', { name: '竞技深蹲', exercise_type: 'main_lift', main_lift_family: 'squat', is_competition_lift: true, muscle_groups: ['quad'], equipment: ['barbell'], movement_pattern: ['squat'] }),
  exercise('pause-squat', { name: '暂停深蹲', exercise_type: 'main_lift_variation', main_lift_family: 'squat', muscle_groups: ['quad'], equipment: ['barbell'], movement_pattern: ['squat'] }),
  exercise('bench', { name: '竞技卧推', name_en: 'Competition Bench Press', exercise_type: 'main_lift', main_lift_family: 'bench', is_competition_lift: true, muscle_groups: ['chest', 'triceps'], equipment: ['barbell'], movement_pattern: ['horizontal_push'] }),
  exercise('split-squat', { name: '保加利亚分腿蹲', muscle_groups: ['quad', 'glute'], equipment: ['dumbbell'], movement_pattern: ['squat'] }),
  exercise('custom', { name: '史密斯箭步蹲', muscle_groups: ['quad', 'glute'], equipment: ['machine'], movement_pattern: ['squat'], created_by_coach_id: 'coach-1' }),
]

function clickButton(host: HTMLElement, text: string) {
  const button = [...host.querySelectorAll('button')].find((item) => item.textContent?.includes(text))
  if (!button) throw new Error(`button not found: ${text}`)
  act(() => button.dispatchEvent(new MouseEvent('click', { bubbles: true })))
  return button
}

function setInput(input: HTMLInputElement, value: string) {
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(input, value)
  act(() => input.dispatchEvent(new Event('input', { bubbles: true })))
}

function setSelect(select: HTMLSelectElement, value: string) {
  Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')?.set?.call(select, value)
  act(() => select.dispatchEvent(new Event('change', { bubbles: true })))
}

describe('CatalogPage', () => {
  let host: HTMLDivElement
  let root: Root
  let catalog: Catalog

  beforeEach(() => {
    installLocalStorageMock()
    window.localStorage.removeItem('meetpr:sidebar:catalog')
    host = document.createElement('div')
    document.body.appendChild(host)
    root = createRoot(host)
    catalog = new Map(exercises.map((item) => [item.id, { name: item.name, custom: item.created_by_coach_id != null }]))
  })

  afterEach(() => {
    act(() => root.unmount())
    host.remove()
    vi.restoreAllMocks()
  })

  it('collapses the category tree and restores the saved state', () => {
    const renderPage = () => root.render(<CatalogPage
      exerciseList={exercises}
      catalog={catalog}
      index={new ExerciseIndex(exercises)}
      onCreateExercise={vi.fn().mockResolvedValue({ id: 'unused', name: 'unused' })}
      onUseExercise={vi.fn()}
    />)
    act(renderPage)
    const toggle = host.querySelector<HTMLButtonElement>('[aria-label="收起动作分类"]')!

    act(() => toggle.click())
    expect(host.querySelector('.catalog-categories')?.classList.contains('collapsed')).toBe(true)
    expect(toggle.getAttribute('aria-expanded')).toBe('false')
    expect(window.localStorage.getItem('meetpr:sidebar:catalog')).toBe('true')

    act(() => root.unmount())
    root = createRoot(host)
    act(renderPage)
    expect(host.querySelector('.catalog-categories')?.classList.contains('collapsed')).toBe(true)
    expect(host.querySelector('[aria-label="展开动作分类"]')).not.toBeNull()
  })

  it('combines category, type tab, and equipment filters with coherent live counts', () => {
    act(() => root.render(<CatalogPage
      exerciseList={exercises}
      catalog={catalog}
      index={new ExerciseIndex(exercises)}
      onCreateExercise={vi.fn().mockResolvedValue({ id: 'unused', name: 'unused' })}
      onUseExercise={vi.fn()}
    />))

    expect(host.querySelector('.catalog-result-count')?.textContent).toBe('5 个动作')
    clickButton(host, '股四头')
    clickButton(host, '辅助')
    setSelect(host.querySelector<HTMLSelectElement>('[aria-label="按器械筛选"]')!, 'dumbbell')

    const tableText = host.querySelector('.catalog-table-wrap')?.textContent
    expect(tableText).toContain('保加利亚分腿蹲')
    expect(tableText).not.toContain('史密斯箭步蹲')
    expect(host.querySelector('.catalog-result-count')?.textContent).toBe('1 个动作')
    expect(host.querySelector('.catalog-category.active')?.textContent).toBe('股四头1')
    expect(host.querySelector('.catalog-refine button.active')?.textContent).toBe('辅助1')
    expect([...host.querySelectorAll('.catalog-category')].find((button) => button.textContent?.startsWith('全部动作'))?.textContent).toBe('全部动作1')
  })

  it('keeps full-library search piercing the selected category', () => {
    act(() => root.render(<CatalogPage
      exerciseList={exercises}
      catalog={catalog}
      index={new ExerciseIndex(exercises)}
      onCreateExercise={vi.fn().mockResolvedValue({ id: 'unused', name: 'unused' })}
      onUseExercise={vi.fn()}
    />))

    clickButton(host, '股四头')
    setInput(host.querySelector<HTMLInputElement>('[aria-label="搜索动作库"]')!, '卧推')
    expect(host.querySelector('.catalog-table')?.textContent).toContain('竞技卧推')
    expect(host.querySelector('.catalog-table')?.textContent).not.toContain('保加利亚分腿蹲')
    expect(host.querySelector('.catalog-result-count')?.textContent).toBe('1 个动作')
  })

  it('keeps custom edit/delete disabled and submits guessed multi-field create input', async () => {
    const onCreateExercise = vi.fn().mockResolvedValue({ id: 'created', name: '绳索划船' })
    act(() => root.render(<CatalogPage
      exerciseList={exercises}
      catalog={catalog}
      index={new ExerciseIndex(exercises)}
      onCreateExercise={onCreateExercise}
      onUseExercise={vi.fn()}
    />))

    const customRow = [...host.querySelectorAll<HTMLTableRowElement>('.catalog-row')]
      .find((row) => row.textContent?.includes('史密斯箭步蹲'))
    act(() => customRow?.dispatchEvent(new MouseEvent('click', { bubbles: true })))
    const unsupported = [...host.querySelectorAll<HTMLButtonElement>('.catalog-disabled-action')]
    expect(unsupported).toHaveLength(2)
    expect(unsupported.every((button) => button.disabled && button.textContent?.includes('暂不支持'))).toBe(true)

    act(() => host.querySelector<HTMLButtonElement>('[aria-label="关闭详情"]')?.dispatchEvent(new MouseEvent('click', { bubbles: true })))
    clickButton(host, '新建动作')
    setInput(host.querySelector<HTMLInputElement>('.catalog-create-form input')!, '绳索划船')
    expect([...host.querySelectorAll('.catalog-choice.active')].map((item) => item.textContent)).toEqual(expect.arrayContaining(['背', '绳索', '水平拉']))
    await act(async () => {
      host.querySelector<HTMLFormElement>('.catalog-create-form')?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
      await Promise.resolve()
    })
    expect(onCreateExercise).toHaveBeenCalledWith({
      name: '绳索划船',
      muscleGroups: ['back'],
      equipmentList: ['cable'],
      movementPattern: 'horizontal_pull',
    })
  })
})
