import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { PlanEditor } from './PlanEditor'
import { blockWeeks, blockRow, blockCell, blockKey } from './blockGridTestUtils'

let host: HTMLDivElement, root: Root
beforeEach(() => { host = document.createElement('div'); document.body.append(host); root = createRoot(host) })
afterEach(() => { act(() => root.unmount()); host.remove(); vi.restoreAllMocks() })

it.each([true, false])('copies last week via whole-cell shortcuts and confirms occupied targets: %s', async accept => {
  const confirm = vi.spyOn(window, 'confirm').mockReturnValue(accept)
  act(() => root.render(<PlanEditor initialWeeks={blockWeeks([[0],[0]])} weeksCount={2} studentName="学员" planName="计划" />))
  act(() => blockCell(host, 1, 0).click())
  await blockKey('c', { metaKey: true })
  act(() => blockCell(host, 2, 0).click())
  await blockKey('v', { metaKey: true })
  expect(confirm).toHaveBeenCalledTimes(1)
  const name = () => blockCell(host, 2, 0).querySelector<HTMLInputElement>('[data-c="name"] input')?.value
  expect(name()).toBe(accept ? 'w1-0-0' : 'w2-0-0')
  if (accept) { await blockKey('z', { metaKey: true }); expect(name()).toBe('w2-0-0') }
  expect(host.textContent).not.toContain('复制上周计划到本周')
})

it('replaces editable target rows while retaining logged rows and making independent copies', async () => {
  vi.spyOn(window, 'confirm').mockReturnValue(true)
  const weeks = blockWeeks([[0],[0]])
  weeks[1].days[0].rows.unshift(blockRow('logged', { hasLogs: true, serverRowId: 'logged' }))
  act(() => root.render(<PlanEditor initialWeeks={weeks} weeksCount={2} studentName="学员" planName="计划" />))
  act(() => blockCell(host, 1, 0).click()); await blockKey('c', { ctrlKey: true })
  act(() => blockCell(host, 2, 0).click()); await blockKey('v', { ctrlKey: true })
  expect([...blockCell(host, 2, 0).querySelectorAll<HTMLInputElement>('[data-c="name"] input')].map(input => input.value)).toEqual(['logged','w1-0-0'])
  expect(blockCell(host, 2, 0).querySelector<HTMLInputElement>('[data-rowid="logged"] input')?.disabled).toBe(true)
  expect(weeks[1].days[0].rows[1].name).toBe('w2-0-0')
})
