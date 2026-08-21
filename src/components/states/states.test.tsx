import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { EmptyState, ErrorState, InlineFail, SkeletonCard, SkeletonRows, useDelayedLoading } from '.'

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

describe('shared state components', () => {
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

  it('renders SkeletonRows with the supported 3–8 row range', async () => {
    await act(async () => root.render(<SkeletonRows count={12} />))
    expect(host.querySelectorAll('.state-skeleton-row')).toHaveLength(8)
    await act(async () => root.render(<SkeletonRows count={1} />))
    expect(host.querySelectorAll('.state-skeleton-row')).toHaveLength(3)
  })

  it('renders SkeletonCard at the real card height', async () => {
    await act(async () => root.render(<SkeletonCard height={128} />))
    expect(host.querySelector<HTMLElement>('[data-testid="skeleton-card"]')?.style.height).toBe('128px')
  })

  it('renders ErrorState copy and request-scoped actions', async () => {
    const retry = vi.fn()
    const signIn = vi.fn()
    await act(async () => root.render(
      <ErrorState content="视频列表" exclusion="不是学员没有上传" retry={retry} secondaryAction={signIn} />,
    ))
    expect(host.textContent).toContain('视频列表没能加载出来')
    expect(host.textContent).toContain('不是学员没有上传')
    const buttons = host.querySelectorAll<HTMLButtonElement>('button')
    await act(async () => { buttons[0].click(); buttons[1].click() })
    expect(retry).toHaveBeenCalledTimes(1)
    expect(signIn).toHaveBeenCalledTimes(1)
  })

  it('renders EmptyState as icon, explanation, and weak text action', async () => {
    const action = vi.fn()
    await act(async () => root.render(
      <EmptyState title="还没有学员申请" body="学员输入邀请码后，申请会出现在这里。" actionLabel="去复制邀请码 →" onAction={action} />,
    ))
    expect(host.querySelector('.state-empty-icon')).not.toBeNull()
    expect(host.textContent).toContain('学员输入邀请码后')
    await act(async () => host.querySelector<HTMLButtonElement>('.state-link-action')?.click())
    expect(action).toHaveBeenCalledTimes(1)
  })

  it('renders InlineFail distinctly and retries only its caller', async () => {
    const retry = vi.fn()
    await act(async () => root.render(<InlineFail retry={retry} />))
    expect(host.querySelector('.state-inline-fail')?.textContent).toBe('↻失败')
    await act(async () => host.querySelector<HTMLButtonElement>('.state-inline-fail')?.click())
    expect(retry).toHaveBeenCalledTimes(1)
  })
})

function TimingHarness({ loading }: { loading: boolean }) {
  const visible = useDelayedLoading(loading)
  return <span data-visible={String(visible)} />
}

describe('useDelayedLoading', () => {
  let host: HTMLDivElement
  let root: Root

  beforeEach(() => {
    vi.useFakeTimers()
    host = document.createElement('div')
    document.body.appendChild(host)
    root = createRoot(host)
  })

  afterEach(() => {
    act(() => root.unmount())
    host.remove()
    vi.useRealTimers()
  })

  const visible = () => host.querySelector('span')?.getAttribute('data-visible')

  it('waits 150ms, then remains visible for at least 300ms', async () => {
    await act(async () => root.render(<TimingHarness loading />))
    await act(async () => vi.advanceTimersByTime(149))
    expect(visible()).toBe('false')
    await act(async () => vi.advanceTimersByTime(1))
    expect(visible()).toBe('true')

    await act(async () => root.render(<TimingHarness loading={false} />))
    await act(async () => vi.advanceTimersByTime(299))
    expect(visible()).toBe('true')
    await act(async () => vi.advanceTimersByTime(1))
    expect(visible()).toBe('false')
  })

  it('never appears when the request finishes inside the delay', async () => {
    await act(async () => root.render(<TimingHarness loading />))
    await act(async () => vi.advanceTimersByTime(100))
    await act(async () => root.render(<TimingHarness loading={false} />))
    await act(async () => vi.advanceTimersByTime(500))
    expect(visible()).toBe('false')
  })
})
