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

  it('keeps the Day 1 weekday selector in the new-plan dialog', () => {
    act(() => root.render(
      <NewPlanDialog open studentName="学员" onClose={() => {}} onCreate={vi.fn()} />,
    ))

    expect(isReloadBlocked()).toBe(true)
    expect(host.textContent).toContain('Day 1 从周几开始')
    expect(host.querySelector<HTMLInputElement>('[aria-label="开始日期"]')).not.toBeNull()
    expect([...host.querySelectorAll<HTMLButtonElement>('button')]
      .filter((button) => ['周一', '周二', '周三', '周四', '周五', '周六', '周日'].includes(button.textContent ?? '')))
      .toHaveLength(7)
  })
})
