import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { TopBar } from './TopBar'

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

function buttonByText(host: HTMLElement, text: string): HTMLButtonElement {
  const button = [...host.querySelectorAll<HTMLButtonElement>('button')]
    .find((item) => item.textContent?.trim() === text)
  if (!button) throw new Error(`button not found: ${text}`)
  return button
}

describe('plan editor context bar', () => {
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

  it('renders every context control in one horizontally scrollable 38px row', async () => {
    await act(async () => {
      root.render(
        <TopBar
          studentName="王学员"
          planName="力量计划"
          published={false}
          statusText="草稿 · 已自动保存"
          onPublish={vi.fn()}
          onBackToBoard={vi.fn()}
          students={[{ id: 'student-1', label: '王学员' }]}
          currentStudentId="student-1"
          onSwitchStudent={vi.fn()}
          plans={[{ id: 'plan-1', label: '力量计划' }]}
          currentPlanId="plan-1"
          onSwitchPlan={vi.fn()}
          totalShiftDays={3}
          onNewExercise={vi.fn()}
          onImport={vi.fn()}
          planStartDate="2026-07-27"
          onChangeStartDate={vi.fn(async () => undefined)}
          issueCount={2}
          onJumpIssue={vi.fn()}
          onSave={vi.fn()}
        />,
      )
    })

    const bar = host.querySelector<HTMLElement>('[data-plan-context-bar]')!
    expect(bar.classList.contains('plan-context-bar')).toBe(true)
    expect(bar.style.height).toBe('38px')
    expect(bar.style.whiteSpace).toBe('nowrap')
    expect(bar.style.flexWrap).toBe('nowrap')
    expect(bar.style.overflowX).toBe('auto')
    expect(bar.querySelector('br')).toBeNull()
    expect(bar.textContent).not.toContain('MeetPR')
    expect(bar.textContent).not.toContain('COACH / 计划编排')

    const labels = ['← 总览', '王学员', '力量计划', '学员已整体顺延 3 天', '＋ 动作', '导入 .xlsx', '起始 07-27', '2 处待核对', '保存草稿', '发布给学员', '已自动保存']
    let previous = -1
    for (const label of labels) {
      const position = bar.textContent!.indexOf(label)
      expect(position, `missing or out-of-order label: ${label}; bar text: ${bar.textContent}`).toBeGreaterThan(previous)
      previous = position
    }
  })

  it('preserves save, publish, and published-state button behavior', async () => {
    const onSave = vi.fn()
    const onPublish = vi.fn()
    await act(async () => {
      root.render(
        <TopBar
          studentName="王学员"
          planName="力量计划"
          published={false}
          statusText="草稿"
          onPublish={onPublish}
          onSave={onSave}
        />,
      )
    })

    await act(async () => { buttonByText(host, '保存草稿').click() })
    await act(async () => { buttonByText(host, '发布给学员').click() })
    expect(onSave).toHaveBeenCalledTimes(1)
    expect(onPublish).toHaveBeenCalledTimes(1)

    await act(async () => {
      root.render(
        <TopBar
          studentName="王学员"
          planName="力量计划"
          published
          statusText="已自动保存"
          onPublish={onPublish}
          onSave={onSave}
        />,
      )
    })
    await act(async () => { buttonByText(host, '更新计划').click() })
    expect(onSave).toHaveBeenCalledTimes(2)
    expect(buttonByText(host, '已发布 · 不可撤回').disabled).toBe(true)
    expect(host.querySelector('.plan-published-badge')?.textContent).toBe('已发布')
  })
})
