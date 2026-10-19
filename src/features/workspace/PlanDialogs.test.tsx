import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CompletePlanDialog, NewPlanDialog } from './PlanDialogs'
import { isReloadBlocked } from '../../reloadSafety'

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

describe('PlanDialogs', () => {
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
  })

  it('requires an explicit irreversible completion confirmation', () => {
    const onComplete = vi.fn()
    act(() => root.render(
      <CompletePlanDialog open name="力量周期" weeks={12} completing={false} error=""
        onClose={() => {}} onComplete={onComplete} />,
    ))

    expect(host.textContent).toContain('将计划标记为完成？')
    expect(host.textContent).toContain('力量周期 · 12 周')
    expect(host.textContent).toContain('学员端将不再显示该计划，此操作不可撤销')
    const confirm = [...host.querySelectorAll('button')].find((button) => button.textContent === '标记完成')
    expect(confirm?.style.background).toBe('var(--green)')
    act(() => confirm?.dispatchEvent(new MouseEvent('click', { bubbles: true })))
    expect(onComplete).toHaveBeenCalledOnce()
  })

  it('creates a four-week block with explicit training weekdays, D1 and a matching first date', async () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date(2026, 9, 19, 12))
    const onCreate = vi.fn().mockResolvedValue(undefined)
    act(() => root.render(<NewPlanDialog open studentName="学员" onClose={() => {}} onCreate={onCreate} />))
    expect(isReloadBlocked()).toBe(true)
    const date = host.querySelector<HTMLInputElement>('input[type="date"]')!
    expect(date.value).toBe('2026-10-19')
    const click = (el: Element) => act(() => { el.dispatchEvent(new MouseEvent('click', { bubbles: true })) })
    for (const day of [0, 1, 2, 3, 4, 5, 6]) {
      const el = host.querySelector(`[data-training-weekday="${day}"]`)!
      const wanted = [1, 3, 4, 6].includes(day)
      if ((el.getAttribute('aria-pressed') === 'true') !== wanted) click(el)
    }
    click(host.querySelector('[data-d1="6"]')!)
    expect(date.value).toBe('2026-10-25')
    expect(host.querySelector('[data-training-weekday="6"]')?.textContent).toContain('D1')
    expect(host.querySelector('[data-training-weekday="1"]')?.textContent).toContain('D2')
    await act(async () => host.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })))
    expect(onCreate).toHaveBeenCalledWith('新计划', 4, '2026-10-25', 7, [6, 1, 3, 4])
    vi.useRealTimers()
  })
})
