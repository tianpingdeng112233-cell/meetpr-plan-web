import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { PlanEditor } from './PlanEditor'
import { relabelWeeksForStartDate } from './mapping'
import { setLocale } from '../../i18n/locale'
import type { Week } from './types'
import { readFileSync } from 'node:fs'

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

it('floats one video beside unchanged history, highlights the playing set and closes before the edit card', async () => {
  const style = document.createElement('style'); style.textContent = readFileSync('src/features/plan-editor/components/block-history.css', 'utf8')
  const second = { ...session, date: '2026-10-09', sets: [session.sets[0], { ...session.sets[0], set_index: 1, video_id: 'video-2', weight_kg: '190' }] }
  vi.stubGlobal('fetch', vi.fn(async (url: string) => new Response(JSON.stringify(url.includes('/uploads/')
    ? { url: url.includes('video-2') ? '/second.mp4' : '/first.mp4' }
    : { recent_sessions: [session, second], filtered_sessions: [session, second], rep_prs: [], by_set_count: {} }), { status: 200 })))
  await act(async () => root.render(<PlanEditor initialWeeks={weeks} weeksCount={1} studentId="student" studentName="学员" planName="Block" planStartDate="2026-10-19" />))
  // React owns host; keep the stylesheet alongside the rendered editor.
  host.append(style)
  await click(host.querySelector('[data-block-week="1"]')!)
  const input = host.querySelector<HTMLInputElement>('[data-c="reps"] input')!
  await act(async () => { input.focus(); input.setSelectionRange(0, 1) })
  const rail = host.querySelector<HTMLElement>('[data-block-history]')!
  const width = getComputedStyle(rail).width
  const records = [...rail.querySelectorAll<HTMLDetailsElement>('.history-session')]
  const text = records.map(record => record.textContent)
  await click(records[0].querySelector('summary button')!)
  const player = host.querySelector<HTMLElement>('[role="dialog"][aria-label="训练视频"]')!
  expect(player).not.toBeNull()
  expect(rail.contains(player)).toBe(false)
  expect(getComputedStyle(player).position).toBe('fixed')
  expect(getComputedStyle(rail).width).toBe(width)
  expect(records.map(record => record.textContent)).toEqual(text)
  expect(rail.querySelectorAll('.history-session')).toHaveLength(2)
  expect(getComputedStyle(records[0]).backgroundColor).toBe('rgb(255, 251, 235)')
  expect(getComputedStyle(records[0].querySelector('.history-set')!).backgroundColor).toBe('rgb(254, 243, 199)')
  expect(player.textContent).toContain('10/16 · 相扑硬拉 · 第 1 组')
  expect(player.textContent).toContain('210×3 @8')
  expect(player.querySelector('video')?.src).toContain('/first.mp4')
  await click(records[1].querySelector('summary')!)
  await click(records[1].querySelectorAll('.history-set button')[1])
  expect(host.querySelectorAll('[role="dialog"][aria-label="训练视频"]')).toHaveLength(1)
  expect(host.querySelector('[role="dialog"]')).toBe(player)
  expect(player.querySelector('video')?.src).toContain('/second.mp4')
  expect(player.textContent).toContain('10/09 · 相扑硬拉 · 第 2 组')
  expect(records[0].classList.contains('is-playing')).toBe(false)
  expect(records[1].classList.contains('is-playing')).toBe(true)
  expect(records[1].querySelectorAll('.history-set.is-playing')).toHaveLength(1)
  expect(records[1].querySelector('.history-set.is-playing')?.textContent).toContain('190×3 @8')
  expect(records[1].querySelector('.history-set.is-playing button')?.classList.contains('playing')).toBe(true)
  await act(async () => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })))
  expect(host.querySelector('video')).toBeNull()
  expect(host.querySelector('.daygrid')).not.toBeNull()
  expect(document.activeElement).toBe(input)
  expect(input.selectionStart).toBe(0)
  expect(input.selectionEnd).toBe(1)
  await act(async () => input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })))
  expect(host.querySelector('.daygrid')).toBeNull()
})

it.each([
  ['zh', 1440, 900, '第 1 组', '视频进度', '下一帧'],
  ['en', 1024, 600, 'Set 1', 'Video progress', 'Next frame'],
] as const)('fits the %s player in the viewport and supports speed, frame, progress and time controls', async (locale, width, height, setTitle, progressLabel, frameLabel) => {
  setLocale(locale)
  vi.stubGlobal('innerWidth', width); vi.stubGlobal('innerHeight', height)
  const pause = vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {})
  await act(async () => root.render(<PlanEditor initialWeeks={weeks} weeksCount={1} studentId="student" studentName="Athlete" planName="Block" planStartDate="2026-10-19" />))
  const style = document.createElement('style')
  style.textContent = readFileSync('src/features/plan-editor/components/block-history.css', 'utf8'); host.append(style)
  await click(host.querySelector('[data-block-week="1"]')!)
  const input = host.querySelector<HTMLInputElement>('[data-c="reps"] input')!
  await act(async () => input.focus())
  const rail = host.querySelector<HTMLElement>('[data-block-history]')!
  vi.spyOn(rail, 'getBoundingClientRect').mockImplementation(() => ({ left: window.innerWidth - 296, top: 56, width: 296 } as DOMRect))
  await click(rail.querySelector('summary button')!)
  const player = host.querySelector<HTMLElement>('[role="dialog"]')!
  const playerWidth = Number.parseFloat(player.style.width)
  expect(playerWidth).toBe(width === 1440 ? 405 : 237.375)
  expect(Number.parseFloat(player.style.left) + playerWidth).toBe(width - 296 - 8)
  expect(Number.parseFloat(player.style.left)).toBeGreaterThanOrEqual(8)
  expect(Number.parseFloat(player.style.top) + playerWidth * 16 / 9 + 104).toBeLessThanOrEqual(height - 8)
  expect(player.textContent).toContain(setTitle)
  const video = player.querySelector('video')!
  expect(video.autoplay).toBe(true)
  expect(getComputedStyle(video).objectFit).toBe('contain')
  expect(getComputedStyle(video).aspectRatio).toBe('9 / 16')
  expect([...player.querySelectorAll('.video-speeds button')].map(el => el.textContent)).toEqual(['0.25×', '0.5×', '1×', '2×'])
  await click(button('0.25×'))
  expect(video.playbackRate).toBe(0.25)
  expect(document.activeElement).toBe(input)
  Object.defineProperty(video, 'duration', { configurable: true, value: 6 })
  await act(async () => { video.dispatchEvent(new Event('loadedmetadata')); video.currentTime = 2; video.dispatchEvent(new Event('timeupdate')) })
  expect(player.querySelector('time')?.textContent).toBe('0:02 / 0:06')
  await click(player.querySelector(`[aria-label="${frameLabel}"]`)!)
  expect(pause).toHaveBeenCalled()
  expect(video.currentTime).toBeCloseTo(2 + 1 / 30)
  const progress = player.querySelector<HTMLInputElement>(`input[aria-label="${progressLabel}"]`)!
  expect(progress).not.toBeNull()
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(progress, '4')
    progress.dispatchEvent(new Event('input', { bubbles: true }))
  })
  expect(video.currentTime).toBe(4)
  expect(player.querySelector('time')?.textContent).toBe('0:04 / 0:06')
  await act(async () => { vi.stubGlobal('innerHeight', 900); window.dispatchEvent(new Event('resize')) })
  expect(player.style.width).toBe('405px')
  await click(player.querySelector('header button')!)
  expect(host.querySelector('video')).toBeNull()
  expect(host.querySelector('.daygrid')).not.toBeNull()
  expect(document.activeElement).toBe(input)
  await act(async () => input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })))
  expect(host.querySelector('.daygrid')).toBeNull()
})

it.each(['before', 'after', 'progress'])('closes the video before a name field can consume Escape (focus: %s)', async (focusMode) => {
  await act(async () => root.render(<PlanEditor initialWeeks={weeks} weeksCount={1} studentId="student" studentName="学员" planName="Block" planStartDate="2026-10-19" />))
  await click(host.querySelector('[data-block-week="1"]')!)
  const input = host.querySelector<HTMLInputElement>('[data-c="name"] input')!
  await act(async () => (focusMode === 'after' ? host.querySelector<HTMLInputElement>('[data-c="reps"] input')! : input).focus())
  await click(host.querySelector('.history-session summary button')!)
  if (focusMode === 'after') await act(async () => input.focus())
  if (focusMode === 'progress') {
    const video = host.querySelector('video')!
    Object.defineProperty(video, 'duration', { configurable: true, value: 6 })
    await act(async () => video.dispatchEvent(new Event('loadedmetadata')))
    await act(async () => host.querySelector<HTMLInputElement>('.history-progress')!.focus())
    expect(document.activeElement).not.toBe(input)
  }
  expect(host.querySelector('video')).not.toBeNull()
  await act(async () => document.activeElement!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })))
  expect(host.querySelector('video')).toBeNull()
  expect(host.querySelector('.daygrid')).not.toBeNull()
  expect(document.activeElement).toBe(input)
  await act(async () => input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })))
  expect(host.querySelector('.daygrid')).toBeNull()
})

it('highlights only the playing video among separate prescriptions on the same date', async () => {
  const sameDate = { ...session, sets: [{ ...session.sets[0], video_id: 'other-video' }] }
  vi.stubGlobal('fetch', vi.fn(async (url: string) => new Response(JSON.stringify(url.includes('/uploads/') ? { url: '/training.mp4' }
    : { recent_sessions: [session, sameDate], filtered_sessions: [session, sameDate], rep_prs: [], by_set_count: {} }), { status: 200 })))
  await act(async () => root.render(<PlanEditor initialWeeks={weeks} weeksCount={1} studentId="student" studentName="学员" planName="Block" planStartDate="2026-10-19" />))
  await click(host.querySelector('[data-block-week="1"]')!)
  await act(async () => host.querySelector<HTMLInputElement>('[data-c="reps"] input')!.focus())
  const records = host.querySelectorAll('.history-session')
  await click(records[1].querySelector('summary button')!)
  expect(host.querySelectorAll('.history-session.is-playing')).toHaveLength(1)
  expect(records[1].classList.contains('is-playing')).toBe(true)
  expect(host.querySelectorAll('.history-set.is-playing')).toHaveLength(1)
  expect(records[0].querySelector('.playing')).toBeNull()
})

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
