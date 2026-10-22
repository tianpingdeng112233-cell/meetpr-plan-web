import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { NewPlanDialog } from '../../workspace/PlanDialogs'
import { ExerciseIndex } from '../exerciseIndex'
import * as plans from '../../../api/plans'
import * as catalog from '../../../api/exercises'
import * as pending from '../../../api/pendingRevision'
import * as imports from '../../../api/planImports'
import { ApiException } from '../../../api/client'

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true
vi.mock('../../../api/planImports')
vi.mock('../../../api/plans')
vi.mock('../../../api/exercises')
vi.mock('../../../api/pendingRevision')
const onImported = vi.fn()
let host: HTMLDivElement, root: Root
beforeEach(() => { host = document.createElement('div'); document.body.append(host); root = createRoot(host); vi.clearAllMocks() })
afterEach(() => { act(() => root.unmount()); host.remove() })
async function render(index = new ExerciseIndex([])) {
  await act(async () => root.render(<NewPlanDialog open studentName="Synthetic trainee" traineeId="trainee" exerciseIndex={index} onImported={onImported} onClose={vi.fn()} onCreate={vi.fn()} />))
}
function button(text: string) { return [...host.querySelectorAll('button')].find(b => b.textContent === text)! }
it('hides import when disabled and disables recognition when the quota is zero', async () => {
  vi.mocked(imports.getImportStatus).mockResolvedValue({ enabled: false, daily_limit: 3, remaining_today: 0 })
  await render()
  expect(host.textContent).not.toContain('从表格导入')
  expect(imports.getImportStatus).toHaveBeenCalledWith('trainee')
  await act(async () => root.render(null))
  vi.mocked(imports.getImportStatus).mockResolvedValue({ enabled: true, daily_limit: 3, remaining_today: 0 })
  await render()
  await act(async () => button('从表格导入').click())
  expect(button('今天的次数用完了，明天再来').disabled).toBe(true)
})

async function click(text: string) { await act(async () => button(text).click()) }
async function source(index = new ExerciseIndex([])) {
  vi.mocked(imports.getImportStatus).mockResolvedValue({ enabled: true, daily_limit: 3, remaining_today: 3 })
  await render(index); await click('从表格导入')
  await act(async () => {
    const event = new Event('paste', { bubbles: true, cancelable: true })
    Object.defineProperty(event, 'clipboardData', { value: { getData: (type: string) => type === 'text/plain' ? 'Squat\t4*8\t100' : '' } })
    host.querySelector('textarea')!.dispatchEvent(event)
  })
  await click('开始识别')
}
it('defaults to the latest 12 consecutive weeks and sends cells without a filename', async () => {
  vi.mocked(imports.outlineImport).mockResolvedValue({ import_id: 'run', sheet: 'Paste', truncated_rows: 2, header_region: null,
    weeks: Array.from({ length: 14 }, (_, index) => ({ index, label: `W${index + 1}`, start_date: null, training_days: 3, region: { r1: 1, c1: 1, r2: 3, c2: 3 } })) })
  await source()
  expect(imports.outlineImport).toHaveBeenCalledWith({ trainee_id: 'trainee', source: 'paste', sheets: [{ name: 'Paste', cells: [[1, 1, 'Squat'], [1, 2, '4*8'], [1, 3, '100']] }] })
  expect(host.textContent).toContain('已选 12 周 / 最多 12 周')
  expect(host.textContent).toContain('表格较长，只识别了最后一部分')
  const boxes = [...host.querySelectorAll<HTMLInputElement>('input[type=checkbox]')]
  expect(boxes.map(b => b.checked)).toEqual([false, false, ...Array(12).fill(true)])
  await act(async () => boxes[7].click())
  expect(boxes[7].checked).toBe(true)
  await act(async () => boxes[1].click())
  expect(boxes[1].checked).toBe(false)
  await act(async () => boxes[13].click())
  expect(host.textContent).toContain('已选 11 周 / 最多 12 周')
})
const aiExercise = { name: 'Synthetic squat', sets: 1, reps: '5', mode: 'kg' as const, values: ['100'], note: '', family_guess: 'squat' as const, flags: ['inferred' as const] }
function threeWeeks() {
  vi.mocked(imports.outlineImport).mockResolvedValue({ import_id: 'run', sheet: 'Paste', truncated_rows: 0, header_region: { r1: 1, c1: 1, r2: 1, c2: 1 },
    weeks: Array.from({ length: 3 }, (_, index) => ({ index, label: `W${index + 1}`, start_date: '2026-10-19', training_days: 1, region: { r1: 1, c1: 1, r2: 1, c2: 3 } })) })
  vi.mocked(imports.recognizeImportWeeks).mockResolvedValue({ weeks: [
    { index: 0, start_date: '2026-10-19', days: [{ weekday: 0, rest: false, exercises: [aiExercise] }] },
    { index: 1, error: 'PARSE_FAILED', reason: 'REGION_SUSPECT' },
    { index: 2, error: 'PARSE_FAILED', reason: 'MODEL_BUSY' },
  ] })
}
function inputValue(input: HTMLInputElement, value: string) {
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, value)
  input.dispatchEvent(new Event('input', { bubbles: true }))
}
it('shows failed source cells and sends only the edited failed week on retry', async () => {
  threeWeeks(); await source(); await click('识别这 3 周')
  expect(host.textContent).toContain('这一周的范围可能切歪了')
  expect(host.textContent).toContain('DeepSeek 暂时没响应')
  expect(button('创建草稿计划').disabled).toBe(true)
  const cell = host.querySelector<HTMLInputElement>('[aria-label="W2 C1"]')!
  await act(async () => inputValue(cell, '125'))
  vi.mocked(imports.recognizeImportWeeks).mockResolvedValueOnce({ weeks: [{ index: 1, start_date: null, days: [{ weekday: 2, rest: false, exercises: [aiExercise] }] }] })
  await click('改好了，重新识别')
  expect(imports.recognizeImportWeeks).toHaveBeenLastCalledWith('run', { weeks: [{ index: 1, cells: [[1, 1, 'Squat'], [1, 2, '4*8'], [1, 3, '125']] }], header_cells: [[1, 1, 'Squat']] })
  await click('这周先空着，进编辑器填')
  expect(host.textContent).toContain('3 周 · 2 个训练日 · 2 个动作')
  expect(host.textContent).toContain('无内容周')
  expect(host.querySelector('input[type=date]')).not.toBeNull()
  expect(button('创建草稿计划').disabled).toBe(false)
})
it('omits a failed middle week and reduces the imported week count', async () => {
  threeWeeks(); await source(); await click('识别这 3 周'); await click('不导这一周'); await click('这周先空着，进编辑器填')
  expect(host.textContent).toContain('2 周 · 1 个训练日 · 1 个动作')
})

it('creates a new draft, deduplicates custom lifts, saves the snapshot and never backfills during import', async () => {
  threeWeeks()
  vi.mocked(imports.recognizeImportWeeks).mockResolvedValue({ weeks: [0, 1, 2].map(index => ({ index, start_date: null, days: [{ weekday: 2, rest: false, exercises: [aiExercise, aiExercise] }] })) })
  const draft = { id: 'created', trainee_id: 'trainee', name: '导入计划', plan_weeks: 3, start_date: '2026-10-21', end_date: '2026-11-10', status: 'draft', days: [] }
  vi.mocked(plans.createPlan).mockResolvedValue(draft as never)
  vi.mocked(plans.getPlan).mockResolvedValue(draft as never)
  vi.mocked(plans.batchDays).mockResolvedValue(draft as never)
  vi.mocked(catalog.createCustomExercise).mockResolvedValue({ id: 'custom', name: aiExercise.name, created_by_coach_id: 'coach', main_lift_family: 'squat' } as never)
  await source(); await click('识别这 3 周')
  await act(async () => inputValue(host.querySelector<HTMLInputElement>('input[type=date]')!, '2026-10-21'))
  expect(host.querySelector('[data-doubt-count=new_exercise]')?.textContent).toContain('1')
  await click('创建草稿计划')
  expect(plans.createPlan).toHaveBeenCalledWith(expect.objectContaining({ trainee_id: 'trainee', name: '导入计划', plan_weeks: 3, start_date: '2026-10-21' }))
  expect(catalog.createCustomExercise).toHaveBeenCalledTimes(1)
  expect(catalog.createCustomExercise).toHaveBeenCalledWith({ name: aiExercise.name, exerciseType: 'main_lift_variation', mainLiftFamily: 'squat' })
  expect(plans.batchDays).toHaveBeenCalled()
  expect(plans.markImportedHistory).not.toHaveBeenCalled()
  expect(pending.putPendingRevision).toHaveBeenCalled()
  expect(onImported).toHaveBeenCalledOnce()
  const result = onImported.mock.calls[0][0]
  expect(result.weeks).toHaveLength(3)
  expect(result.weeks[0].days[0].rows[0]).toMatchObject({ exerciseId: 'custom', importDoubts: ['new_exercise', 'inferred'] })
  expect(result.weekdays).toEqual([2])
})

it('isolates edited source cells and empty-week decisions when replacing a spreadsheet', async () => {
  threeWeeks(); await source(); await click('识别这 3 周')
  await act(async () => inputValue(host.querySelector<HTMLInputElement>('[aria-label="W2 C1"]')!, 'old source edit'))
  await click('这周先空着，进编辑器填')
  await click('← 重新选周'); await click('← 换一个表格')
  await act(async () => {
    const event = new Event('paste', { bubbles: true, cancelable: true })
    Object.defineProperty(event, 'clipboardData', { value: { getData: (type: string) => type === 'text/plain' ? 'New source\t5\t200' : '' } })
    host.querySelector('textarea')!.dispatchEvent(event)
  })
  await click('开始识别'); await click('识别这 3 周')
  expect(imports.recognizeImportWeeks).toHaveBeenLastCalledWith('run', expect.objectContaining({ weeks: [0,1,2].map(index => ({ index, cells: [[1,1,'New source'],[1,2,'5'],[1,3,'200']] })) }))
  expect(host.querySelector('[data-doubt-count=empty_week]')).toBeNull()
})

it('retains completed batches and retries only unresolved weeks after a transport failure', async () => {
  vi.mocked(imports.outlineImport).mockResolvedValue({ import_id: 'run', sheet: 'Paste', truncated_rows: 0, header_region: null,
    weeks: Array.from({ length: 12 }, (_, index) => ({ index, label: `W${index + 1}`, start_date: null, training_days: 1, region: { r1: 1, c1: 1, r2: 1, c2: 3 } })) })
  vi.mocked(imports.recognizeImportWeeks).mockImplementationOnce(async (_id, input) => ({ weeks: input.weeks.map(w => ({ index: w.index, start_date: null, days: [] })) }))
    .mockRejectedValueOnce(new Error('network'))
  await source(); await click('识别这 12 周')
  expect(imports.recognizeImportWeeks).toHaveBeenCalledTimes(2)
  vi.mocked(imports.recognizeImportWeeks).mockImplementation(async (_id, input) => ({ weeks: input.weeks.map(w => ({ index: w.index, start_date: null, days: [] })) }))
  await click('识别这 12 周')
  expect(imports.recognizeImportWeeks).toHaveBeenCalledTimes(4)
  expect(vi.mocked(imports.recognizeImportWeeks).mock.calls[2][1].weeks.map(w => w.index)).toEqual([4,5,6,7])
  expect(button('创建草稿计划').disabled).toBe(false)
})

it('keeps the reduced daily quota when switching back to manual and import', async () => {
  threeWeeks(); await source(); await click('← 换一个表格')
  expect(host.textContent).toContain('导入 2 次')
  await click('手动新建'); await click('从表格导入')
  expect(host.textContent).toContain('导入 2 次')
})
it('handles malformed WPS files with the save-as hint', async () => {
  vi.mocked(imports.getImportStatus).mockResolvedValue({ enabled: true, daily_limit: 3, remaining_today: 3 })
  await render(); await click('从表格导入')
  await act(async () => {
    const input = host.querySelector<HTMLInputElement>('input[type=file]')!
    Object.defineProperty(input, 'files', { value: [{ name: 'Synthetic.et', size: 12, arrayBuffer: async () => { throw new Error('invalid workbook') } }] })
    input.dispatchEvent(new Event('change', { bubbles: true }))
  })
  expect(host.textContent).toContain('请在 WPS 里另存为 .xlsx')
  expect(button('开始识别').disabled).toBe(true)
})

it.each([
  [422, 'NO_TRAINING_WEEKS', '没有识别到训练周'],
  [429, 'IMPORT_DAILY_LIMIT', '今天的次数用完了'],
  [413, 'PAYLOAD_TOO_LARGE', '表格内容太多'],
  [502, 'PARSE_FAILED', 'DeepSeek 暂时没响应'],
])('shows the outline error %s %s without creating a plan', async (status, code, message) => {
  vi.mocked(imports.outlineImport).mockRejectedValueOnce(new ApiException(Number(status), String(code), { reason: 'MODEL_BUSY' }))
  await source()
  expect(host.querySelector('[role=alert]')?.textContent).toContain(message)
  expect(plans.createPlan).not.toHaveBeenCalled()
})

it('excludes deselected empty weeks from the summary', async () => {
  threeWeeks(); await source(); await click('识别这 3 周')
  await click('这周先空着，进编辑器填'); await click('这周先空着，进编辑器填')
  await click('← 重新选周')
  await act(async () => host.querySelector<HTMLInputElement>('[aria-label=W3]')!.click())
  await click('识别这 2 周')
  expect(host.querySelector('[data-doubt-count=empty_week] b')?.textContent).toBe('1')
})

it('reuses an existing coach custom exercise and never creates a duplicate', async () => {
  threeWeeks()
  vi.mocked(imports.recognizeImportWeeks).mockResolvedValue({ weeks: [0,1,2].map(index => ({ index, start_date: '2026-10-19', days: [{ weekday: 0, rest: false, exercises: [aiExercise] }] })) })
  const existing = { id: 'existing-custom', name: aiExercise.name, created_by_coach_id: 'coach', main_lift_family: 'squat' } as never
  const draft = { id: 'reuse', trainee_id: 'trainee', name: 'Synthetic', plan_weeks: 3, start_date: '2026-10-19', end_date: '2026-11-08', status: 'draft', days: [] } as never
  vi.mocked(plans.createPlan).mockResolvedValue(draft); vi.mocked(plans.getPlan).mockResolvedValue(draft); vi.mocked(plans.batchDays).mockResolvedValue(draft)
  await source(new ExerciseIndex([existing])); await click('识别这 3 周'); await click('创建草稿计划')
  expect(catalog.createCustomExercise).not.toHaveBeenCalled()
  expect(onImported.mock.calls[0][0].weeks[0].days[0].rows[0].exerciseId).toBe('existing-custom')
})
it('strips accidental file metadata at the API boundary', async () => {
  const { api } = await import('../../../api/client')
  const post = vi.spyOn(api, 'post').mockResolvedValue({})
  const real = await vi.importActual<typeof imports>('../../../api/planImports')
  await real.outlineImport({ trainee_id: 'synthetic', source: 'file', sheets: [{ name: 'Training', cells: [[1,1,'Squat']] }], filename: 'Synthetic.xlsx' } as never)
  expect(post).toHaveBeenCalledWith('/coach/plan-imports', { trainee_id: 'synthetic', source: 'file', sheets: [{ name: 'Training', cells: [[1,1,'Squat']] }] }, { retryRateLimit: false })
  post.mockRestore()
})
