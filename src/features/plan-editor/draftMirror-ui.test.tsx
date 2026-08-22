import { StrictMode, act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { PlanEditor } from './PlanEditor'
import { createDraftMirror, loadDraftMirror, saveDraftMirror } from './draftMirror'
import type { ExerciseRow, Week } from './types'

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
      dow, dowLabel: `周${dow + 1}`, dateLabel: '', rest: dow !== 0,
      rows: dow === 0 ? [row(note)] : [],
    })),
  }]
}

function click(host: HTMLElement, label: string): void {
  const button = [...host.querySelectorAll('button')].find((item) => item.textContent === label)
  if (!button) throw new Error(`button not found: ${label}`)
  button.dispatchEvent(new MouseEvent('click', { bubbles: true }))
}

function setInput(input: HTMLInputElement, value: string): void {
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(input, value)
  input.dispatchEvent(new Event('input', { bubbles: true }))
}

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((res) => { resolve = res })
  return { promise, resolve }
}

describe('PlanEditor local draft recovery', () => {
  let host: HTMLDivElement
  let root: Root

  beforeEach(() => {
    pendingApi.getPendingRevision.mockReset().mockResolvedValue(null)
    pendingApi.putPendingRevision.mockReset().mockImplementation(async (_planId, mirror) => ({
      plan_id: mirror.planId,
      version: mirror.version,
      content_hash: mirror.contentHash,
      saved_at: '2026-08-22T10:15:00.000Z',
    }))
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
    localStorage.clear()
    host = document.createElement('div')
    document.body.appendChild(host)
    root = createRoot(host)
  })

  afterEach(() => {
    if (root) act(() => root.unmount())
    host?.remove()
    localStorage.clear()
    vi.restoreAllMocks()
    vi.useRealTimers()
  })

  it('offers a non-blocking banner and restores weeks through the undoable history path', async () => {
    saveDraftMirror('plan', {
      weeks: weeks('镜像里的未保存备注'),
      planStartDate: '2026-01-01',
      weeksCount: 1,
    }, localStorage, () => new Date('2026-07-18T09:30:00Z'))

    await act(async () => {
      root.render(
        <PlanEditor
          initialWeeks={weeks('服务端备注')}
          weeksCount={1}
          planStartDate="2026-01-01"
          studentName="学员"
          planName="已发布计划"
          currentPlanId="plan"
          initialPublished
          onSave={vi.fn(async (saved: Week[]) => ({ changedDays: 1, skippedRows: 0, weeks: saved }))}
        />,
      )
      await Promise.resolve()
    })

    expect(host.querySelector('[data-testid="draft-mirror-banner"]')?.textContent)
      .toContain('未保存本地草稿')
    expect(host.querySelector<HTMLInputElement>('[data-c="note"] input')?.value).toBe('服务端备注')

    act(() => click(host, '恢复'))
    expect(host.querySelector('[data-testid="draft-mirror-banner"]')).toBeNull()
    expect(host.querySelector<HTMLInputElement>('[data-c="note"] input')?.value).toBe('镜像里的未保存备注')

    act(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', ctrlKey: true, bubbles: true })))
    expect(host.querySelector<HTMLInputElement>('[data-c="note"] input')?.value).toBe('服务端备注')
  })

  it('discards the mirror without replacing the server snapshot', () => {
    saveDraftMirror('plan', {
      weeks: weeks('local'), planStartDate: '2026-01-01', weeksCount: 1,
    }, localStorage)
    act(() => root.render(
      <PlanEditor initialWeeks={weeks('server')} weeksCount={1} planStartDate="2026-01-01"
        studentName="学员" planName="计划" currentPlanId="plan" />,
    ))

    act(() => click(host, '丢弃'))
    expect(host.querySelector<HTMLInputElement>('[data-c="note"] input')?.value).toBe('server')
    expect(localStorage.length).toBe(0)
  })

  it('does not offer recovery when a legacy missing anchor matches the mapped 1RM default', () => {
    const legacyWeeks = weeks('same')
    legacyWeeks[0].days[0].rows[0].intensity = { mode: 'pct', value: '75', high: '' }
    const mappedWeeks = structuredClone(legacyWeeks)
    mappedWeeks[0].days[0].rows[0].pctAnchor = 'one_rm'
    saveDraftMirror('plan', {
      weeks: legacyWeeks, planStartDate: '2026-01-01', weeksCount: 1,
    }, localStorage)

    act(() => root.render(
      <PlanEditor initialWeeks={mappedWeeks} weeksCount={1} planStartDate="2026-01-01"
        studentName="学员" planName="计划" currentPlanId="plan" />,
    ))

    expect(host.querySelector('[data-testid="draft-mirror-banner"]')).toBeNull()
  })

  it('clears the mirror after an explicit save covers the same published edit', async () => {
    vi.useFakeTimers()
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    const onSave = vi.fn(async (saved: Week[]) => ({ changedDays: 1, skippedRows: 0, weeks: saved }))
    await act(async () => {
      root.render(
        <PlanEditor initialWeeks={weeks('server')} weeksCount={1} planStartDate="2026-01-01"
          studentName="学员" planName="计划" currentPlanId="plan" initialPublished onSave={onSave} />,
      )
      await Promise.resolve()
    })

    act(() => setInput(host.querySelector<HTMLInputElement>('[data-c="note"] input')!, 'saved edit'))
    await act(async () => { await vi.advanceTimersByTimeAsync(800) })
    expect(loadDraftMirror('plan')?.content.weeks[0].days[0].rows[0].note).toBe('saved edit')

    await act(async () => {
      click(host, '更新计划')
      await Promise.resolve()
      await Promise.resolve()
    })
    expect(onSave).toHaveBeenCalledTimes(1)
    expect(loadDraftMirror('plan')).toBeNull()
    expect(pendingApi.deletePendingRevision).toHaveBeenCalledWith('plan')
  })

  it('wipes the mirror when undo returns the editor to the server baseline', async () => {
    vi.useFakeTimers()
    act(() => root.render(
      <PlanEditor initialWeeks={weeks('server')} weeksCount={1} planStartDate="2026-01-01"
        studentName="学员" planName="计划" currentPlanId="plan" />,
    ))
    act(() => setInput(host.querySelector<HTMLInputElement>('[data-c="note"] input')!, 'edited'))
    await act(async () => { await vi.advanceTimersByTimeAsync(1000) })
    expect(loadDraftMirror('plan')?.content.weeks[0].days[0].rows[0].note).toBe('edited')

    act(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', ctrlKey: true, bubbles: true })))
    await act(async () => { await vi.advanceTimersByTimeAsync(1000) })
    expect(host.querySelector<HTMLInputElement>('[data-c="note"] input')?.value).toBe('server')
    expect(loadDraftMirror('plan')).toBeNull()
  })

  it('leaves no stale mirror after restoring a metadata-mismatched published candidate and saving', async () => {
    vi.useFakeTimers()
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    // Draft-era mirror: different start date than the now-published plan.
    saveDraftMirror('plan', {
      weeks: weeks('draft-era edit'),
      planStartDate: '2025-12-01',
      weeksCount: 1,
    }, localStorage, () => new Date('2026-07-18T09:30:00Z'))
    const onSave = vi.fn(async (saved: Week[]) => ({ changedDays: 1, skippedRows: 0, weeks: saved }))
    await act(async () => {
      root.render(
        <PlanEditor initialWeeks={weeks('server')} weeksCount={1} planStartDate="2026-01-01"
          studentName="学员" planName="计划" currentPlanId="plan" initialPublished onSave={onSave} />,
      )
      await Promise.resolve()
    })

    act(() => click(host, '恢复'))
    expect(host.querySelector<HTMLInputElement>('[data-c="note"] input')?.value).toBe('draft-era edit')
    await act(async () => {
      click(host, '更新计划')
      await Promise.resolve()
      await Promise.resolve()
    })
    await act(async () => { await vi.advanceTimersByTimeAsync(1000) })
    expect(onSave).toHaveBeenCalledTimes(1)
    expect(loadDraftMirror('plan')).toBeNull()
  })

  it('retains a newer mirror when the coach edits during an in-flight save', async () => {
    vi.useFakeTimers()
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    let resolveSave!: () => void
    const onSave = vi.fn((saved: Week[]) => new Promise<{ changedDays: number; skippedRows: number; weeks: Week[] }>((resolve) => {
      resolveSave = () => resolve({ changedDays: 1, skippedRows: 0, weeks: saved })
    }))
    await act(async () => {
      root.render(
        <PlanEditor initialWeeks={weeks('server')} weeksCount={1} planStartDate="2026-01-01"
          studentName="学员" planName="计划" currentPlanId="plan" initialPublished onSave={onSave} />,
      )
      await Promise.resolve()
    })

    const note = host.querySelector<HTMLInputElement>('[data-c="note"] input')!
    act(() => setInput(note, 'save snapshot'))
    await act(async () => { await vi.advanceTimersByTimeAsync(800) })
    act(() => click(host, '更新计划'))
    expect(onSave).toHaveBeenCalledTimes(1)

    act(() => setInput(note, 'newer edit'))
    await act(async () => { await vi.advanceTimersByTimeAsync(800) })
    await act(async () => {
      resolveSave()
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(loadDraftMirror('plan')?.content.weeks[0].days[0].rows[0].note).toBe('newer edit')
  })

  it('chooses the newer remote candidate over local and labels its source', async () => {
    saveDraftMirror('plan', {
      weeks: weeks('older local'), planStartDate: '2026-01-01', weeksCount: 1,
    }, localStorage, () => new Date('2026-08-22T09:00:00Z'))
    const remote = createDraftMirror('plan', {
      weeks: weeks('newer remote'), planStartDate: '2026-01-01', weeksCount: 1,
    }, () => new Date('2026-08-22T10:00:00Z'))
    pendingApi.getPendingRevision.mockResolvedValue({
      plan_id: remote.planId, version: remote.version, content_hash: remote.contentHash,
      content: remote.content, saved_at: remote.savedAt,
    })

    await act(async () => {
      root.render(
        <PlanEditor initialWeeks={weeks('server')} weeksCount={1} planStartDate="2026-01-01"
          studentName="学员" planName="计划" currentPlanId="plan" initialPublished onSave={vi.fn()} />,
      )
      await Promise.resolve()
    })

    expect(host.querySelector('[data-testid="draft-mirror-banner"]')?.textContent).toContain('云端暂存')
    act(() => click(host, '恢复'))
    expect(host.querySelector<HTMLInputElement>('[data-c="note"] input')?.value).toBe('newer remote')
    expect(pendingApi.deletePendingRevision).toHaveBeenCalledWith('plan')
  })

  it('keeps the newer local candidate when the remote candidate is older', async () => {
    saveDraftMirror('plan', {
      weeks: weeks('newer local'), planStartDate: '2026-01-01', weeksCount: 1,
    }, localStorage, () => new Date('2026-08-22T11:00:00Z'))
    const remote = createDraftMirror('plan', {
      weeks: weeks('older remote'), planStartDate: '2026-01-01', weeksCount: 1,
    }, () => new Date('2026-08-22T10:00:00Z'))
    pendingApi.getPendingRevision.mockResolvedValue({
      plan_id: remote.planId, version: remote.version, content_hash: remote.contentHash,
      content: remote.content, saved_at: remote.savedAt,
    })

    await act(async () => {
      root.render(
        <PlanEditor initialWeeks={weeks('server')} weeksCount={1} planStartDate="2026-01-01"
          studentName="学员" planName="计划" currentPlanId="plan" initialPublished onSave={vi.fn()} />,
      )
      await Promise.resolve()
    })

    expect(host.querySelector('[data-testid="draft-mirror-banner"]')?.textContent).toContain('本地草稿')
    act(() => click(host, '恢复'))
    expect(host.querySelector<HTMLInputElement>('[data-c="note"] input')?.value).toBe('newer local')
  })

  it('ignores baseline mirrors and deletes damaged or already-covered remote data', async () => {
    const baseline = createDraftMirror('plan', {
      weeks: weeks('server'), planStartDate: '2026-01-01', weeksCount: 1,
    })
    saveDraftMirror('plan', baseline.content, localStorage)
    pendingApi.getPendingRevision.mockResolvedValue({
      plan_id: baseline.planId, version: baseline.version, content_hash: baseline.contentHash,
      content: baseline.content, saved_at: baseline.savedAt,
    })

    await act(async () => {
      root.render(
        <PlanEditor initialWeeks={weeks('server')} weeksCount={1} planStartDate="2026-01-01"
          studentName="学员" planName="计划" currentPlanId="plan" initialPublished onSave={vi.fn()} />,
      )
      await Promise.resolve()
    })
    expect(host.querySelector('[data-testid="draft-mirror-banner"]')).toBeNull()
    expect(loadDraftMirror('plan')).toBeNull()
    expect(pendingApi.deletePendingRevision).toHaveBeenCalledWith('plan')

    act(() => root.unmount())
    host.remove()
    host = document.createElement('div')
    document.body.appendChild(host)
    root = createRoot(host)
    pendingApi.deletePendingRevision.mockClear()
    pendingApi.getPendingRevision.mockResolvedValue({
      ...baseline, plan_id: 'plan', content_hash: 'fnv1a32:damaged', saved_at: baseline.savedAt,
    })
    await act(async () => {
      root.render(
        <PlanEditor initialWeeks={weeks('server')} weeksCount={1} planStartDate="2026-01-01"
          studentName="学员" planName="计划" currentPlanId="plan" initialPublished onSave={vi.fn()} />,
      )
      await Promise.resolve()
    })
    expect(host.querySelector('[data-testid="draft-mirror-banner"]')).toBeNull()
    expect(pendingApi.deletePendingRevision).toHaveBeenCalledWith('plan')
  })

  it('shows the warn stashed state and clears remote state after a successful update', async () => {
    vi.useFakeTimers()
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    const onSave = vi.fn(async (saved: Week[]) => ({ changedDays: 1, skippedRows: 0, weeks: saved }))
    await act(async () => {
      root.render(
        <PlanEditor initialWeeks={weeks('server')} weeksCount={1} planStartDate="2026-01-01"
          studentName="学员" planName="计划" currentPlanId="plan" initialPublished onSave={onSave} />,
      )
      await Promise.resolve()
    })

    act(() => setInput(host.querySelector<HTMLInputElement>('[data-c="note"] input')!, 'cloud edit'))
    expect(host.querySelector('[data-testid="plan-save-status"]')?.textContent).toContain('暂存中')
    await act(async () => { await vi.advanceTimersByTimeAsync(3000) })
    const status = host.querySelector<HTMLElement>('[data-testid="plan-save-status"]')!
    expect(status.textContent).toContain('已暂存 11:15')
    expect(status.style.background).toBe('var(--warn-soft)')
    expect([...host.querySelectorAll('button')].find((button) => button.textContent === '更新计划')?.style.border)
      .toContain('var(--warn)')

    pendingApi.deletePendingRevision.mockClear()
    await act(async () => {
      click(host, '更新计划')
      await Promise.resolve()
      await Promise.resolve()
    })
    expect(onSave).toHaveBeenCalledTimes(1)
    expect(pendingApi.deletePendingRevision).toHaveBeenCalledWith('plan')
    expect(host.querySelector('[data-testid="plan-save-status"]')?.textContent).toContain('已更新 学员 的计划')
    expect(host.querySelector('[data-testid="plan-save-status"]')?.classList.contains('published-dirty')).toBe(false)
  })

  it('recreates the remote writer during StrictMode effect replay and still PUTs edits', async () => {
    vi.useFakeTimers()
    await act(async () => {
      root.render(
        <StrictMode>
          <PlanEditor initialWeeks={weeks('server')} weeksCount={1} planStartDate="2026-01-01"
            studentName="学员" planName="计划" currentPlanId="plan" initialPublished onSave={vi.fn()} />
        </StrictMode>,
      )
      await Promise.resolve()
    })

    act(() => setInput(host.querySelector<HTMLInputElement>('[data-c="note"] input')!, 'strict edit'))
    await act(async () => { await vi.advanceTimersByTimeAsync(3000) })

    expect(pendingApi.putPendingRevision).toHaveBeenCalledTimes(1)
    expect(pendingApi.putPendingRevision.mock.calls[0][1].content.weeks[0].days[0].rows[0].note)
      .toBe('strict edit')
  })

  it('blocks update until the open recovery candidate is restored or discarded', async () => {
    const candidate = createDraftMirror('plan', {
      weeks: weeks('remote candidate'), planStartDate: '2026-01-01', weeksCount: 1,
    })
    pendingApi.getPendingRevision.mockResolvedValue({
      plan_id: candidate.planId, version: candidate.version, content_hash: candidate.contentHash,
      content: candidate.content, saved_at: candidate.savedAt,
    })
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true)
    const onSave = vi.fn()

    await act(async () => {
      root.render(
        <PlanEditor initialWeeks={weeks('server')} weeksCount={1} planStartDate="2026-01-01"
          studentName="学员" planName="计划" currentPlanId="plan" initialPublished onSave={onSave} />,
      )
      await Promise.resolve()
    })
    pendingApi.deletePendingRevision.mockClear()

    act(() => click(host, '更新计划'))

    expect(confirm).toHaveBeenCalledWith(expect.stringContaining('请先在提示条选择「恢复」或「丢弃」'))
    expect(onSave).not.toHaveBeenCalled()
    expect(pendingApi.deletePendingRevision).not.toHaveBeenCalled()
    expect(host.querySelector('[data-testid="draft-mirror-banner"]')).not.toBeNull()
  })

  it('blocks update while the remote recovery GET is still pending', () => {
    const request = deferred<ReturnType<typeof createDraftMirror>>()
    pendingApi.getPendingRevision.mockImplementation(() => request.promise)
    const alert = vi.spyOn(window, 'alert').mockImplementation(() => {})
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true)
    const onSave = vi.fn()

    act(() => root.render(
      <PlanEditor initialWeeks={weeks('server')} weeksCount={1} planStartDate="2026-01-01"
        studentName="学员" planName="计划" currentPlanId="plan" initialPublished onSave={onSave} />,
    ))
    act(() => click(host, '更新计划'))

    expect(alert).toHaveBeenCalledWith(expect.stringContaining('正在检查云端暂存'))
    expect(confirm).not.toHaveBeenCalled()
    expect(onSave).not.toHaveBeenCalled()
    expect(pendingApi.deletePendingRevision).not.toHaveBeenCalled()
  })

  it('keeps edits protected while the recovery GET is in flight', async () => {
    vi.useFakeTimers()
    const request = deferred<ReturnType<typeof createDraftMirror>>()
    pendingApi.getPendingRevision.mockImplementation(() => request.promise.then((mirror) => ({
      plan_id: mirror.planId, version: mirror.version, content_hash: mirror.contentHash,
      content: mirror.content, saved_at: mirror.savedAt,
    })))
    act(() => root.render(
      <PlanEditor initialWeeks={weeks('server')} weeksCount={1} planStartDate="2026-01-01"
        studentName="学员" planName="计划" currentPlanId="plan" initialPublished onSave={vi.fn()} />,
    ))

    act(() => setInput(host.querySelector<HTMLInputElement>('[data-c="note"] input')!, 'edit during GET'))
    await act(async () => { await vi.advanceTimersByTimeAsync(800) })
    expect(loadDraftMirror('plan')?.content.weeks[0].days[0].rows[0].note).toBe('edit during GET')
    expect(pendingApi.putPendingRevision).not.toHaveBeenCalled()

    const candidate = createDraftMirror('plan', {
      weeks: weeks('remote candidate'), planStartDate: '2026-01-01', weeksCount: 1,
    })
    await act(async () => {
      request.resolve(candidate)
      await request.promise
      await Promise.resolve()
    })
    expect(host.querySelector<HTMLInputElement>('[data-c="note"] input')?.value).toBe('edit during GET')
    expect(host.querySelector('[data-testid="draft-mirror-banner"]')).not.toBeNull()

    await act(async () => { await vi.advanceTimersByTimeAsync(3000) })
    expect(pendingApi.putPendingRevision.mock.calls.at(-1)?.[1].content.weeks[0].days[0].rows[0].note)
      .toBe('edit during GET')
  })

  it.each(['恢复', '丢弃'] as const)(
    '%s followed by immediate unmount still DELETEs after an in-flight PUT',
    async (decision) => {
      vi.useFakeTimers()
      const candidate = createDraftMirror('plan', {
        weeks: weeks('remote candidate'), planStartDate: '2026-01-01', weeksCount: 1,
      })
      pendingApi.getPendingRevision.mockResolvedValue({
        plan_id: candidate.planId, version: candidate.version, content_hash: candidate.contentHash,
        content: candidate.content, saved_at: candidate.savedAt,
      })
      const putRequest = deferred<{
        plan_id: string; version: number; content_hash: string; saved_at: string
      }>()
      pendingApi.putPendingRevision.mockImplementationOnce(() => putRequest.promise)
      await act(async () => {
        root.render(
          <PlanEditor initialWeeks={weeks('server')} weeksCount={1} planStartDate="2026-01-01"
            studentName="学员" planName="计划" currentPlanId="plan" initialPublished onSave={vi.fn()} />,
        )
        await Promise.resolve()
      })

      act(() => setInput(host.querySelector<HTMLInputElement>('[data-c="note"] input')!, 'PUT in flight'))
      await act(async () => { await vi.advanceTimersByTimeAsync(3000) })
      expect(pendingApi.putPendingRevision).toHaveBeenCalledTimes(1)
      act(() => click(host, decision))
      act(() => root.unmount())
      root = createRoot(host)
      expect(pendingApi.deletePendingRevision).not.toHaveBeenCalled()

      await act(async () => {
        putRequest.resolve({
          plan_id: 'plan', version: candidate.version, content_hash: candidate.contentHash,
          saved_at: candidate.savedAt,
        })
        await putRequest.promise
        await Promise.resolve()
        await Promise.resolve()
      })
      expect(pendingApi.deletePendingRevision).toHaveBeenCalledWith('plan')
    },
  )

  it('a successful update followed by immediate unmount still DELETEs after an in-flight PUT', async () => {
    vi.useFakeTimers()
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    const putRequest = deferred<{
      plan_id: string; version: number; content_hash: string; saved_at: string
    }>()
    pendingApi.putPendingRevision.mockImplementationOnce(() => putRequest.promise)
    const onSave = vi.fn(async (saved: Week[]) => ({ changedDays: 1, skippedRows: 0, weeks: saved }))
    await act(async () => {
      root.render(
        <PlanEditor initialWeeks={weeks('server')} weeksCount={1} planStartDate="2026-01-01"
          studentName="学员" planName="计划" currentPlanId="plan" initialPublished onSave={onSave} />,
      )
      await Promise.resolve()
    })

    act(() => setInput(host.querySelector<HTMLInputElement>('[data-c="note"] input')!, 'covered update'))
    await act(async () => { await vi.advanceTimersByTimeAsync(3000) })
    expect(pendingApi.putPendingRevision).toHaveBeenCalledTimes(1)
    await act(async () => {
      click(host, '更新计划')
      await Promise.resolve()
      await Promise.resolve()
    })
    expect(onSave).toHaveBeenCalledTimes(1)
    act(() => root.unmount())
    root = createRoot(host)
    expect(pendingApi.deletePendingRevision).not.toHaveBeenCalled()

    await act(async () => {
      putRequest.resolve({
        plan_id: 'plan', version: 3, content_hash: 'covered', saved_at: '2026-08-22T10:15:00.000Z',
      })
      await putRequest.promise
      await Promise.resolve()
      await Promise.resolve()
    })
    expect(pendingApi.deletePendingRevision).toHaveBeenCalledWith('plan')
  })

  it.each([
    { state: 'stashing', advance: 0, expected: '离开后会丢失' },
    { state: 'saved', advance: 3000, expected: '已暂存到云端' },
    { state: 'local-only', advance: 10_000, expected: '离开后会丢失' },
  ])('uses the $state leave-guard copy', async ({ state, advance, expected }) => {
    vi.useFakeTimers()
    if (state === 'local-only') pendingApi.putPendingRevision.mockRejectedValue(new Error('offline'))
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false)
    let leaveGuard: (() => Promise<boolean>) | null = null
    await act(async () => {
      root.render(
        <PlanEditor initialWeeks={weeks('server')} weeksCount={1} planStartDate="2026-01-01"
          studentName="学员" planName="计划" currentPlanId="plan" initialPublished onSave={vi.fn()}
          onLeaveGuardChange={(guard) => { leaveGuard = guard }} />,
      )
      await Promise.resolve()
    })
    act(() => setInput(host.querySelector<HTMLInputElement>('[data-c="note"] input')!, state))
    if (advance > 0) await act(async () => { await vi.advanceTimersByTimeAsync(advance) })

    let allowed = true
    await act(async () => { allowed = await leaveGuard!() })

    expect(allowed).toBe(false)
    expect(confirm).toHaveBeenCalledWith(expect.stringContaining(expected))
  })
})
