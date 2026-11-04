import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import type { CoachStudent } from '../../../api/types'
import { StudentProfile } from './StudentProfile'
import { S, setLocale } from '../../../i18n/strings'
import { StudentRail } from '../../workspace/StudentRail'
import { OverviewTags } from '../../workspace/OverviewTags'
import { deriveOverviewBoard } from '../../workspace/overviewBoard'

;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true
const student: CoachStudent = { id: 'student-1', display_name: '王学员', alias: '小王', status: 'active', evaluation: null }
let host: HTMLDivElement
let root: Root
beforeEach(() => { vi.stubGlobal('localStorage', { getItem: () => null }); host = document.createElement('div'); document.body.append(host); root = createRoot(host) })
afterEach(() => { act(() => root.unmount()); host.remove(); vi.unstubAllGlobals(); setLocale('zh'); vi.useRealTimers() })
function button(text: string) {
  const found = [...document.querySelectorAll<HTMLButtonElement>('button')].find(el => el.textContent === text)
  if (!found) throw new Error(`Missing button: ${text}`)
  return found
}
it('unbinds only after confirmation and announces success', async () => {
  const fetch = vi.fn().mockResolvedValue(new Response('{}', { status: 200 }))
  vi.stubGlobal('fetch', fetch)
  const updated = vi.fn()
  const toast = vi.fn()
  window.addEventListener('meetpr:toast', toast)
  try {
    await act(async () => root.render(<StudentProfile student={student} onChanged={updated}><p>现有资料</p></StudentProfile>))
    await act(async () => button('解绑').click())
    expect(fetch).not.toHaveBeenCalled()
    const dialog = document.querySelector('[role=dialog]')!
    expect(dialog.textContent).toContain('解绑 小王？')
    expect(dialog.textContent).toContain('对方会收到通知')
    expect(dialog.textContent).toContain('对方 App 会回到输入邀请码页面，训练记录全部保留')
    expect(dialog.textContent).toContain('解绑后你只能查看，不能再编辑或发布计划')
    await act(async () => button('确认解绑').click())
    expect(fetch).toHaveBeenCalledWith(expect.stringContaining('/coach/students/student-1/unbind'), expect.objectContaining({ method: 'POST' }))
    expect(updated).toHaveBeenCalledWith(expect.objectContaining({ id: 'student-1', bond_status: 'ended' }))
    expect(toast.mock.calls[0][0].detail).toBe('已与 小王 解绑')
    expect(document.querySelector('[role=dialog]')).toBeNull()
  } finally { window.removeEventListener('meetpr:toast', toast) }
})

it('disables alias editing and hides unbind for an ended student', async () => {
  await act(async () => root.render(<StudentProfile student={{ ...student, bond_status: 'ended', ended_at: '2026-11-01T12:00:00Z' }} onChanged={vi.fn()}><p>现有资料</p></StudentProfile>))
  expect(button('修改学员备注').disabled).toBe(true)
  expect([...host.querySelectorAll('button')].some(el => el.textContent === '解绑')).toBe(false)
  expect(host.textContent).toContain('已解绑 · 11/01')
  expect(host.textContent).toContain('不进总览、不计入角标与提醒。学员用邀请码重新申请、你接受后恢复编辑。')
})

it.each(['新备注', ''])('saves a private alias and permits clearing it (%s)', async value => {
  const fetch = vi.fn().mockResolvedValue(new Response('{}', { status: 200 }))
  vi.stubGlobal('fetch', fetch)
  const updated = vi.fn()
  await act(async () => root.render(<StudentProfile student={student} onChanged={updated}><p>现有资料</p></StudentProfile>))
  await act(async () => button('修改学员备注').click())
  const input = host.querySelector('input')!
  expect(input).not.toBeNull()
  expect(input.maxLength).toBe(100)
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, value)
    input.dispatchEvent(new Event('input', { bubbles: true }))
  })
  await act(async () => button('保存').click())
  expect(fetch).toHaveBeenCalledWith(expect.stringContaining('/coach/students/student-1'), expect.objectContaining({ method: 'PATCH', body: JSON.stringify({ alias: value || null }) }))
  expect(updated).toHaveBeenCalledWith(expect.objectContaining({ alias: value || null }))
})

// The backend 059 contract is mocked at src/api; no real requests leave these tests.
it('024 sets a past service date via PUT, shows the response and retains it on remount', async () => {
  const { api } = await import('../../../api/client')
  const put = vi.spyOn(api, 'put').mockResolvedValue({ service_until: '2020-01-31' })
  let current = { ...student, service_until: null as string | null }
  const updated = vi.fn(patch => { current = { ...current, ...patch }; render() })
  const render = () => root.render(<StudentProfile student={current} onChanged={updated}><p>现有资料</p></StudentProfile>)
  try {
    await act(async () => render())
    const header = host.querySelector('.student-profile > header')!
    expect(header.nextElementSibling?.textContent).toBe('备注只有你看得到，学员 App 里的名字不变')
    expect(header.nextElementSibling?.nextElementSibling?.classList.contains('service-term-card')).toBe(true)
    await act(async () => button('设置服务期').click())
    expect(header.nextElementSibling?.nextElementSibling?.classList.contains('service-term-card')).toBe(true)
    const input = host.querySelector<HTMLInputElement>('input[type=date]')!
    expect(input).not.toBeNull()
    expect(input.min).toBe('')
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, '2020-01-31')
      input.dispatchEvent(new Event('input', { bubbles: true }))
    })
    await act(async () => button('保存').click())
    expect(put).toHaveBeenCalledWith('/coach/students/student-1/service-term', { service_until: '2020-01-31' })
    expect(updated).toHaveBeenCalledWith({ id: 'student-1', service_until: '2020-01-31' })
    expect(host.textContent).toContain('2020/01/31')
    expect(host.querySelector('input[type=date]')).toBeNull()
    await act(async () => root.render(null))
    await act(async () => render())
    expect(host.textContent).toContain('2020/01/31')
  } finally { put.mockRestore() }
})

it('024 shortcuts use the original date, cancel does not write, and clearing sends null', async () => {
  const { api } = await import('../../../api/client')
  const put = vi.spyOn(api, 'put').mockResolvedValue({ service_until: null })
  const updated = vi.fn()
  try {
    await act(async () => root.render(<StudentProfile student={{ ...student, service_until: '2026-01-31' }} onChanged={updated}>{null}</StudentProfile>))
    await act(async () => button('修改').click())
    await act(async () => button('+1 个月').click())
    expect(host.querySelector<HTMLInputElement>('input[type=date]')?.value).toBe('2026-02-28')
    await act(async () => button('+3 个月').click())
    expect(host.querySelector<HTMLInputElement>('input[type=date]')?.value).toBe('2026-04-30')
    expect(host.textContent).toContain('从原日期 2026/01/31 往后算')
    await act(async () => button('取消').click())
    expect(put).not.toHaveBeenCalled()
    await act(async () => button('修改').click())
    expect(host.querySelector<HTMLInputElement>('input[type=date]')?.value).toBe('2026-01-31')
    await act(async () => button('清除服务期').click())
    expect(put).toHaveBeenCalledWith('/coach/students/student-1/service-term', { service_until: null })
    expect(updated).toHaveBeenCalledWith({ id: 'student-1', service_until: null })
  } finally { put.mockRestore() }
})
it.each([400, 404])('024 preserves edits on failed PUT (%s) and hides the entire term for ended bindings', async status => {
  const { api } = await import('../../../api/client')
  const put = vi.spyOn(api, 'put').mockRejectedValue({ status, code: status === 404 ? 'COACH_STUDENT_NOT_FOUND' : 'INVALID_DATE' })
  const current = { ...student, service_until: '2026-11-07' }
  try {
    await act(async () => root.render(<StudentProfile student={current} onChanged={vi.fn()}>{null}</StudentProfile>))
    await act(async () => button('修改').click())
    await act(async () => button('保存').click())
    expect(host.querySelector('[role=alert]')?.textContent).toBe('保存服务期失败，请稍后重试')
    expect(host.querySelector<HTMLInputElement>('input[type=date]')?.value).toBe('2026-11-07')
    await act(async () => root.render(<StudentProfile student={{ ...current, bond_status: 'ended' }} onChanged={vi.fn()}>{null}</StudentProfile>))
    expect(host.textContent).not.toContain('服务')
    expect(host.querySelector('input[type=date]')).toBeNull()
  } finally { put.mockRestore() }
})

it('024 keeps the profile, rail and overview in sync through save, clear, unbind and rebind', async () => {
  const { api } = await import('../../../api/client')
  const { refreshCoachStudents } = await import('../../../api/coach')
  vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date(2026, 10, 4))
  let serverStudent: CoachStudent = { ...student, service_until: null }
  const put = vi.spyOn(api, 'put').mockImplementation(async (_path, body) => {
    serverStudent = { ...serverStudent, service_until: (body as { service_until: string | null }).service_until }
    return { service_until: serverStudent.service_until } as never
  })
  const get = vi.spyOn(api, 'get').mockImplementation(async () => ({ students: [serverStudent] }) as never)
  const post = vi.spyOn(api, 'post').mockResolvedValue({})
  const render = (current: CoachStudent) => {
    const board = deriveOverviewBoard({ students: [current], dataByStudent: {}, plansByStudent: {}, conversations: [] })
    root.render(<><StudentProfile student={current} onChanged={patch => render({ ...current, ...patch })}>{null}</StudentProfile>
      <StudentRail students={[current]} currentStudentId={current.id} onSelect={vi.fn()} />
      <OverviewTags tags={[...board.attention, ...board.normal][0].tags} onOpen={vi.fn()} /></>)
  }
  try {
    await act(async () => render(serverStudent))
    await act(async () => button('设置服务期').click())
    await act(async () => button('+1 个月').click())
    expect(host.querySelector<HTMLInputElement>('input[type=date]')?.value).toBe('2026-12-04')
    expect(put).not.toHaveBeenCalled()
    await act(async () => button('保存').click())
    expect(host.querySelector('.student-rail-name .service-term-capsule')?.textContent).toBe('剩 30 天')
    expect(host.querySelector('[data-alert-kind=service_term]')?.textContent).toBe('服务剩 30 天')
    // Re-read the contract through GET, then recreate the component (refresh).
    await act(async () => root.render(null))
    await act(async () => render((await refreshCoachStudents())[0]))
    expect(get).toHaveBeenCalledWith('/coach/students')
    expect(host.textContent).toContain('2026/12/04')
    await act(async () => button('修改').click())
    await act(async () => button('清除服务期').click())
    expect(host.querySelector('.student-rail-name .service-term-capsule')).toBeNull()
    expect(host.querySelector('[data-alert-kind=service_term]')).toBeNull()
    // An active term disappears immediately on successful unbind.
    await act(async () => render({ ...serverStudent, service_until: '2026-11-07' }))
    await act(async () => button('解绑').click())
    await act(async () => button('确认解绑').click())
    expect(host.querySelector('.service-term-card')).toBeNull()
    expect(host.querySelector('.service-term-capsule')).toBeNull()
    expect(host.querySelector('[data-alert-kind=service_term]')).toBeNull()
    await act(async () => render({ ...serverStudent, bond_status: 'active', service_until: null }))
    expect(button('设置服务期')).toBeDefined()
    expect(host.querySelector('.service-term-capsule')).toBeNull()
  } finally { put.mockRestore(); get.mockRestore(); post.mockRestore() }
})

it('024 translates all three surfaces when the locale changes and retains service errors in the active locale', async () => {
  const { api } = await import('../../../api/client')
  const put = vi.spyOn(api, 'put').mockRejectedValue(new Error('offline'))
  vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date(2026, 10, 4))
  const current = { ...student, service_until: '2026-11-07' }
  const students = [current]
  try {
    for (const [locale, full, short, label, edit, failure] of [
      ['zh', '服务剩 3 天', '剩 3 天', '服务至', '修改', '保存服务期失败，请稍后重试'],
      ['zh-Hant', '服務剩 3 天', '剩 3 天', '服務至', '修改', '儲存服務期失敗，請稍後重試'],
      ['en', '3 days left', '3 d left', 'Coaching until', 'Edit', "Couldn't save the term. Try again later."],
    ] as const) {
      setLocale(locale)
      const board = deriveOverviewBoard({ students, dataByStudent: {}, plansByStudent: {}, conversations: [] })
      await act(async () => root.render(<><StudentProfile student={current} onChanged={vi.fn()}>{null}</StudentProfile>
        <StudentRail students={students} currentStudentId={current.id} onSelect={vi.fn()} />
        <OverviewTags tags={board.attention[0].tags} onOpen={vi.fn()} /></>))
      expect(host.querySelector('.service-term-card')?.textContent).toContain(label)
      expect(host.querySelector('.service-term-card .service-term-capsule')?.textContent).toBe(full)
      expect(host.querySelector('.student-rail-name .service-term-capsule')?.textContent).toBe(short)
      expect(host.querySelector('[data-alert-kind=service_term]')?.textContent).toBe(full)
      const nameColumn = host.querySelector('.student-rail-name')!
      expect([...nameColumn.children].map(el => el.textContent)).toEqual(['小王', '王学员', short])
      await act(async () => button(edit).click())
      await act(async () => button(S.common.save).click())
      expect(host.querySelector('[role=alert]')?.textContent).toBe(failure)
      await act(async () => button(S.common.cancel).click())
    }
  } finally { put.mockRestore() }
})
