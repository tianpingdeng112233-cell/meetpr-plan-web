import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { PlanEditor } from './PlanEditor'
import { relabelWeeksForStartDate } from './mapping'
import { setLocale } from '../../i18n/locale'
import type { Week } from './types'

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true
let root: Root, host: HTMLDivElement
const weeks: Week[] = relabelWeeksForStartDate([{ num: 1, num2: '01', range: '', isCurrent: false, vol: '', days: [
  { dow: 0, dowLabel: '', dateLabel: '', rest: false, rows: [{ id: 'r', serverRowId: null, serverSortOrder: null, hasLogs: false, conflictMessage: null,
    exerciseId: 'sumo', name: '相扑硬拉', nameEn: 'Sumo deadlift', ku: true, custom: false, isMain: true, aux: false, reps: '3', mode: 'kg',
    boxes: Array.from({length: 4}, () => ({ val: '210', empty: false })), note: '' }] },
] }], '2026-10-19')
const session = { date: '2026-10-16', prescribed: { sets: 4, reps: 3 }, sets: [{set_index: 0, weight_kg: '210', reps: 3, rpe: '8', completed: true, failed: false, assumed: false, has_video: true, video_id: 'video-1'}] }
let requests: string[]
beforeEach(() => {
  const storage = new Map<string, string>()
  vi.stubGlobal('localStorage', { getItem: (key: string) => storage.get(key) ?? null, setItem: (key: string, value: string) => storage.set(key, value), removeItem: (key: string) => storage.delete(key) })
  requests = []
  host = document.createElement('div'); document.body.append(host); root = createRoot(host)
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    requests.push(url)
    return new Response(JSON.stringify(url.includes('/uploads/') ? { url: '/training.mp4' } : { recent_sessions: [{ ...session, date: '2026-10-01' }], filtered_sessions: [session], e1rm: {value: '236'}, rep_prs: [], by_set_count: {} }), {status: 200})
  }))
})
afterEach(() => { act(() => root.unmount()); host.remove(); vi.unstubAllGlobals(); vi.restoreAllMocks(); vi.useRealTimers(); setLocale(undefined) })
const click = async (el: Element) => act(async () => { el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true })); el.dispatchEvent(new MouseEvent('click', { bubbles: true })); await Promise.resolve() })
const button = (text: string) => [...host.querySelectorAll('button')].find(el => el.textContent === text)!

it('keeps history open for a complete row, filters, caches and plays without closing the edit card', async () => {
  await act(async () => root.render(<PlanEditor initialWeeks={weeks} weeksCount={1} studentId="student" studentName="学员" planName="Block" planStartDate="2026-10-19" />))
  expect(host.querySelector('[data-block-history]')).not.toBeNull()
  await click(host.querySelector('[data-block-week="1"]')!)
  const input = host.querySelector<HTMLInputElement>('[data-c="reps"] input')!
  await act(async () => input.focus())
  expect(requests.some(url => url.endsWith('exercise_id=sumo&sets=4&reps=3'))).toBe(true)
  expect(host.querySelector('[data-block-history]')?.textContent).toContain('4×3 · 近 5 次')
  expect(host.querySelector('.history-session')?.textContent).toContain('10/16')
  expect(host.querySelector('.history-session')?.textContent).not.toContain('10/01')
  await click(host.querySelector('[aria-label="播放训练视频"]')!)
  expect(host.querySelector('video')?.getAttribute('src')).toBe('/training.mp4')
  expect(host.querySelector('.daygrid')).not.toBeNull()
  await click(host.querySelector('[aria-label="关闭播放"]')!)
  expect(document.activeElement).toBe(input)
  await click(button('4 组'))
  expect(requests.some(url => url.endsWith('exercise_id=sumo&sets=4'))).toBe(true)
  await act(async () => { input.focus(); input.dispatchEvent(new FocusEvent('focusin', { bubbles: true })) })
  expect(requests.filter(url => url.endsWith('exercise_id=sumo&sets=4&reps=3'))).toHaveLength(1)
  await click(host.querySelector('[aria-label="收起历史"]')!)
  expect(localStorage.getItem('meetpr.plan-editor.rail-mode')).toBe('collapsed')
})

it('reopens a four-by-four empty skeleton and persists settings and column weekday changes', async () => {
  const empty = relabelWeeksForStartDate(Array.from({length: 4}, (_, i) => ({num:i+1, num2:`0${i+1}`, range:'', isCurrent:false, vol:'', days: Array.from({length:7}, (_, dow) => ({dow, dowLabel:'', dateLabel:'', rest:true, rows:[]}))})), '2026-10-25')
  localStorage.setItem('meetpr.plan-editor.weekdays.empty', '[6,1,3,4]')
  const onChangePlanWeeks = vi.fn().mockResolvedValue(undefined)
  const render = async (key: string, count = 4) => act(async () => root.render(<PlanEditor key={key} currentPlanId="empty" initialWeeks={empty.slice(0,count)} weeksCount={count} studentName="学员" planName="Block" planStartDate="2026-10-25" onChangePlanWeeks={onChangePlanWeeks} />))
  await render('first')
  expect(host.querySelectorAll('[data-block-week]')).toHaveLength(16)
  expect([...host.querySelectorAll('.block-column')].map(el => el.textContent)).toEqual(['D1周日', 'D2周二', 'D3周四', 'D4周五'])
  await click(host.querySelector('[data-plan-menu-trigger]')!)
  await click([...document.querySelectorAll('[role="menuitem"]')].find(el => el.textContent === '计划设置（第一练日期 · 周数 · 星期）')!)
  const count = host.querySelector<HTMLInputElement>('input[aria-label="周数"]')!
  act(() => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(count, '3'); count.dispatchEvent(new Event('input', {bubbles:true})) })
  const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true)
  await act(async () => host.querySelector('form')!.dispatchEvent(new Event('submit', {bubbles:true,cancelable:true})))
  expect(confirm).toHaveBeenCalledOnce()
  expect(onChangePlanWeeks).toHaveBeenCalledWith(3)
  expect(host.querySelectorAll('[data-block-week]')).toHaveLength(12)
  await click(host.querySelectorAll('.block-column button')[1])
  const select = host.querySelector<HTMLSelectElement>('.block-column select')!
  act(() => { select.value = '2'; select.dispatchEvent(new Event('change', {bubbles:true})) })
  await render('reopened', 3)
  expect(host.querySelectorAll('[data-block-week]')).toHaveLength(12)
  expect(host.querySelectorAll('.block-column')[1].textContent).toBe('D2周三')
})

it('uses the unfiltered list and video-page fallback on an old backend without 051', async () => {
  const onVideos = vi.fn()
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({recent_sessions:[{...session, sets:[{...session.sets[0], video_id:undefined}]}], rep_prs:[], by_set_count:{}}), {status:200})))
  await act(async () => root.render(<PlanEditor initialWeeks={weeks} weeksCount={1} studentId="student" studentName="学员" planName="Block" planStartDate="2026-10-19" onOpenVideos={onVideos} />))
  await click(host.querySelector('[data-block-week="1"]')!)
  await act(async () => host.querySelector<HTMLInputElement>('[data-c="reps"] input')!.focus())
  expect(host.querySelector('[data-block-history]')?.textContent).toContain('按组次筛选需更新后端')
  await click(host.querySelector('[aria-label="前往视频页"]')!)
  expect(onVideos).toHaveBeenCalledOnce()
  expect(host.querySelector('video')).toBeNull()
})

it('narrows immediately while typing and returns up a level when reps or sets are cleared', async () => {
  await act(async () => root.render(<PlanEditor initialWeeks={weeks} weeksCount={1} studentId="student" studentName="学员" planName="Block" planStartDate="2026-10-19" />))
  await click(host.querySelector('[data-block-week="1"]')!)
  const reps = host.querySelector<HTMLInputElement>('[data-c="reps"] input')!
  const sets = host.querySelector<HTMLInputElement>('[data-c="sets"] input')!
  const input = async (el: HTMLInputElement, value: string) => act(async () => {
    el.focus(); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(el, value); el.dispatchEvent(new Event('input', {bubbles:true}))
  })
  await input(reps, '')
  expect(host.querySelector('[data-block-history] h3')?.textContent).toContain('4 · 近 5 次')
  await input(sets, '')
  expect(host.querySelector('[data-block-history] h3')?.textContent).not.toContain('4 ·')
  expect(requests.some(url => url.endsWith('exercise_id=sumo'))).toBe(true)
  await input(sets, '2')
  expect(requests.some(url => url.endsWith('exercise_id=sumo&sets=2'))).toBe(true)
  await input(reps, '5')
  expect(requests.some(url => url.endsWith('exercise_id=sumo&sets=2&reps=5'))).toBe(true)
})

it('saves changed training dates when weeks and weekdays are applied together', async () => {
  vi.useFakeTimers()
  const initial = structuredClone(weeks)
  initial[0].days.push({...initial[0].days[0], dow:2, rows:[{...initial[0].days[0].rows[0], id:'second'}]})
  const onSave = vi.fn(async (snapshot: Week[]) => ({weeks:snapshot, skippedRows:0, degradedRows:0, changedDays:1}))
  const onChangePlanWeeks = vi.fn().mockResolvedValue(undefined)
  await act(async () => root.render(<PlanEditor initialWeeks={initial} weeksCount={1} studentName="学员" planName="Block" planStartDate="2026-10-19" onSave={onSave} onChangePlanWeeks={onChangePlanWeeks} />))
  await click(host.querySelector('[data-plan-menu-trigger]')!)
  await click([...document.querySelectorAll('[role="menuitem"]')].find(el => el.textContent?.startsWith('计划设置'))!)
  const count = host.querySelector<HTMLInputElement>('input[aria-label="周数"]')!
  act(() => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(count, '2'); count.dispatchEvent(new Event('input', {bubbles:true})) })
  await click(host.querySelector('[data-training-weekday="2"]')!)
  await click(host.querySelector('[data-training-weekday="3"]')!)
  await act(async () => host.querySelector('form')!.dispatchEvent(new Event('submit', {bubbles:true,cancelable:true})))
  await act(async () => { await vi.advanceTimersByTimeAsync(2500) })
  expect(onChangePlanWeeks).toHaveBeenCalledWith(2)
  expect(onSave).toHaveBeenCalledOnce()
  expect(onSave.mock.calls[0][0][0].days.find(day => day.dow === 3)?.rows[0].id).toBe('second')
  expect(onSave.mock.calls[0][0]).toHaveLength(2)
  vi.useRealTimers()
})

it('rejects removing a populated Dx without writing metadata or losing its rows', async () => {
  const initial = structuredClone(weeks)
  initial[0].days.push({...initial[0].days[0], dow:2, rows:[{...initial[0].days[0].rows[0], id:'second'}]})
  const onChangePlanWeeks = vi.fn()
  await act(async () => root.render(<PlanEditor initialWeeks={initial} weeksCount={1} studentName="学员" planName="Block" planStartDate="2026-10-19" onChangePlanWeeks={onChangePlanWeeks} />))
  await click(host.querySelector('[data-plan-menu-trigger]')!)
  await click([...document.querySelectorAll('[role="menuitem"]')].find(el => el.textContent?.startsWith('计划设置'))!)
  await click(host.querySelector('[data-training-weekday="2"]')!)
  await act(async () => host.querySelector('form')!.dispatchEvent(new Event('submit', {bubbles:true,cancelable:true})))
  expect(host.querySelector('[role="alert"]')?.textContent).toContain('移除仍有内容的 Dx')
  expect(host.querySelector('[data-rowid="second"]')).not.toBeNull()
  expect(onChangePlanWeeks).not.toHaveBeenCalled()
})

it('renders the new history and plan settings controls in English', async () => {
  setLocale('en')
  await act(async () => root.render(<PlanEditor initialWeeks={weeks} weeksCount={1} studentId="student" studentName="Athlete" planName="Block" planStartDate="2026-10-19" />))
  expect(host.querySelector('[data-block-history]')?.textContent).toContain('History')
  await click(host.querySelector('[data-block-week="1"]')!)
  await act(async () => host.querySelector<HTMLInputElement>('[data-c="reps"] input')!.focus())
  expect(host.querySelector('[data-block-history]')?.textContent).toContain('Sumo deadlift')
  expect(host.querySelector('[data-block-history]')?.textContent).toContain('Last 5 sessions')
  await click(host.querySelector('[data-plan-menu-trigger]')!)
  await click([...document.querySelectorAll('[role="menuitem"]')].find(el => el.textContent?.startsWith('Plan settings'))!)
  expect(host.querySelector('[role="dialog"]')?.textContent).toContain('Training weekdays')
  expect(host.querySelector('[role="dialog"]')?.textContent).toContain('First training date')
})

it('applies a first-date change and weekday change together without retaining old date labels', async () => {
  const initial = structuredClone(weeks)
  initial[0].days.push({...initial[0].days[0], dow:2, rows:[{...initial[0].days[0].rows[0], id:'second'}]})
  const onChangeStartDate = vi.fn().mockResolvedValue(undefined)
  await act(async () => root.render(<PlanEditor initialWeeks={relabelWeeksForStartDate(initial, '2026-10-19')} weeksCount={1} studentName="学员" planName="Block" planStartDate="2026-10-19" onChangeStartDate={onChangeStartDate} />))
  await click(host.querySelector('[data-plan-menu-trigger]')!)
  await click([...document.querySelectorAll('[role="menuitem"]')].find(el => el.textContent?.startsWith('计划设置'))!)
  const date = host.querySelector<HTMLInputElement>('input[type="date"]')!
  act(() => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(date, '2026-10-26'); date.dispatchEvent(new Event('change', {bubbles:true})) })
  await click(host.querySelector('[data-training-weekday="2"]')!)
  await click(host.querySelector('[data-training-weekday="3"]')!)
  await act(async () => host.querySelector('form')!.dispatchEvent(new Event('submit', {bubbles:true,cancelable:true})))
  expect(onChangeStartDate).toHaveBeenCalledWith('2026-10-26')
  expect(host.querySelector('[data-dx="0"] .block-date')?.textContent).toBe('10/26')
  expect(host.querySelector('[data-dx="1"] .block-date')?.textContent).toBe('10/29')
})
