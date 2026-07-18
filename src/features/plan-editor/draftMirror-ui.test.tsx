import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { PlanEditor } from './PlanEditor'
import { loadDraftMirror, saveDraftMirror } from './draftMirror'
import type { ExerciseRow, Week } from './types'

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

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

describe('PlanEditor local draft recovery', () => {
  let host: HTMLDivElement
  let root: Root

  beforeEach(() => {
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

  it('offers a non-blocking banner and restores weeks through the undoable history path', () => {
    saveDraftMirror('plan', {
      weeks: weeks('镜像里的未保存备注'),
      planStartDate: '2026-01-01',
      weeksCount: 1,
    }, localStorage, () => new Date('2026-07-18T09:30:00Z'))

    act(() => root.render(
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
    ))

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

  it('clears the mirror after an explicit save covers the same published edit', async () => {
    vi.useFakeTimers()
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    const onSave = vi.fn(async (saved: Week[]) => ({ changedDays: 1, skippedRows: 0, weeks: saved }))
    act(() => root.render(
      <PlanEditor initialWeeks={weeks('server')} weeksCount={1} planStartDate="2026-01-01"
        studentName="学员" planName="计划" currentPlanId="plan" initialPublished onSave={onSave} />,
    ))

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
    act(() => root.render(
      <PlanEditor initialWeeks={weeks('server')} weeksCount={1} planStartDate="2026-01-01"
        studentName="学员" planName="计划" currentPlanId="plan" initialPublished onSave={onSave} />,
    ))

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
    act(() => root.render(
      <PlanEditor initialWeeks={weeks('server')} weeksCount={1} planStartDate="2026-01-01"
        studentName="学员" planName="计划" currentPlanId="plan" initialPublished onSave={onSave} />,
    ))

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
})
