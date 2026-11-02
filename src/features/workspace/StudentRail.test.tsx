import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { expect, it, vi } from 'vitest'
import type { CoachStudent } from '../../api/types'
import { StudentRail } from './StudentRail'

;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true
it('groups training states, marks the current student, and shows collapsed ended matches in search', async () => {
  const storage = new Map<string, string>()
  vi.stubGlobal('localStorage', { getItem: (key: string) => storage.get(key) ?? null, setItem: (key: string, value: string) => storage.set(key, value) })
  const base: CoachStudent = { id: 'rest', display_name: '休息学员', status: 'active', evaluation: null }
  const students: CoachStudent[] = [base,
    { ...base, id: 'done', display_name: '王一鸣', alias: '小王', today: { state: 'completed', completed_at: '2026-11-02T08:00:00Z' }, pending_video_count: 2 },
    { ...base, id: 'scheduled', display_name: '待练学员', today: { state: 'scheduled', completed_at: null } },
    { ...base, id: 'ended', display_name: '王艺明', bond_status: 'ended', ended_at: '2026-11-01T12:00:00Z' },
  ]
  const host = document.createElement('div'); document.body.append(host); const root = createRoot(host)
  const select = vi.fn()
  try {
    await act(async () => root.render(<StudentRail students={students} currentStudentId="done" onSelect={select} />))
    expect([...host.querySelectorAll('h3')].map(el => el.textContent)).toEqual(['今天已完成', '今天有安排', '今天休息'])
    expect(host.querySelector('[aria-current=true]')?.textContent).toContain('小王')
    const endedToggle = [...host.querySelectorAll('button')].find(el => el.textContent?.includes('已解绑 · 1'))!
    expect(endedToggle.getAttribute('aria-expanded')).toBe('false')
    expect(host.textContent).not.toContain('王艺明')
    const input = host.querySelector('input')!
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, 'wym')
      input.dispatchEvent(new Event('input', { bubbles: true }))
    })
    expect(host.textContent).toContain('在训 · 1')
    expect(host.textContent).toContain('已解绑 · 1')
    expect(host.textContent).toContain('解绑于 11/01')
    expect(host.textContent).not.toContain('今天已完成')
    await act(async () => [...host.querySelectorAll('button')].find(el => el.textContent?.includes('王艺明'))!.click())
    expect(select).toHaveBeenCalledWith('ended')
  } finally { act(() => root.unmount()); host.remove(); vi.unstubAllGlobals() }
})

it('reveals the selected ended student and still permits manually collapsing that group', async () => {
  vi.stubGlobal('localStorage', { getItem: () => null, setItem: vi.fn() })
  const host = document.createElement('div'); const root = createRoot(host)
  const student: CoachStudent = { id: 'ended', display_name: '老学员', status: 'active', evaluation: null, bond_status: 'ended', ended_at: '2026-11-01T12:00:00Z' }
  try {
    await act(async () => root.render(<StudentRail students={[student]} currentStudentId="ended" onSelect={vi.fn()} />))
    expect(host.querySelector('[aria-current=true]')?.textContent).toContain('老学员')
    const toggle = host.querySelector<HTMLButtonElement>('.student-rail-ended-toggle')!
    expect(toggle.getAttribute('aria-expanded')).toBe('true')
    await act(async () => toggle.click())
    expect(toggle.getAttribute('aria-expanded')).toBe('false')
  } finally { act(() => root.unmount()); vi.unstubAllGlobals() }
})
