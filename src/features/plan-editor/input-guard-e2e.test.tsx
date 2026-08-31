import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { PlanEditor } from './PlanEditor'
import type { DayCol, ExerciseRow, Week } from './types'

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

function row(partial: Partial<ExerciseRow>): ExerciseRow {
  return {
    id: 'row', serverRowId: null, serverSortOrder: null, hasLogs: false, conflictMessage: null,
    exerciseId: 'exercise', name: '深蹲', ku: true, custom: false, isMain: true,
    aux: false, reps: '5', mode: 'kg', intensity: null, weightMode: 'per_set',
    boxes: [{ val: '170', empty: false }], note: '',
    ...partial,
  }
}

function week(trainingRow: ExerciseRow): Week {
  const days: DayCol[] = Array.from({ length: 7 }, (_, dow) => ({
    dow,
    dowLabel: `周${dow + 1}`,
    dateLabel: '',
    rest: dow !== 0,
    rows: dow === 0 ? [trainingRow] : [],
  }))
  return { num: 1, num2: '01', range: '', isCurrent: true, vol: '', days }
}

function buttonByText(container: HTMLElement, text: string): HTMLButtonElement {
  const button = [...container.querySelectorAll('button')].find((item) => item.textContent?.includes(text))
  if (!button) throw new Error(`button not found: ${text}`)
  return button
}

describe('plan editor intensity-or-weight save and publish chain', () => {
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

  it.each([
    ['纯强度无重量', row({
      intensity: { mode: 'rpe', value: '8', high: '' },
      intensityMode: 'per_set',
      intensityBoxes: [
        { val: '8', empty: false },
        { val: '8.5', empty: false },
        { val: '9', empty: false },
      ],
      boxes: [
        { val: '', empty: true },
        { val: '', empty: true },
        { val: '', empty: true },
      ],
    })],
    ['纯重量无强度', row({
      intensity: null,
      boxes: [
        { val: '170', empty: false },
        { val: '172.5', empty: false },
        { val: '175', empty: false },
      ],
    })],
    ['稀疏逐组混合', row({
      intensity: { mode: 'rpe', value: '8', high: '' },
      intensityMode: 'per_set',
      intensityBoxes: [
        { val: '8', empty: false },
        { val: '', empty: true },
        { val: '9', empty: false },
      ],
      boxes: [
        { val: '', empty: true },
        { val: '172.5', empty: false },
        { val: '', empty: true },
      ],
    })],
  ] as const)('%s：可保存可发布且零告警', async (_label, trainingRow) => {
    const alert = vi.spyOn(window, 'alert').mockImplementation(() => {})
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true)
    const onSave = vi.fn(async (weeks: Week[]) => ({ changedDays: 1, degradedRows: 0, skippedRows: 0, weeks }))
    const onPublish = vi.fn(async () => {})

    act(() => root.render(
      <PlanEditor
        initialWeeks={[week(trainingRow)]}
        weeksCount={1}
        studentName="学员"
        planName="计划"
        onSave={onSave}
        onPublish={onPublish}
      />,
    ))

    expect(host.textContent).not.toContain('待核对')
    expect(host.querySelector('.guard-invalid')).toBeNull()
    expect(host.querySelector('[aria-invalid="true"]')).toBeNull()
    expect(host.querySelector('[role="alert"]')).toBeNull()

    await act(async () => {
      buttonByText(host, '保存草稿').click()
      await Promise.resolve()
      await Promise.resolve()
    })
    expect(onSave).toHaveBeenCalledTimes(1)
    expect(onSave.mock.calls[0][0][0].days[0].rows[0]).toEqual(trainingRow)

    await act(async () => {
      buttonByText(host, '发布给学员').click()
      await Promise.resolve()
      await Promise.resolve()
      await Promise.resolve()
    })
    expect(onSave).toHaveBeenCalledTimes(2)
    expect(onPublish).toHaveBeenCalledTimes(1)
    expect(alert).not.toHaveBeenCalled()
    expect(confirm).not.toHaveBeenCalled()
    expect(buttonByText(host, '已发布 · 不可撤回').disabled).toBe(true)
  })
})
