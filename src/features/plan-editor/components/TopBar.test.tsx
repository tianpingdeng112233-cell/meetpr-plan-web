import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { TopBar } from './TopBar'
import { setLocale } from '../../../i18n/locale'

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
    setLocale('zh')
  })

  it.each(['zh', 'en'] as const)('marks the whole current plan row and offers the new-plan action in %s', async locale => {
    setLocale(locale)
    const onNewPlan = vi.fn()
    await act(async () => root.render(<TopBar studentName="Synthetic" planName="Current" published={false}
      statusText="" onPublish={vi.fn()} currentPlanId="current" onNewPlan={onNewPlan}
      plans={[{ id: 'current', label: 'Current' }, { id: 'other', label: 'Other' }]} />))
    await act(async () => host.querySelector<HTMLButtonElement>('[data-plan-menu-trigger]')!.click())
    const menu = document.querySelector<HTMLElement>('[role="menu"]')!
    const rows = menu.querySelectorAll('.plan-menu-row')
    expect(rows[0].classList.contains('current')).toBe(true)
    expect(rows[1].classList.contains('current')).toBe(false)
    expect([...rows[0].querySelectorAll(':scope > button')].map(button => button.textContent)).toEqual(['Current', '⋯'])
    const create = buttonByText(menu, locale === 'zh' ? '＋ 新建计划' : '+ New plan')
    expect(create.classList.contains('plan-menu-new')).toBe(true)
    await act(async () => create.click())
    expect(onNewPlan).toHaveBeenCalledOnce()
    expect(document.querySelector('[role="menu"]')).toBeNull()
  })

  it('shows only the approved 56px top bar and puts secondary actions in the plan menu', async () => {
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
          studentPlanCursor={{
            kind: 'day', dayId: 'cursor', weekNumber: 2, dayOrdinal: 3,
            calendarDate: '2026-07-23', lagDays: 4,
          }}
          plans={[{ id: 'plan-1', label: '力量计划' }]}
          currentPlanId="plan-1"
          onSwitchPlan={vi.fn()}
          totalShiftDays={3}
          onNewExercise={vi.fn()}
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
    expect(bar.style.height).toBe('56px')
    expect(bar.style.whiteSpace).toBe('nowrap')
    expect(bar.style.flexWrap).toBe('nowrap')
    expect(bar.style.overflowX).toBe('auto')
    expect(bar.querySelector('br')).toBeNull()
    expect(bar.textContent).toContain('MeetPR')
    expect(bar.textContent).not.toContain('COACH / 计划编排')

    const labels = ['王学员', '力量计划', '2 处待核对', '已自动保存', '发布给学员']
    let previous = -1
    for (const label of labels) {
      const position = bar.textContent!.indexOf(label)
      expect(position).toBeGreaterThan(previous)
      previous = position
    }
    for (const label of ['← 总览', '＋ 动作', '保存草稿', '学员曾顺延 3 天']) expect(bar.textContent).not.toContain(label)
    expect(bar.querySelector('img')?.getAttribute('src')).toContain('meetpr-icon')
    await act(async () => host.querySelector<HTMLButtonElement>('[data-plan-menu-trigger]')!.click())
    expect(document.querySelector('input[type=file]')).toBeNull()

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

    await act(async () => { buttonByText(host, '发布给学员').click() })
    expect(onSave).not.toHaveBeenCalled()
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
    expect(onSave).toHaveBeenCalledTimes(1)
    expect(host.textContent).not.toContain('不可撤回')
  })
})

it('keeps the plan menu lean and scopes actions to each plan row', async () => {
  const host = document.createElement('div'); document.body.append(host); const root = createRoot(host)
  const onPlanAction = vi.fn()
  try {
    await act(async () => root.render(<TopBar studentName="Synthetic" planName="Current" published={false} statusText="" onPublish={vi.fn()} currentPlanId="current"
      plans={[{ id: 'current', label: 'Current', status: 'draft', startDate: '2000-01-03' }, { id: 'other', label: 'Other', status: 'published', startDate: '2000-01-03' }]}
      onPlanAction={onPlanAction} onNewPlan={vi.fn()} />))
    await act(async () => host.querySelector<HTMLButtonElement>('[data-plan-menu-trigger]')!.click())
    expect(document.querySelector('[role=menu]')!.textContent).not.toContain('重命名')
    await act(async () => document.querySelector<HTMLButtonElement>('[aria-label="Other · 更多操作"]')!.click())
    expect(document.querySelector('[data-plan-actions]')!.textContent).toContain('标记完成')
    expect(document.querySelector('[data-plan-actions]')!.textContent).not.toContain('删除草稿')
    await act(async () => buttonByText(document.body, '重命名').click())
    expect(onPlanAction).toHaveBeenCalledWith('other', 'rename')
    await act(async () => host.querySelector<HTMLButtonElement>('[data-plan-menu-trigger]')!.click())
    await act(async () => document.querySelector<HTMLButtonElement>('[aria-label="Current · 更多操作"]')!.click())
    expect(document.querySelector('[data-plan-actions]')!.textContent).not.toContain('标记完成')
    await act(async () => buttonByText(document.body, '删除草稿').click())
    expect(onPlanAction).toHaveBeenLastCalledWith('current', 'delete')
  } finally { act(() => root.unmount()); host.remove() }
})

it.each(['draft', 'published', 'completed', 'paused'] as const)('shows only eligible per-plan actions for %s', async status => {
  const host = document.createElement('div'); document.body.append(host); const root = createRoot(host)
  const action = vi.fn()
  try {
    await act(async () => root.render(<TopBar studentName="Synthetic" planName="Other" published={false} statusText="" onPublish={vi.fn()} currentPlanId="current"
      plans={[{ id: 'other', label: 'Other', status, startDate: '2000-01-03' }]}
      onPlanAction={action} />))
    await act(async () => host.querySelector<HTMLButtonElement>('[data-plan-menu-trigger]')!.click())
    await act(async () => document.querySelector<HTMLButtonElement>('[aria-label="Other · 更多操作"]')!.click())
    const menu = document.querySelector('[data-plan-actions]')!
    expect(menu.textContent?.includes('重命名')).toBe(status === 'draft' || status === 'published')
    expect(menu.textContent?.includes('计划设置')).toBe(status === 'draft' || status === 'published')
    expect(menu.textContent?.includes('删除草稿')).toBe(status === 'draft')
    expect(menu.textContent?.includes('标记完成')).toBe(status === 'published')
    expect(menu.textContent?.includes('补记过去训练')).toBe(status !== 'draft')
  } finally { act(() => root.unmount()); host.remove() }
})
