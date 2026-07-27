import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useVisiblePolling } from './useVisiblePolling'

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

function Harness({ tick, interval = 1000, enabled = true, immediate = true }: {
  tick: () => Promise<number | void>
  interval?: number
  enabled?: boolean
  immediate?: boolean
}) {
  useVisiblePolling(tick, interval, { enabled, immediate })
  return null
}

describe('useVisiblePolling', () => {
  let host: HTMLDivElement
  let root: Root
  let visibility: DocumentVisibilityState

  beforeEach(() => {
    vi.useFakeTimers()
    visibility = 'visible'
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      get: () => visibility,
    })
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

  it('上一拍未 settle 时推进十个周期也保持单飞', async () => {
    let resolve!: () => void
    const tick = vi.fn(() => new Promise<void>((done) => { resolve = done }))
    await act(async () => { root.render(<Harness tick={tick} />) })
    expect(tick).toHaveBeenCalledTimes(1)
    await act(async () => { await vi.advanceTimersByTimeAsync(10_000) })
    expect(tick).toHaveBeenCalledTimes(1)
    await act(async () => { resolve(); await Promise.resolve() })
    await act(async () => { await vi.advanceTimersByTimeAsync(1000) })
    expect(tick).toHaveBeenCalledTimes(2)
  })

  it('tick 返回数字覆盖固定 interval', async () => {
    const tick = vi.fn(async () => 20_000)
    await act(async () => { root.render(<Harness tick={tick} interval={5000} />); await Promise.resolve() })
    await act(async () => { await vi.advanceTimersByTimeAsync(19_999) })
    expect(tick).toHaveBeenCalledTimes(1)
    await act(async () => { await vi.advanceTimersByTimeAsync(1) })
    expect(tick).toHaveBeenCalledTimes(2)
  })

  it('不可见即停，转回可见立即跑一拍', async () => {
    const tick = vi.fn(async () => undefined)
    await act(async () => { root.render(<Harness tick={tick} />); await Promise.resolve() })
    visibility = 'hidden'
    act(() => document.dispatchEvent(new Event('visibilitychange')))
    await act(async () => { await vi.advanceTimersByTimeAsync(5000) })
    expect(tick).toHaveBeenCalledTimes(1)
    visibility = 'visible'
    await act(async () => { document.dispatchEvent(new Event('visibilitychange')); await Promise.resolve() })
    expect(tick).toHaveBeenCalledTimes(2)
  })

  it('enabled=false 停表，tick 抛错仍继续，tick 换 identity 不重建定时器', async () => {
    const first = vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValue(undefined)
    await act(async () => { root.render(<Harness tick={first} immediate={false} />) })
    await act(async () => { await vi.advanceTimersByTimeAsync(1000) })
    expect(first).toHaveBeenCalledTimes(1)
    const second = vi.fn(async () => undefined)
    await act(async () => { root.render(<Harness tick={second} immediate={false} />) })
    await act(async () => { await vi.advanceTimersByTimeAsync(999) })
    expect(second).not.toHaveBeenCalled()
    await act(async () => { await vi.advanceTimersByTimeAsync(1) })
    expect(second).toHaveBeenCalledTimes(1)
    await act(async () => { root.render(<Harness tick={second} enabled={false} />) })
    await act(async () => { await vi.advanceTimersByTimeAsync(5000) })
    expect(second).toHaveBeenCalledTimes(1)
  })
})
