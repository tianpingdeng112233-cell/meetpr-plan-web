import { StrictMode, act, useState } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { PlanEditor } from './PlanEditor'
import { createDraftMirror, loadDraftMirror, saveDraftMirror } from './draftMirror'
import type { ExerciseRow, Week } from './types'
import { ReconciliationError } from './reconcile'
import { relabelWeeksForStartDate } from './mapping'

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

function offerRemoteCandidate(note = 'remote candidate'): void {
  const candidate = createDraftMirror('plan', {
    weeks: weeks(note), planStartDate: '2026-01-01', weeksCount: 1,
  })
  pendingApi.getPendingRevision.mockResolvedValue({
    plan_id: candidate.planId, version: candidate.version, content_hash: candidate.contentHash,
    content: candidate.content, saved_at: candidate.savedAt,
  })
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
          onSave={vi.fn(async (saved: Week[]) => ({ changedDays: 1, degradedRows: 0, skippedRows: 0, weeks: saved }))}
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

  it('restores published prescription content without restoring an obsolete shift schedule', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    const oldWeeks = weeks('recovered prescription')
    oldWeeks[0].range = '1/1 – 1/7'
    oldWeeks[0].days[0] = {
      ...oldWeeks[0].days[0], dateLabel: '1/1', dowLabel: '周四',
      serverDayId: 'old-day', completedAt: null, shiftedToDate: null, shiftBadge: null,
      releasedSortOrders: [2],
    }
    saveDraftMirror('plan', {
      weeks: oldWeeks, planStartDate: '2026-01-01', weeksCount: 1,
    }, localStorage)
    const currentWeeks = weeks('current prescription')
    currentWeeks[0].range = '1/4 – 1/7'
    currentWeeks[0].days[0] = {
      ...currentWeeks[0].days[0], dateLabel: '1/4', dowLabel: '周日',
      serverDayId: 'current-day', completedAt: '2026-01-04T08:00:00Z',
      shiftedToDate: '2026-01-04', shiftBadge: { originalDate: '2026-01-01', days: 3 },
    }
    const onSave = vi.fn(async (saved: Week[]) => ({ changedDays: 1, degradedRows: 0, skippedRows: 0, weeks: saved }))
    await act(async () => {
      root.render(
        <PlanEditor initialWeeks={currentWeeks} weeksCount={1} planStartDate="2026-01-01"
          studentName="学员" planName="计划" currentPlanId="plan" planStatus="published"
          initialPublished totalShiftDays={3} onSave={onSave} />,
      )
      await Promise.resolve()
    })

    act(() => click(host, '恢复'))
    expect(host.querySelector<HTMLInputElement>('[data-c="note"] input')?.value).toBe('recovered prescription')
    expect(host.querySelector('.day[data-dow="0"] [data-day-calendar-label]')?.textContent).toContain('1/4')
    expect(host.querySelector('.day[data-dow="0"] [data-shift-badge]')?.getAttribute('title'))
      .toBe('原定 1/1 · 已后移 3 天')
    await act(async () => { click(host, '更新计划'); await Promise.resolve() })
    expect(onSave).toHaveBeenCalledOnce()
    const saved = onSave.mock.calls[0][0]
    expect(saved[0].range).toBe('1/4 – 1/7')
    expect(saved[0].days[0]).toMatchObject({
      serverDayId: 'current-day', completedAt: '2026-01-04T08:00:00Z',
      shiftedToDate: '2026-01-04', shiftBadge: { originalDate: '2026-01-01', days: 3 },
      releasedSortOrders: [2],
    })
  })

  it.each([1, 2])('freezes the published calendar across undo and redo of a restored %s-week draft', async (publishedWeeks) => {
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    const original = relabelWeeksForStartDate(weeks('server prescription'), '2026-01-01')
    const recovered = relabelWeeksForStartDate(Array.from({ length: publishedWeeks }, (_, index) => ({
      ...weeks(index === 0 ? 'recovered prescription' : 'second week')[0], num: index + 1, num2: `0${index + 1}`,
    })), '2026-02-02')
    saveDraftMirror('plan', { weeks: recovered, planStartDate: '2026-02-02', weeksCount: publishedWeeks }, localStorage)
    const onSave = vi.fn(async (saved: Week[], start?: string | null) => ({
      changedDays: 1, degradedRows: 0, skippedRows: 0, planStartDate: start ?? '2026-02-02',
      weeks: relabelWeeksForStartDate(saved, start ?? '2026-02-02').map(week => ({
        ...week, days: week.days.map(day => ({ ...day, serverDayId: day.dow === 0 ? 'published-day' : null })),
      })),
    }))
    function EditorSession() {
      const [status, setStatus] = useState<'draft' | 'published'>('draft')
      return <PlanEditor initialWeeks={original} weeksCount={status === 'published' ? publishedWeeks : 1} planStartDate="2026-01-01"
        studentName="学员" planName="计划" currentPlanId="plan" planStatus={status}
        onSave={onSave} onPublish={async () => setStatus('published')} />
    }
    await act(async () => root.render(<EditorSession />))
    const undo = () => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', metaKey: true, bubbles: true }))
    const redo = () => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', metaKey: true, shiftKey: true, bubbles: true }))
    const calendar = () => host.querySelector('.day[data-dow="0"] [data-day-calendar-label]')?.textContent
    const note = () => host.querySelector<HTMLInputElement>('[data-c="note"] input')!
    act(() => click(host, '恢复'))
    act(undo)
    expect(calendar()).toContain('1/1')
    expect(note().value).toBe('server prescription')
    act(redo)
    expect(calendar()).toContain('2/2')
    act(() => setInput(note(), 'first edit'))
    act(() => setInput(note(), 'second edit'))
    act(undo)
    await act(async () => click(host, '发布给学员'))
    expect(onSave.mock.calls[0][1]).toBe('2026-02-02')

    act(undo)
    expect(note().value).toBe('recovered prescription')
    expect(calendar()).toContain('2/2')
    act(undo)
    expect(note().value).toBe('server prescription')
    expect(calendar()).toContain('2/2')
    expect(host.querySelectorAll('[data-week-slot]')).toHaveLength(publishedWeeks)
    const monday = host.querySelector<HTMLElement>('.day[data-dow="0"]')!
    act(() => monday.dispatchEvent(new MouseEvent('click', { bubbles: true })))
    act(() => click(monday, '后移…'))
    expect(document.querySelector('[data-plan-shift-panel]')?.textContent).toContain('从 2/2（W1D1）起后移')
    act(redo)
    expect(note().value).toBe('recovered prescription')
    expect(calendar()).toContain('2/2')
    act(redo)
    expect(note().value).toBe('first edit')
    act(redo)
    expect(note().value).toBe('second edit')
    expect(calendar()).toContain('2/2')
    await act(async () => click(host, '更新计划'))
    expect(onSave.mock.calls[1][1]).toBeNull()
    expect(onSave.mock.calls[1][0][0].days[0].serverDayId).toBe('published-day')
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
    const onSave = vi.fn(async (saved: Week[]) => ({ changedDays: 1, degradedRows: 0, skippedRows: 0, weeks: saved }))
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

  it('autosaves degraded draft rows and schedules their full content to the remote snapshot', async () => {
    vi.useFakeTimers()
    const draftWeeks = weeks('server')
    draftWeeks[0].days[0].rows[0].boxes = []
    draftWeeks[0].days[0].rows.push({
      ...row('second'),
      id: 'row-second',
      reps: '12',
      boxes: Array.from({ length: 5 }, () => ({ val: '', empty: true })),
    })
    const onSave = vi.fn(async (saved: Week[]) => ({
      changedDays: 1, degradedRows: 2, skippedRows: 0, weeks: saved,
    }))
    await act(async () => {
      root.render(
        <PlanEditor initialWeeks={draftWeeks} weeksCount={1} planStartDate="2026-01-01"
          studentName="学员" planName="草稿计划" currentPlanId="plan" onSave={onSave} />,
      )
      await Promise.resolve()
    })

    act(() => setInput(host.querySelector<HTMLInputElement>('[data-c="note"] input')!, '半填内容'))
    await act(async () => { await vi.advanceTimersByTimeAsync(3000) })

    expect(onSave).toHaveBeenCalledTimes(1)
    expect(pendingApi.putPendingRevision).toHaveBeenCalledTimes(1)
    expect(pendingApi.putPendingRevision.mock.calls[0][1].content.weeks[0].days[0].rows)
      .toHaveLength(2)
    expect(pendingApi.deletePendingRevision).not.toHaveBeenCalled()
    expect(host.querySelector<HTMLButtonElement>('button[title*="暂存为占位"]')).not.toBeNull()
    expect(host.querySelector('[data-testid="plan-save-status"]')?.textContent)
      .toContain('已自动保存 · 2 个动作待填全或需修正（内容已云端暂存）')
  })

  it('labels degraded draft content as locally stashed when the remote PUT is unavailable', async () => {
    vi.useFakeTimers()
    pendingApi.putPendingRevision.mockRejectedValue({ status: 404 })
    const draftWeeks = weeks('server')
    draftWeeks[0].days[0].rows[0].boxes = []
    const onSave = vi.fn(async (saved: Week[]) => ({
      changedDays: 1, degradedRows: 1, skippedRows: 0, weeks: saved,
    }))
    await act(async () => {
      root.render(
        <PlanEditor initialWeeks={draftWeeks} weeksCount={1} planStartDate="2026-01-01"
          studentName="学员" planName="草稿计划" currentPlanId="plan" onSave={onSave} />,
      )
      await Promise.resolve()
    })

    act(() => setInput(host.querySelector<HTMLInputElement>('[data-c="note"] input')!, '本地半填内容'))
    await act(async () => { await vi.advanceTimersByTimeAsync(3000) })

    expect(host.querySelector('[data-testid="plan-save-status"]')?.textContent)
      .toContain('已自动保存 · 1 个动作待填全或需修正（内容已本地暂存）')
  })

  it('marks a draft snapshot covered after a complete tree save', async () => {
    vi.useFakeTimers()
    const onSave = vi.fn(async (saved: Week[]) => ({
      changedDays: 1, degradedRows: 0, skippedRows: 0, weeks: saved,
    }))
    await act(async () => {
      root.render(
        <PlanEditor initialWeeks={weeks('server')} weeksCount={1} planStartDate="2026-01-01"
          studentName="学员" planName="草稿计划" currentPlanId="plan" onSave={onSave} />,
      )
      await Promise.resolve()
    })

    act(() => setInput(host.querySelector<HTMLInputElement>('[data-c="note"] input')!, '完整修改'))
    await act(async () => { await vi.advanceTimersByTimeAsync(1500) })

    expect(onSave).toHaveBeenCalledTimes(1)
    expect(pendingApi.deletePendingRevision).toHaveBeenCalledWith('plan')
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
    const onSave = vi.fn(async (saved: Week[]) => ({ changedDays: 1, degradedRows: 0, skippedRows: 0, weeks: saved }))
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
    const onSave = vi.fn((saved: Week[]) => new Promise<{ changedDays: number; degradedRows: number; skippedRows: number; weeks: Week[] }>((resolve) => {
      resolveSave = () => resolve({ changedDays: 1, degradedRows: 0, skippedRows: 0, weeks: saved })
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

  it('silently applies a draft remote snapshot that is newer than the plan tree', async () => {
    const remote = createDraftMirror('plan', {
      weeks: weeks('远端半填内容'), planStartDate: '2026-01-01', weeksCount: 1,
    }, () => new Date('2026-08-22T10:00:00Z'))
    pendingApi.getPendingRevision.mockResolvedValue({
      plan_id: remote.planId, version: remote.version, content_hash: remote.contentHash,
      content: remote.content, saved_at: remote.savedAt,
    })

    await act(async () => {
      root.render(
        <PlanEditor initialWeeks={weeks('服务端计划树')} weeksCount={1} planStartDate="2026-01-01"
          planUpdatedAt="2026-08-22T09:00:00Z" studentName="学员" planName="草稿"
          currentPlanId="plan" onSave={vi.fn()} />,
      )
      await Promise.resolve()
    })

    expect(host.querySelector<HTMLInputElement>('[data-c="note"] input')?.value).toBe('远端半填内容')
    expect(host.querySelector('[data-testid="draft-mirror-banner"]')).toBeNull()
    expect(pendingApi.deletePendingRevision).not.toHaveBeenCalled()
  })

  it('keeps a newer draft plan tree and deletes its stale remote snapshot', async () => {
    const remote = createDraftMirror('plan', {
      weeks: weeks('过期远端内容'), planStartDate: '2026-01-01', weeksCount: 1,
    }, () => new Date('2026-08-22T10:00:00Z'))
    pendingApi.getPendingRevision.mockResolvedValue({
      plan_id: remote.planId, version: remote.version, content_hash: remote.contentHash,
      content: remote.content, saved_at: remote.savedAt,
    })

    await act(async () => {
      root.render(
        <PlanEditor initialWeeks={weeks('较新的计划树')} weeksCount={1} planStartDate="2026-01-01"
          planUpdatedAt="2026-08-22T11:00:00Z" studentName="学员" planName="草稿"
          currentPlanId="plan" onSave={vi.fn()} />,
      )
      await Promise.resolve()
    })

    expect(host.querySelector<HTMLInputElement>('[data-c="note"] input')?.value).toBe('较新的计划树')
    expect(host.querySelector('[data-testid="draft-mirror-banner"]')).toBeNull()
    expect(pendingApi.deletePendingRevision).toHaveBeenCalledWith('plan')
  })

  it('does not offer a local stash older than the plan tree when the snapshot GET fails', async () => {
    pendingApi.getPendingRevision.mockRejectedValue(new Error('offline'))
    saveDraftMirror('plan', {
      weeks: weeks('过期本地稿'), planStartDate: '2026-01-01', weeksCount: 1,
    }, localStorage, () => new Date('2026-08-22T08:00:00Z'))

    await act(async () => {
      root.render(
        <PlanEditor initialWeeks={weeks('较新的计划树')} weeksCount={1} planStartDate="2026-01-01"
          planUpdatedAt="2026-08-22T09:00:00Z" studentName="学员" planName="草稿"
          currentPlanId="plan" onSave={vi.fn()} />,
      )
      await Promise.resolve()
    })

    expect(host.querySelector('[data-testid="draft-mirror-banner"]')).toBeNull()
    expect(host.querySelector<HTMLInputElement>('[data-c="note"] input')?.value).toBe('较新的计划树')
  })

  it('keeps the remote snapshot on the latest editor content across an in-flight degraded save', async () => {
    vi.useFakeTimers()
    const draftWeeks = weeks('第一版')
    draftWeeks[0].days[0].rows[0].boxes = []
    const firstSave = deferred<void>()
    const onSave = vi.fn((saved: Week[]) => {
      const res = { changedDays: 1, degradedRows: 1, skippedRows: 0, weeks: saved }
      // The follow-up save stays pending: the only refresh that can run is the
      // one riding the FIRST save's return, so the assertion below proves that
      // refresh carries the newer content, not the save's stale input.
      return onSave.mock.calls.length === 1
        ? firstSave.promise.then(() => res)
        : new Promise<typeof res>(() => {})
    })
    await act(async () => {
      root.render(
        <PlanEditor initialWeeks={draftWeeks} weeksCount={1} planStartDate="2026-01-01"
          studentName="学员" planName="草稿计划" currentPlanId="plan" onSave={onSave} />,
      )
      await Promise.resolve()
    })

    act(() => setInput(host.querySelector<HTMLInputElement>('[data-c="note"] input')!, '半填第一版'))
    await act(async () => { await vi.advanceTimersByTimeAsync(1500) })
    expect(onSave).toHaveBeenCalledTimes(1)
    // The coach keeps typing while the save round-trip is in flight.
    act(() => setInput(host.querySelector<HTMLInputElement>('[data-c="note"] input')!, '半填第二版'))
    await act(async () => { firstSave.resolve(); await vi.advanceTimersByTimeAsync(6000) })

    const putCalls = pendingApi.putPendingRevision.mock.calls
    expect(putCalls.length).toBeGreaterThan(0)
    const lastContent = putCalls[putCalls.length - 1][1].content
    // The refresh riding the save's return must never re-upload the stale input.
    expect(lastContent.weeks[0].days[0].rows[0].note).toBe('半填第二版')
  })

  it('deletes a draft remote snapshot whose content already matches the plan tree', async () => {
    const remote = createDraftMirror('plan', {
      weeks: weeks('相同内容'), planStartDate: '2026-01-01', weeksCount: 1,
    }, () => new Date('2026-08-22T12:00:00Z'))
    pendingApi.getPendingRevision.mockResolvedValue({
      plan_id: remote.planId, version: remote.version, content_hash: remote.contentHash,
      content: remote.content, saved_at: remote.savedAt,
    })

    await act(async () => {
      root.render(
        <PlanEditor initialWeeks={weeks('相同内容')} weeksCount={1} planStartDate="2026-01-01"
          planUpdatedAt="2026-08-22T11:00:00Z" studentName="学员" planName="草稿"
          currentPlanId="plan" onSave={vi.fn()} />,
      )
      await Promise.resolve()
    })

    expect(host.querySelector('[data-testid="draft-mirror-banner"]')).toBeNull()
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
    const onSave = vi.fn(async (saved: Week[]) => ({ changedDays: 1, degradedRows: 0, skippedRows: 0, weeks: saved }))
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

  it('updates from the current page and clears an open recovery candidate', async () => {
    offerRemoteCandidate()
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true)
    const onSave = vi.fn(async (saved: Week[]) => ({
      changedDays: 1, degradedRows: 0, skippedRows: 0, weeks: saved,
    }))

    await act(async () => {
      root.render(
        <PlanEditor initialWeeks={weeks('server')} weeksCount={1} planStartDate="2026-01-01"
          studentName="学员" planName="计划" currentPlanId="plan" initialPublished onSave={onSave} />,
      )
      await Promise.resolve()
    })
    pendingApi.deletePendingRevision.mockClear()

    await act(async () => {
      click(host, '更新计划')
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(confirm).toHaveBeenCalledWith(expect.stringContaining('页面内容将覆盖云端暂存的候选'))
    expect(onSave).toHaveBeenCalledTimes(1)
    expect(onSave.mock.calls[0][0][0].days[0].rows[0].note).toBe('server')
    expect(pendingApi.deletePendingRevision).toHaveBeenCalledWith('plan')
    expect(host.querySelector('[data-testid="draft-mirror-banner"]')).toBeNull()
    expect(host.querySelector('[data-testid="plan-save-status"]')?.textContent).toContain('已更新 学员 的计划')
  })

  it('keeps the recovery candidate when updating the current page fails', async () => {
    offerRemoteCandidate()
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    vi.spyOn(window, 'alert').mockImplementation(() => {})
    const onSave = vi.fn().mockRejectedValue(new ReconciliationError('PLAN_SET_SPEC_INCOMPLETE'))

    await act(async () => {
      root.render(
        <PlanEditor initialWeeks={weeks('server')} weeksCount={1} planStartDate="2026-01-01"
          studentName="学员" planName="计划" currentPlanId="plan" initialPublished onSave={onSave} />,
      )
      await Promise.resolve()
    })
    pendingApi.deletePendingRevision.mockClear()

    await act(async () => {
      click(host, '更新计划')
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(onSave).toHaveBeenCalledTimes(1)
    expect(pendingApi.deletePendingRevision).not.toHaveBeenCalled()
    expect(host.querySelector('[data-testid="draft-mirror-banner"]')).not.toBeNull()
    expect(host.querySelector('[data-testid="plan-save-status"]')?.textContent)
      .not.toContain('已更新 学员 的计划')
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
    const onSave = vi.fn(async (saved: Week[]) => ({ changedDays: 1, degradedRows: 0, skippedRows: 0, weeks: saved }))
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
