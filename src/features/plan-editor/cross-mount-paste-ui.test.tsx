import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { PlanEditor } from './PlanEditor'
import { blockWeeks, blockRow, blockKey, openBlockDay } from './blockGridTestUtils'
import { rowSetGridSignature, type Week } from './types'

let host: HTMLDivElement, root: Root
let originalClipboard: PropertyDescriptor | undefined
beforeEach(() => {
  sessionStorage.clear()
  host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
  originalClipboard = Object.getOwnPropertyDescriptor(navigator, 'clipboard')
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: undefined })
  vi.spyOn(window, 'confirm').mockReturnValue(true)
})
afterEach(() => {
  act(() => root.unmount())
  host.remove()
  if (originalClipboard) Object.defineProperty(navigator, 'clipboard', originalClipboard)
  else Reflect.deleteProperty(navigator, 'clipboard')
  vi.restoreAllMocks()
})

function sourceWeeks() {
  const weeks = blockWeeks([[0, 2], [0]])
  const row = blockRow('source', {
    serverRowId: 'server-source', serverSortOrder: 4, hasLogs: true,
    name: '竞技深蹲', reps: '3', note: '控制离心',
    intensity: { mode: 'rpe', value: '8', high: '' },
    opaqueSets: [{ set_number: 1, target_reps: 3, target_reps_max: null,
      intensity_mode: 'weight', target_value: '120', set_type: 'working',
      rest_seconds: 180, coach_note: '组备注' }],
  })
  row.opaqueSetBaseline = rowSetGridSignature(row)
  weeks[0].days[0].rows = [row]
  return weeks
}

function render(key: string, weeks: Week[], onSave?: Parameters<typeof PlanEditor>[0]['onSave'], initialPublished = true) {
  act(() => root.render(<PlanEditor key={key} initialWeeks={weeks} weeksCount={weeks.length}
    studentName={key} planName={key} initialPublished={initialPublished} onSave={onSave} />))
}
function select(week: number, dow: number, modifiers: MouseEventInit = {}) {
  act(() => host.querySelector(`[data-block-week="${week}"][data-dow="${dow}"]`)!
    .dispatchEvent(new MouseEvent('click', { bubbles: true, ...modifiers })))
}
function savedRow(weeks: Week[]) { return weeks[0].days[0].rows.find(row => row.name === '竞技深蹲') }
function expectCopiedRow(weeks: Week[]) {
  expect(savedRow(weeks)).toMatchObject({
    name: '竞技深蹲', reps: '3', note: '控制离心',
    intensity: { mode: 'rpe', value: '8', high: '' }, boxes: [{ val: '120', empty: false }],
    serverRowId: null, serverSortOrder: null, hasLogs: false,
    opaqueSets: [{ rest_seconds: 180, coach_note: '组备注' }],
  })
  expect(savedRow(weeks)?.id).not.toBe('source')
  expect(savedRow(weeks)?.opaqueSetBaseline).toBe(sourceWeeks()[0].days[0].rows[0].opaqueSetBaseline)
}

it.each(['row', 'day', 'days'])('copies %s across editor mounts without the system clipboard, preserving set settings at onSave', async (kind) => {
  render('student-A-plan-A', sourceWeeks())
  openBlockDay(host, 1, 0)
  if (kind === 'row') act(() => {
    const row = host.querySelector<HTMLElement>('[data-rowid="source"]')!
    row.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 }))
    row.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, button: 0 }))
    row.click()
  })
  if (kind === 'days') { select(1, 2, { metaKey: true }); select(2, 0, { metaKey: true }) }
  await blockKey('c', { metaKey: true })
  act(() => root.render(null))
  const onSave = vi.fn(async (weeks: Week[]) => ({ changedDays: 1, degradedRows: 0, skippedRows: 0, weeks }))
  const target = blockWeeks([[0, 2]])
  target[0].days[0].rows = [blockRow('target', { isMain: false })]
  target[0].days[2].rows = [blockRow('target-wednesday')]
  render('student-B-plan-B', target, onSave, kind !== 'days')
  select(1, 0)
  await blockKey('v', { metaKey: true })
  if (kind === 'days') expect(host.querySelector('[data-testid="plan-save-status"]')?.textContent).toContain('1 天超出计划范围已跳过')
  expect(onSave).not.toHaveBeenCalled()
  await blockKey('z', { metaKey: true })
  expect(host.textContent).not.toContain('竞技深蹲')
  expect(host.textContent).toContain('target-wednesday')
  await blockKey('z', { metaKey: true, shiftKey: true })
  await blockKey('s', { metaKey: true })
  expect(onSave).toHaveBeenCalledOnce()
  expectCopiedRow(onSave.mock.calls[0][0])
  expect(onSave.mock.calls[0][0][0].days[0].rows).toHaveLength(kind === 'row' ? 2 : 1)
  if (kind === 'row') expect(onSave.mock.calls[0][0][0].days[0].rows.map(row => row.name)).toEqual(['竞技深蹲', 'target'])
  if (kind === 'days') {
    expect(onSave.mock.calls[0][0][0].days[2].rows[0].name).toBe('w1-2-0')
    expect(onSave.mock.calls[0][0]).toHaveLength(1)
  }
})

it.each([false, true])('copies a day from the context menu into an empty/locked target (locked=%s) with one undo', async (locked) => {
  render('plan-A', sourceWeeks())
  act(() => host.querySelector('[data-block-week="1"][data-dow="0"]')!
    .dispatchEvent(new MouseEvent('contextmenu', { bubbles: true })))
  const copy = [...host.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')].find(button => button.textContent === '复制')!
  await act(async () => copy.click())
  const target = blockWeeks([[0]])
  target[0].days[0].rows = locked
    ? [blockRow('locked', { hasLogs: true }), blockRow('editable')]
    : []
  target[0].days[0].serverDayId = 'target-day'
  const onSave = vi.fn(async (weeks: Week[]) => ({ changedDays: 1, degradedRows: 0, skippedRows: 0, weeks }))
  render('plan-B', target, onSave, false)
  select(1, 0)
  vi.mocked(window.confirm).mockClear()
  await blockKey('v', { metaKey: true })
  expect(window.confirm).toHaveBeenCalledTimes(locked ? 1 : 0)
  await blockKey('s', { metaKey: true })
  expectCopiedRow(onSave.mock.calls[0][0])
  expect(onSave.mock.calls[0][0][0].days[0].rows.map(row => row.name))
    .toEqual(locked ? ['locked', '竞技深蹲'] : ['竞技深蹲'])
  await blockKey('z', { metaKey: true })
  await blockKey('s', { metaKey: true })
  expect(onSave.mock.calls[1][0][0].days[0].rows.map(row => row.name))
    .toEqual(locked ? ['locked', 'editable'] : [])
})

it.each([false, true])('preserves external text precedence after remount (different=%s)', async (different) => {
  let text = ''
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: {
    writeText: async (value: string) => { text = value }, readText: async () => text,
  } })
  render('plan-A', sourceWeeks())
  select(1, 0)
  await blockKey('c', { metaKey: true })
  if (different) text = '外部动作\t1\t5\t100'
  const onSave = vi.fn(async (weeks: Week[]) => ({ changedDays: 1, degradedRows: 0, skippedRows: 0, weeks }))
  render('plan-B', blockWeeks([[0]]), onSave)
  select(1, 0)
  await blockKey('v', { metaKey: true })
  await blockKey('s', { metaKey: true })
  if (different) {
    expect(onSave.mock.calls[0][0][0].days[0].rows.map(row => row.name)).toEqual(['w1-0-0', '外部动作'])
  } else expectCopiedRow(onSave.mock.calls[0][0])
})

it.each(['completed', 'paused'] as const)('does not paste into a %s plan after remount', async (planStatus) => {
  render('plan-A', sourceWeeks())
  select(1, 0)
  await blockKey('c', { metaKey: true })
  const onSave = vi.fn()
  act(() => root.render(<PlanEditor key="history" initialWeeks={blockWeeks([[0]])}
    weeksCount={1} studentName="B" planName="history" planStatus={planStatus} onSave={onSave} />))
  select(1, 0)
  await blockKey('v', { metaKey: true })
  await blockKey('s', { metaKey: true })
  expect(onSave).not.toHaveBeenCalled()
  expect(host.querySelector('[data-rowid="w1-0-0"]')).not.toBeNull()
  expect(host.textContent).not.toContain('竞技深蹲')
})
