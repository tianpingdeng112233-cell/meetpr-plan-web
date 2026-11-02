import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import type { CoachStudent } from '../../../api/types'
import { StudentProfile } from './StudentProfile'

;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true
const student: CoachStudent = { id: 'student-1', display_name: '王学员', alias: '小王', status: 'active', evaluation: null }
let host: HTMLDivElement
let root: Root
beforeEach(() => { vi.stubGlobal('localStorage', { getItem: () => null }); host = document.createElement('div'); document.body.append(host); root = createRoot(host) })
afterEach(() => { act(() => root.unmount()); host.remove(); vi.unstubAllGlobals() })
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
