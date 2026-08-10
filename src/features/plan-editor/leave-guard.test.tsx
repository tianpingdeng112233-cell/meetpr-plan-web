import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { PlanEditor } from './PlanEditor'
import type { DayCol, ExerciseRow, Week } from './types'

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

function row(partial: Partial<ExerciseRow> = {}): ExerciseRow {
  return {
    id: 'row', serverRowId: 'server-row', serverSortOrder: 0, hasLogs: false, conflictMessage: null,
    exerciseId: 'exercise', name: '深蹲', ku: true, custom: false, isMain: true,
    aux: false, reps: '5', mode: 'kg', boxes: [{ val: '100', empty: false }], note: '',
    ...partial,
  }
}

function weekWith(item: ExerciseRow): Week {
  return {
    num: 1, num2: '01', range: '', isCurrent: true, vol: '',
    days: Array.from({ length: 7 }, (_, dow): DayCol => ({
      dow, dowLabel: `周${dow + 1}`, dateLabel: '', rest: dow !== 0,
      rows: dow === 0 ? [item] : [],
    })),
  }
}

function setInput(input: HTMLInputElement, value: string): void {
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(input, value)
  input.dispatchEvent(new Event('input', { bubbles: true }))
}

describe('PlanEditor external leave guard', () => {
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
    vi.restoreAllMocks()
  })

  it('flushes draft edits through the existing save controller before allowing rail navigation', async () => {
    let leaveGuard: (() => Promise<boolean>) | null = null
    const onSave = vi.fn(async (weeks: Week[]) => ({ changedDays: 1, skippedRows: 0, weeks }))
    act(() => root.render(
      <PlanEditor
        initialWeeks={[weekWith(row())]}
        weeksCount={1}
        studentName="学员"
        planName="草稿"
        onSave={onSave}
        onLeaveGuardChange={(guard) => { leaveGuard = guard }}
      />,
    ))
    act(() => setInput(host.querySelector<HTMLInputElement>('[data-c="note"] input')!, '写到一半'))

    let allowed = false
    await act(async () => { allowed = await leaveGuard!() })

    expect(allowed).toBe(true)
    expect(onSave).toHaveBeenCalledTimes(1)
    expect(onSave.mock.calls[0][0][0].days[0].rows[0].note).toBe('写到一半')
  })

  it('refuses rail navigation when the unbound-row warning is cancelled', async () => {
    let leaveGuard: (() => Promise<boolean>) | null = null
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false)
    const onSave = vi.fn(async (weeks: Week[]) => ({ changedDays: 0, skippedRows: 1, weeks }))
    act(() => root.render(
      <PlanEditor
        initialWeeks={[weekWith(row({ exerciseId: null, ku: false, name: '手写动作' }))]}
        weeksCount={1}
        studentName="学员"
        planName="草稿"
        onSave={onSave}
        onLeaveGuardChange={(guard) => { leaveGuard = guard }}
      />,
    ))

    await expect(leaveGuard!()).resolves.toBe(false)
    expect(confirm).toHaveBeenCalledWith(expect.stringContaining('无法保存，离开这个计划后会丢失'))
    expect(onSave).not.toHaveBeenCalled()
  })

  it('refuses rail navigation when published edits have not been explicitly updated', async () => {
    let leaveGuard: (() => Promise<boolean>) | null = null
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false)
    const onSave = vi.fn(async (weeks: Week[]) => ({ changedDays: 1, skippedRows: 0, weeks }))
    act(() => root.render(
      <PlanEditor
        initialWeeks={[weekWith(row())]}
        weeksCount={1}
        studentName="学员"
        planName="已发布计划"
        initialPublished
        onSave={onSave}
        onLeaveGuardChange={(guard) => { leaveGuard = guard }}
      />,
    ))
    act(() => setInput(host.querySelector<HTMLInputElement>('[data-c="note"] input')!, '尚未更新'))

    await expect(leaveGuard!()).resolves.toBe(false)
    expect(confirm).toHaveBeenCalledWith(expect.stringContaining('已发布计划还有未更新的修改'))
    expect(onSave).not.toHaveBeenCalled()
  })
})
