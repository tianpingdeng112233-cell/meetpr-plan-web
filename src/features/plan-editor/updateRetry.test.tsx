import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { PlanEditor, UPDATE_RETRY_DELAY } from './PlanEditor'
import type { ExerciseRow, Week } from './types'
import { LockedRowMutationError, ReconcileConflict, ReconciliationError } from './reconcile'

const pendingApi = vi.hoisted(() => ({
  getPendingRevision: vi.fn(),
  putPendingRevision: vi.fn(),
  deletePendingRevision: vi.fn(),
}))
vi.mock('../../api/pendingRevision', () => pendingApi)

;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

function row(note: string): ExerciseRow {
  return {
    id: `row-${note}`, serverRowId: 'server-row', serverSortOrder: 0, hasLogs: false, conflictMessage: null,
    exerciseId: 'exercise', name: '深蹲', ku: true, custom: false, isMain: true,
    aux: false, reps: '5', mode: 'kg', boxes: [{ val: '100', empty: false }], note,
  }
}
function weeks(note: string): Week[] {
  return [{
    num: 1, num2: '01', range: '', isCurrent: false, vol: '',
    days: Array.from({ length: 7 }, (_, dow) => ({
      dow, dowLabel: `周${dow + 1}`, dateLabel: '', rest: dow !== 0, rows: dow === 0 ? [row(note)] : [],
    })),
  }]
}
function click(host: HTMLElement, label: string): void {
  const button = [...host.querySelectorAll('button')].find((item) => item.textContent === label)
  if (!button) throw new Error(`button not found: ${label}`)
  button.dispatchEvent(new MouseEvent('click', { bubbles: true }))
}
const statusText = (host: HTMLElement) => host.querySelector('[data-testid="plan-save-status"]')?.textContent ?? ''

describe('published plan update: automatic retry + modal error', () => {
  let host: HTMLDivElement
  let root: Root

  beforeEach(() => {
    pendingApi.getPendingRevision.mockReset().mockResolvedValue(null)
    pendingApi.putPendingRevision.mockReset().mockResolvedValue({ plan_id: 'plan', version: 3, content_hash: 'h', saved_at: '2026-08-23T10:00:00.000Z' })
    pendingApi.deletePendingRevision.mockReset().mockResolvedValue(undefined)
    const stored = new Map<string, string>()
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      value: {
        getItem: (key: string) => stored.get(key) ?? null,
        setItem: (key: string, value: string) => { stored.set(key, value) },
        removeItem: (key: string) => { stored.delete(key) },
        clear: () => stored.clear(),
        key: (index: number) => [...stored.keys()][index] ?? null,
        get length() { return stored.size },
      } satisfies Storage,
    })
    host = document.createElement('div')
    document.body.appendChild(host)
    root = createRoot(host)
    vi.useFakeTimers()
    vi.spyOn(window, 'confirm').mockReturnValue(true)
  })

  afterEach(() => {
    if (root) act(() => root.unmount())
    host?.remove()
    vi.restoreAllMocks()
    vi.useRealTimers()
  })

  async function mount(onSave: ReturnType<typeof vi.fn>) {
    await act(async () => {
      root.render(
        <PlanEditor initialWeeks={weeks('server')} weeksCount={1} planStartDate="2026-01-01"
          studentName="学员" planName="计划" currentPlanId="plan" initialPublished onSave={onSave} />,
      )
      await Promise.resolve()
    })
    // let the remote-recovery GET settle so「更新计划」is not gated
    await act(async () => { await vi.advanceTimersByTimeAsync(0) })
  }

  it('retries once automatically after a transient failure and then reports success', async () => {
    const alert = vi.spyOn(window, 'alert').mockImplementation(() => {})
    const onSave = vi.fn()
      .mockRejectedValueOnce(new Error('offline'))
      .mockImplementation(async (saved: Week[]) => ({ changedDays: 1, skippedRows: 0, weeks: saved }))
    await mount(onSave)

    await act(async () => { click(host, '更新计划'); await Promise.resolve(); await Promise.resolve() })
    expect(onSave).toHaveBeenCalledTimes(1)
    expect(statusText(host)).toContain('正在自动重试')
    await act(async () => { await vi.advanceTimersByTimeAsync(UPDATE_RETRY_DELAY) })
    await act(async () => { await vi.advanceTimersByTimeAsync(0) })

    expect(onSave).toHaveBeenCalledTimes(2)
    expect(alert).not.toHaveBeenCalled()
    expect(statusText(host)).toContain('已更新 学员 的计划')
  })

  it('shows a modal with the reason when the retry also fails, keeping the edits on the page', async () => {
    const alert = vi.spyOn(window, 'alert').mockImplementation(() => {})
    const onSave = vi.fn().mockRejectedValue(new Error('fetch failed'))
    await mount(onSave)

    await act(async () => { click(host, '更新计划'); await Promise.resolve(); await Promise.resolve() })
    await act(async () => { await vi.advanceTimersByTimeAsync(UPDATE_RETRY_DELAY) })
    await act(async () => { await vi.advanceTimersByTimeAsync(0) })

    expect(onSave).toHaveBeenCalledTimes(2)
    expect(alert).toHaveBeenCalledTimes(1)
    expect(String(alert.mock.calls[0][0])).toContain('更新计划失败')
    expect(String(alert.mock.calls[0][0])).toContain('fetch failed')
    expect(statusText(host)).toContain('更新失败')
    expect(host.querySelector<HTMLInputElement>('[data-c="note"] input')?.value).toBe('server')
  })
  it('drops the pending retry when the editor unmounts (plan switch) instead of replaying a stale closure', async () => {
    vi.spyOn(window, 'alert').mockImplementation(() => {})
    const onSave = vi.fn().mockRejectedValue(new Error('offline'))
    await mount(onSave)

    await act(async () => { click(host, '更新计划'); await Promise.resolve(); await Promise.resolve() })
    expect(onSave).toHaveBeenCalledTimes(1)
    act(() => root.unmount())
    await act(async () => { await vi.advanceTimersByTimeAsync(UPDATE_RETRY_DELAY + 10) })
    expect(onSave).toHaveBeenCalledTimes(1)
    root = createRoot(host) // afterEach unmounts whatever root is current
  })

  it('does not retry a scoped/structural failure (ReconciliationError) and surfaces its own detail', async () => {
    const alert = vi.spyOn(window, 'alert').mockImplementation(() => {})
    const onSave = vi.fn().mockRejectedValue(new ReconciliationError('PLAN_SET_SPEC_INCOMPLETE'))
    await mount(onSave)

    await act(async () => { click(host, '更新计划'); await Promise.resolve(); await Promise.resolve() })
    await act(async () => { await vi.advanceTimersByTimeAsync(UPDATE_RETRY_DELAY + 10) })
    expect(onSave).toHaveBeenCalledTimes(1)
    expect(alert).toHaveBeenCalledTimes(1)
    expect(String(alert.mock.calls[0][0])).not.toContain('更新计划失败')
  })

  it.each([
    ['history conflict', () => new ReconcileConflict('DAY_HISTORY_IMMUTABLE', weeks('local'))],
    ['locked row mutation', () => new LockedRowMutationError(['server-row'], weeks('local'))],
  ])('shows a delivery-failure modal for a %s instead of only changing the status line', async (_label, error) => {
    const alert = vi.spyOn(window, 'alert').mockImplementation(() => {})
    const onSave = vi.fn().mockRejectedValue(error())
    await mount(onSave)

    await act(async () => { click(host, '更新计划'); await Promise.resolve(); await Promise.resolve() })

    expect(onSave).toHaveBeenCalledTimes(1)
    expect(alert).toHaveBeenCalledTimes(1)
    expect(String(alert.mock.calls[0][0])).toContain('更新计划失败')
    expect(String(alert.mock.calls[0][0])).toContain('学员还没有收到这次修改')
    expect(statusText(host)).not.toContain('已更新 学员 的计划')
  })

  it('reports skipped unbound rows as a partial update in a blocking modal', async () => {
    const alert = vi.spyOn(window, 'alert').mockImplementation(() => {})
    const onSave = vi.fn().mockImplementation(async (saved: Week[]) => ({
      changedDays: 0, skippedRows: 1, weeks: saved,
    }))
    await mount(onSave)

    await act(async () => { click(host, '更新计划'); await Promise.resolve(); await Promise.resolve() })

    expect(onSave).toHaveBeenCalledTimes(1)
    expect(statusText(host)).toContain('仅部分更新')
    expect(statusText(host)).not.toContain('已更新 学员 的计划')
    expect(alert).toHaveBeenCalledTimes(1)
    expect(String(alert.mock.calls[0][0])).toContain('计划没有完整更新')
    expect(String(alert.mock.calls[0][0])).toContain('学员没有收到其中 1 行')
  })
})
