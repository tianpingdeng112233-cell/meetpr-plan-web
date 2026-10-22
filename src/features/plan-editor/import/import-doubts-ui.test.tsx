import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { PlanEditor, findIssueRows } from '../PlanEditor'
import { blockWeeks, openBlockDay } from '../blockGridTestUtils'
import { createDraftMirror, draftContentHash, saveDraftMirror } from '../draftMirror'
import * as pending from '../../../api/pendingRevision'
import { installLocalStorageMock } from '../../../test/localStorageMock'
import type { Week } from '../types'
vi.mock('../../../api/pendingRevision')
let host: HTMLDivElement, root: Root
const makeWeeks = () => { const weeks = blockWeeks([[0]]); weeks[0].days[0].rows[0].importDoubts = ['inferred']; return weeks }
beforeEach(() => {
  installLocalStorageMock(); vi.clearAllMocks(); vi.mocked(pending.getPendingRevision).mockResolvedValue(null)
  vi.mocked(pending.putPendingRevision).mockImplementation(async (_id, mirror) => ({ plan_id: mirror.planId, version: mirror.version, content_hash: mirror.contentHash, saved_at: mirror.savedAt }))
  host = document.createElement('div'); document.body.append(host); root = createRoot(host)
})
afterEach(() => { act(() => root.unmount()); host.remove(); vi.restoreAllMocks() })
async function render(weeks = makeWeeks(), extra = {}) { await act(async () => root.render(<PlanEditor initialWeeks={weeks} weeksCount={1} studentName="Synthetic" planName="Synthetic" planStartDate="2026-10-19" {...extra} />)) }
const click = async (text: string) => { await act(async () => [...host.querySelectorAll('button')].find(b => b.textContent === text)!.click()) }
it('keeps two import doubt tags and confirmation in the trailing cell after notes', async () => {
  const weeks = makeWeeks()
  const row = weeks[0].days[0].rows[0]
  row.name = '很长的自定义动作名称用于检查编辑卡行尾存疑标签'
  row.importDoubts = ['new_exercise', 'inferred']
  await render(weeks)
  openBlockDay(host)
  const main = host.querySelector(`[data-rowid="${row.id}"] .exercise-row-main`)!
  const trailing = main.querySelector(':scope > .gcell[data-c="import-review"]')!
  expect(trailing).not.toBeNull()
  expect(main.lastElementChild).toBe(trailing)
  expect(trailing.previousElementSibling?.getAttribute('data-c')).toBe('note')
  expect([...trailing.querySelectorAll('.import-doubt-label')].map(tag => tag.textContent)).toEqual(['新建动作', '推断数值'])
  expect(trailing.querySelector('button')?.textContent).toBe('确认')
  expect(trailing.querySelector('.import-doubt-label')?.getAttribute('title')).toContain(row.name)
  await act(async () => trailing.querySelector('button')!.click())
  expect(host.querySelector('[data-c="import-review"]')).toBeNull()
})
it('counts import doubts once and clears them when confirmed or edited', async () => {
  expect(findIssueRows(makeWeeks())).toEqual([{ rowId: 'w1-0-0', kind: 'importDoubt' }])
  await render()
  expect(host.textContent).toContain('1 处待核对')
  await click('! 1 处待核对')
  expect(host.textContent).toContain('推断数值')
  await click('确认')
  expect(host.textContent).not.toContain('1 处待核对')
  await act(async () => root.render(null)); await render(); openBlockDay(host)
  const note = host.querySelector<HTMLInputElement>('[data-c=note] input')!
  await act(async () => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(note, 'checked'); note.dispatchEvent(new Event('input', { bubbles: true })) })
  expect(host.textContent).not.toContain('1 处待核对')
})
it('hashes review metadata and restores it from a snapshot without deleting it after save', async () => {
  const weeks = makeWeeks(), plain = blockWeeks([[0]])
  expect(draftContentHash({ weeks, weeksCount: 1, planStartDate: '2026-10-19' })).not.toBe(draftContentHash({ weeks: plain, weeksCount: 1, planStartDate: '2026-10-19' }))
  const mirror = createDraftMirror('import-plan', { weeks, weeksCount: 1, planStartDate: '2026-10-19' })
  vi.mocked(pending.getPendingRevision).mockResolvedValue({ plan_id: 'import-plan', version: mirror.version, content_hash: mirror.contentHash, saved_at: mirror.savedAt, content: mirror.content })
  await render(plain, { currentPlanId: 'import-plan', planUpdatedAt: '2026-10-22T00:00:00Z', onSave: async (saved: Week[]) => ({ weeks: saved, changedDays: 0, skippedRows: 0, degradedRows: 0 }) })
  expect(host.textContent).toContain('1 处待核对')
  expect(pending.deletePendingRevision).not.toHaveBeenCalled()
})
it.each([true, false])('first publication offers default backfill and respects checked=%s', async checked => {
  const publish = vi.fn().mockResolvedValue(undefined), backfill = vi.fn().mockResolvedValue(undefined)
  await render(makeWeeks(), { planStartDate: '2000-01-03', onPublish: publish, onBackfillAfterPublish: backfill })
  await click('发布给学员')
  expect(publish).not.toHaveBeenCalled()
  expect(host.textContent).toContain('过去的周里还有 1 行导入存疑没看')
  const box = host.querySelector<HTMLInputElement>('[data-publish-confirm] input[type=checkbox]')!
  expect(box.checked).toBe(true)
  if (!checked) await act(async () => box.click())
  await act(async () => host.querySelector<HTMLButtonElement>('[data-publish-confirm] button.primary')!.click())
  expect(publish).toHaveBeenCalledOnce()
  expect(backfill).toHaveBeenCalledTimes(checked ? 1 : 0)
})
it('does not offer past-training backfill for future or fully logged days', async () => {
  const publish = vi.fn().mockResolvedValue(undefined)
  const weeks = blockWeeks([[0]]); weeks[0].days[0].rows[0].hasLogs = true
  await render(weeks, { planStartDate: '2000-01-03', onPublish: publish, onBackfillAfterPublish: vi.fn() })
  await click('发布给学员'); expect(host.querySelector('[data-publish-confirm] input')).toBeNull(); expect(publish).toHaveBeenCalledOnce()
  await act(async () => root.render(null)); publish.mockClear()
  await render(blockWeeks([[0]]), { planStartDate: '2099-01-05', onPublish: publish, onBackfillAfterPublish: vi.fn() })
  await click('发布给学员'); expect(host.querySelector('[data-publish-confirm] input')).toBeNull(); expect(publish).toHaveBeenCalledOnce()
})
it('asks once about import doubts when updating a published plan', async () => {
  const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false)
  const save = vi.fn()
  await render(makeWeeks(), { initialPublished: true, onSave: save })
  await click('更新计划')
  expect(confirm).toHaveBeenCalledTimes(1)
  expect(confirm).toHaveBeenCalledWith(expect.stringContaining('还有 1 行导入存疑没看'))
  expect(save).not.toHaveBeenCalled()
})

it('does not let older local review metadata hide newer remote draft edits', async () => {
  const content = { weeks: makeWeeks(), weeksCount: 1, planStartDate: '2026-10-19' }
  saveDraftMirror('import-plan', content, localStorage, () => new Date('2026-10-20T00:00:00Z'))
  const remoteWeeks = makeWeeks(); remoteWeeks[0].days[0].rows[0].note = 'newer remote content'
  const mirror = createDraftMirror('import-plan', { ...content, weeks: remoteWeeks }, () => new Date('2026-10-21T00:00:00Z'))
  vi.mocked(pending.getPendingRevision).mockResolvedValue({ plan_id: 'import-plan', version: mirror.version, content_hash: mirror.contentHash, saved_at: mirror.savedAt, content: mirror.content })
  await render(blockWeeks([[0]]), { currentPlanId: 'import-plan', planUpdatedAt: '2026-10-19T00:00:00Z' })
  openBlockDay(host)
  expect(host.querySelector<HTMLInputElement>('[data-c=note] input')?.value).toBe('newer remote content')
})

it('keeps logged rows reviewable without allowing prescription edits', async () => {
  const weeks = makeWeeks(); weeks[0].days[0].rows[0].hasLogs = true
  await render(weeks)
  expect(findIssueRows(weeks)).toEqual([{ rowId: 'w1-0-0', kind: 'importDoubt' }])
  openBlockDay(host)
  expect(host.querySelector<HTMLInputElement>('[data-c=note] input')?.disabled).toBe(true)
  await click('确认')
  expect(host.textContent).not.toContain('1 处待核对')
})

it('counts, jumps to and confirms an intentionally empty imported week', async () => {
  const weeks = blockWeeks([[]]); weeks[0].importDoubts = ['empty_week']
  await render(weeks)
  expect(findIssueRows(weeks)).toEqual([{ rowId: 'import-week-1', kind: 'importDoubt' }])
  await click('! 1 处待核对'); await click('确认')
  expect(host.textContent).not.toContain('1 处待核对')
})
