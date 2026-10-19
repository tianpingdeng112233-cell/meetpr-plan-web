import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiException } from '../../api/client'
import { PlanEditor } from './PlanEditor'
import { LockedRowMutationError, ReconcileConflict, ReconciliationError } from './reconcile'
import { S, setLocale } from '../../i18n/strings'
import type { Week } from './types'

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

function weeks(): Week[] {
  return [{
    num: 1, num2: '01', range: '', isCurrent: true, vol: '',
    days: Array.from({ length: 7 }, (_, dow) => ({
      dow, dowLabel: `周${dow + 1}`, dateLabel: '', rest: dow !== 0,
      rows: dow !== 0 ? [] : [{
        id: 'row', serverRowId: null, serverSortOrder: null, hasLogs: false, conflictMessage: null,
        exerciseId: 'exercise', name: '深蹲', ku: true, custom: false, isMain: true,
        aux: false, reps: '5', mode: 'kg', boxes: [{ val: '100', empty: false }], note: '',
      }],
    })),
  }]
}

describe('PlanEditor save failure reasons', () => {
  let host: HTMLDivElement
  let root: Root

  beforeEach(() => {
    vi.useFakeTimers()
    host = document.createElement('div')
    document.body.appendChild(host)
    root = createRoot(host)
    vi.spyOn(window, 'alert').mockImplementation(() => {})
    Object.defineProperty(Element.prototype, 'scrollIntoView', { value: vi.fn(), configurable: true })
  })

  afterEach(async () => {
    await act(async () => root.unmount())
    host.remove()
    vi.restoreAllMocks()
    vi.useRealTimers()
    setLocale(undefined)
  })

  async function click(label: string) {
    const button = [...host.querySelectorAll('button')].find((item) => item.textContent === label)!
    expect(button).toBeDefined()
    await act(async () => button.dispatchEvent(new MouseEvent('click', { bubbles: true })))
  }

  async function publish(error: unknown) {
    const onSave = vi.fn().mockRejectedValue(error)
    const onPublish = vi.fn()
    await act(async () => root.render(
      <PlanEditor initialWeeks={weeks()} weeksCount={1} studentName="学员" planName="计划"
        onSave={onSave} onPublish={onPublish} />,
    ))
    await click('发布给学员')
    expect(onSave).toHaveBeenCalledTimes(1)
    expect(onPublish).not.toHaveBeenCalled()
    return onSave
  }

  it.each([
    ['zh', 'auto', '重试保存'],
    ['zh', 'manual', '重试保存'],
    ['en', 'auto', 'Retry save'],
    ['en', 'manual', 'Retry save'],
  ] as const)('retries a failed %s %s draft save from the top bar', async (locale, mode, label) => {
    setLocale(locale)
    const onSave = vi.fn().mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockImplementation(async (savedWeeks: Week[]) => ({
        weeks: savedWeeks, skippedRows: 0, degradedRows: 0, changedDays: 1,
      }))
    await act(async () => root.render(
      <PlanEditor initialWeeks={weeks()} weeksCount={1} studentName="学员" planName="计划" onSave={onSave} />,
    ))
    const retryButton = () => [...host.querySelectorAll<HTMLButtonElement>('[data-plan-context-bar] button')]
      .find(button => button.textContent === label)
    expect(retryButton()).toBeUndefined()
    await act(async () => host.querySelector<HTMLElement>('[data-block-week="1"]')!.click())
    await act(async () => {
      const note = host.querySelector<HTMLInputElement>('[data-c="note"] input')!
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(note, 'retry this edit')
      note.dispatchEvent(new Event('input', { bubbles: true }))
    })
    await act(async () => {
      if (mode === 'auto') await vi.advanceTimersByTimeAsync(1500)
      else window.dispatchEvent(new KeyboardEvent('keydown', { key: 's', metaKey: true, bubbles: true, cancelable: true }))
    })
    expect(onSave).toHaveBeenCalledTimes(1)
    const reason = S.editor.saveFailureReasons.network
    expect(host.querySelector('[data-testid="plan-save-status"]')?.textContent)
      .toContain(mode === 'auto' ? S.editor.autosaveFailedReason(reason) : S.editor.saveFailedReason(reason))
    expect(retryButton()).toBeDefined()
    expect(retryButton()!.disabled).toBe(false)
    await act(async () => retryButton()!.click())
    expect(onSave).toHaveBeenCalledTimes(2)
    expect(onSave.mock.calls[1][0][0].days[0].rows[0].note).toBe('retry this edit')
    expect(host.querySelector('[data-testid="plan-save-status"]')?.textContent).toContain(S.editor.draftSaved)
    expect(retryButton()).toBeUndefined()
  })

  it('shows rejected reason and validation path when publishing cannot save', async () => {
    await publish(new ApiException(422, 'VALIDATION_ERROR', {
      issues: [{ path: ['upsert_days', 0, 'exercises', 0, 'sets', 0, 'target_weight'], message: 'x' }],
    }))
    expect(window.alert).toHaveBeenCalledTimes(1)
    expect(window.alert).toHaveBeenCalledWith('发布中断：服务器没有接受这份计划，直接重试不会成功（改动已保留在本页）。请把这个弹窗截图发给 David。\n技术信息：422 VALIDATION_ERROR · upsert_days.0.exercises.0.sets.0.target_weight')
    expect(host.textContent).toContain('保存失败（服务器未接受 422）· 重试')
  })

  it('shows network reason when publishing cannot reach the server', async () => {
    await publish(new TypeError('Failed to fetch'))
    expect(window.alert).toHaveBeenCalledTimes(1)
    expect(window.alert).toHaveBeenCalledWith('发布中断：没连上服务器，计划没有存上（改动已保留在本页）。请检查网络后重新点发布。')
    expect(host.textContent).toContain('保存失败（没连上服务器）· 重试')
  })

  it.each([
    [new ApiException(401, 'UNAUTHORIZED'), '登录已过期', '发布中断：登录已过期，计划没有存上（改动已保留在本页）。请重新登录后再点发布。\n技术信息：401 UNAUTHORIZED'],
    [new ApiException(429, 'RATE_LIMITED'), '服务器繁忙', '发布中断：服务器繁忙，计划没有存上（改动已保留在本页）。请等一分钟后重新点发布。\n技术信息：429 RATE_LIMITED'],
    [new ApiException(503, 'UNAVAILABLE'), '服务器出错 503', '发布中断：服务器出错，计划没有存上（改动已保留在本页）。请稍后重新点发布；反复出现请把这个弹窗截图发给 David。\n技术信息：503 UNAVAILABLE'],
    [new Error('Unexpected state'), '页面出错', '发布中断：页面内部出错，计划没有存上（改动已保留在本页）。请把这个弹窗截图发给 David。\n技术信息：Error: Unexpected state'],
  ])('shows the publish guidance for %s', async (error, reason, alert) => {
    await publish(error)
    expect(window.alert).toHaveBeenCalledTimes(1)
    expect(window.alert).toHaveBeenCalledWith(alert)
    expect(host.textContent).toContain(`保存失败（${reason}）· 重试`)
  })

  it.each([
    [new ReconcileConflict('DAY_HISTORY_IMMUTABLE', weeks()), S.editor.athleteCompletedDuringSave],
    [new ReconcileConflict('OTHER_CONFLICT', weeks()), S.editor.athleteLoggedDuringSave],
    [new ReconcileConflict('CONFLICT', weeks(), '专门的冲突提示'), '专门的冲突提示'],
    [new LockedRowMutationError(['row'], weeks()), S.editor.lockedRowRetry],
  ])('keeps the scoped status and explains the publish interruption for %s', async (error, status) => {
    await publish(error)
    expect(host.textContent).toContain(status)
    expect(window.alert).toHaveBeenCalledTimes(1)
    expect(window.alert).toHaveBeenCalledWith(`发布中断：计划没有存上——${status}（改动已保留在本页）。`)
  })

  it('shows only the existing incomplete explanation during publish and manual save', async () => {
    await publish(new ReconciliationError('PLAN_SET_SPEC_INCOMPLETE'))
    expect(host.textContent).toContain(S.editor.incompleteSaveTitle)
    expect(window.alert).toHaveBeenCalledTimes(1)
    expect(window.alert).toHaveBeenCalledWith(S.editor.incompleteSaveDetail)
    vi.mocked(window.alert).mockClear()
    await act(async () => { window.dispatchEvent(new KeyboardEvent('keydown', {key:'s', metaKey:true, bubbles:true, cancelable:true})); await Promise.resolve() })
    expect(window.alert).toHaveBeenCalledTimes(1)
    expect(window.alert).toHaveBeenCalledWith(S.editor.incompleteSaveDetail)
  })

  it('re-arms autosave and uses the latest failure on the next publish', async () => {
    const onSave = await publish(new ApiException(422, 'VALIDATION_ERROR'))
    onSave.mockRejectedValue(new TypeError('Failed to fetch'))
    await act(async () => { await vi.advanceTimersByTimeAsync(1500) })
    expect(onSave).toHaveBeenCalledTimes(2)
    expect(host.textContent).toContain('自动保存失败（没连上服务器）· 改动已保留')
    expect(window.alert).toHaveBeenCalledTimes(1)
    vi.mocked(window.alert).mockClear()
    await click('发布给学员')
    expect(window.alert).toHaveBeenCalledTimes(1)
    expect(window.alert).toHaveBeenCalledWith('发布中断：没连上服务器，计划没有存上（改动已保留在本页）。请检查网络后重新点发布。')
  })

  it('publishes after a successful retry without resurfacing the old failure', async () => {
    const onSave = await publish(new ApiException(422, 'VALIDATION_ERROR'))
    onSave.mockImplementation(async (saved: Week[]) => ({ weeks: saved, skippedRows: 0, degradedRows: 0, changedDays: 1 }))
    vi.mocked(window.alert).mockClear()
    await click('发布给学员')
    expect(window.alert).not.toHaveBeenCalled()
    expect(host.textContent).toContain('已发布给')
  })

})
