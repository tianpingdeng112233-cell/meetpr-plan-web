import { act, StrictMode } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { NewPlanDialog } from '../../workspace/PlanDialogs'
import { ExerciseIndex } from '../exerciseIndex'
import * as plans from '../../../api/plans'
import * as catalog from '../../../api/exercises'
import * as pending from '../../../api/pendingRevision'
import * as imports from '../../../api/planImports'
import { ApiException } from '../../../api/client'
import * as XLSX from 'xlsx'
import type { Week } from '../types'
import { readFileSync } from 'node:fs'
import { PlanEditor } from '../PlanEditor'
import { mapPlanToWeeks } from '../mapping'
import { saveBlockPlan } from '../saveBlockPlan'
import { openBlockDay } from '../blockGridTestUtils'
import type { PlanWithChildren } from '../../../api/types'
import type { ImportedPlan } from './ImportPlanDialog'
import { S, setLocale } from '../../../i18n/strings'

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true
vi.mock('../../../api/planImports')
vi.mock('../../../api/plans')
vi.mock('../../../api/exercises')
vi.mock('../../../api/pendingRevision')
const onImported = vi.fn()
let host: HTMLDivElement, root: Root
beforeEach(() => { host = document.createElement('div'); document.body.append(host); root = createRoot(host); vi.clearAllMocks() })
afterEach(() => { act(() => root.unmount()); host.remove(); setLocale('zh') })
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
async function uploadWorkbook(hasContent: boolean) {
  const workbook = XLSX.utils.book_new()
  if (hasContent) XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([['Squat', 120]]), 'Sheet2')
  for (const name of ['Sheet3', 'Sheet4', 'Sheet5', 'Sheet6']) {
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([]), name)
  }
  const buffer = XLSX.write(workbook, { type: 'array', bookType: 'xlsx' })
  await act(async () => {
    const input = host.querySelector<HTMLInputElement>('input[type=file]')!
    Object.defineProperty(input, 'files', { configurable: true, value: [{ name: 'Synthetic.xlsx', size: buffer.byteLength, arrayBuffer: async () => buffer }] })
    input.dispatchEvent(new Event('change', { bubbles: true }))
  })
}
it.each([
  ['zh', '表格里没有内容'],
  ['en', 'This table is empty.'],
] as const)('shows an all-empty file message in %s without calling outline', async (locale, message) => {
  setLocale(locale)
  vi.mocked(imports.getImportStatus).mockResolvedValue({ enabled: true, daily_limit: 3, remaining_today: 3 })
  await render(); await click(S.sheetImport.title); await uploadWorkbook(true)
  await uploadWorkbook(false)
  expect(host.querySelector('[role=alert]')?.textContent).toBe(message)
  expect(button(S.sheetImport.start).disabled).toBe(true)
  await click(S.sheetImport.start)
  expect(imports.outlineImport).not.toHaveBeenCalled()
})
it('sends only content sheets in the outline request for an uploaded workbook', async () => {
  vi.mocked(imports.getImportStatus).mockResolvedValue({ enabled: true, daily_limit: 3, remaining_today: 3 })
  threeWeeks()
  await render(); await click('从表格导入'); await uploadWorkbook(true)
  expect(button('开始识别').disabled).toBe(false)
  await click('开始识别')
  expect(imports.outlineImport).toHaveBeenCalledTimes(1)
  expect(imports.outlineImport).toHaveBeenCalledWith({
    trainee_id: 'trainee', source: 'file', sheets: [{ name: 'Sheet2', cells: [[1, 1, 'Squat'], [1, 2, '120']] }],
  })
})
async function source(index = new ExerciseIndex([]), text = 'Squat\t4*8\t100') {
  vi.mocked(imports.getImportStatus).mockResolvedValue({ enabled: true, daily_limit: 3, remaining_today: 3 })
  await render(index); await click(S.sheetImport.title)
  await act(async () => {
    const event = new Event('paste', { bubbles: true, cancelable: true })
    Object.defineProperty(event, 'clipboardData', { value: { getData: (type: string) => type === 'text/plain' ? text : '' } })
    host.querySelector('textarea')!.dispatchEvent(event)
  })
  await click(S.sheetImport.start)
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
const aiExercise = { source_cells: [] as imports.SourceCell[], name: 'Synthetic squat', sets: 1, reps: '5', intensity_kind: null, intensity_values: [], weight_values: ['100'], note: '', family_guess: 'squat' as const, flags: ['inferred' as const] }
it.each([
  [[1, 1, 0, 1, 1, 0, 0], [false, false, false, true, true, false, false]],
  [[...Array(14).fill(1), ...Array(12).fill(0)], [false, false, ...Array(12).fill(true), ...Array(12).fill(false)]],
  [[0, 0], [false, false]],
])('defaults to the latest contiguous content run and skips trailing empty weeks (%j)', async (trainingDays, expected) => {
  vi.mocked(imports.outlineImport).mockResolvedValue({ import_id: 'run', sheet: 'Paste', truncated_rows: 0, header_region: null,
    weeks: trainingDays.map((training_days, index) => ({ index, label: `W${index + 1}`, start_date: null, training_days, region: { r1: 1, c1: 1, r2: 1, c2: 3 } })) })
  await source()
  expect([...host.querySelectorAll<HTMLInputElement>('input[type=checkbox]')].map(box => box.checked)).toEqual(expected)
  expect(button(S.sheetImport.recognize(expected.filter(Boolean).length)).disabled).toBe(!expected.some(Boolean))
})
function threeWeeks() {
  vi.mocked(imports.outlineImport).mockResolvedValue({ import_id: 'run', sheet: 'Paste', truncated_rows: 0, header_region: { r1: 1, c1: 1, r2: 1, c2: 1 },
    weeks: Array.from({ length: 3 }, (_, index) => ({ index, label: `W${index + 1}`, start_date: '2026-10-19', training_days: 1, region: { r1: 1, c1: 1, r2: 1, c2: 3 } })) })
  vi.mocked(imports.recognizeImportWeeks).mockResolvedValue({ weeks: [
    { index: 0, start_date: '2026-10-19', days: [{ weekday: 0, day_index: 1, rest: false, exercises: [aiExercise] }] },
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
  vi.mocked(imports.recognizeImportWeeks).mockResolvedValueOnce({ weeks: [{ index: 1, start_date: null, days: [{ weekday: 2, day_index: 1, rest: false, exercises: [aiExercise] }] }] })
  await click('改好了，重新识别')
  expect(imports.recognizeImportWeeks).toHaveBeenLastCalledWith('run', { weeks: [{ index: 1, cells: [[1, 1, 'Squat'], [1, 2, '4*8'], [1, 3, '125']] }], header_cells: [[1, 1, 'Squat']] })
  await click('这周先空着，进编辑器填')
  expect(host.textContent).toContain('3 周 · 2 个训练日 · 2 个动作')
  expect(host.textContent).toContain('无内容周')
  expect(host.querySelector('input[type=date]')).not.toBeNull()
  expect(button('创建草稿计划').disabled).toBe(false)
})
it.each([
  ['zh', '这一周没有训练内容'],
  ['en', 'This week has no training content'],
] as const)('treats recognized weeks with zero exercises as failed in %s and supports all recovery actions', async (locale, reason) => {
  setLocale(locale); threeWeeks()
  vi.mocked(imports.recognizeImportWeeks).mockResolvedValueOnce({ weeks: [
    { index: 0, start_date: '2026-10-19', days: [] },
    { index: 1, start_date: '2026-10-26', days: [{ weekday: 0, day_index: 1, rest: false, exercises: [] }] },
    { index: 2, start_date: '2026-11-02', days: [{ weekday: 0, day_index: 1, rest: true, exercises: [] }] },
  ] })
  await source(); await click(S.sheetImport.recognize(3))
  expect([...host.querySelectorAll('.import-failure b')].map(el => el.textContent)).toEqual([1, 2, 3].map(n => S.sheetImport.failed(n, reason)))
  expect(button(S.sheetImport.create).disabled).toBe(true)
  await act(async () => inputValue(host.querySelector<HTMLInputElement>('[aria-label="W1 C1"]')!, '125'))
  vi.mocked(imports.recognizeImportWeeks).mockResolvedValueOnce({ weeks: [{ index: 0, start_date: '2026-10-19', days: [{ weekday: 0, day_index: 1, rest: false, exercises: [aiExercise] }] }] })
  await click(S.sheetImport.retry)
  expect(imports.recognizeImportWeeks).toHaveBeenLastCalledWith('run', { weeks: [{ index: 0, cells: [[1, 1, 'Squat'], [1, 2, '4*8'], [1, 3, '125']] }], header_cells: [[1, 1, 'Squat']] })
  await click(S.sheetImport.leaveEmpty); await click(S.sheetImport.omit)
  expect(host.querySelector('.import-failure')).toBeNull()
  expect(host.querySelector('[data-doubt-count=empty_week] b')?.textContent).toBe('1')
  expect(host.textContent).toContain(S.sheetImport.summary(2, 1, 1))
  expect(button(S.sheetImport.create).disabled).toBe(false)
})

it.each([
  ['zh', '这几周没有训练内容'],
  ['en', 'These weeks have no training content'],
] as const)('blocks creation for an all-empty selection in %s even after leaving weeks empty or omitting them', async (locale, message) => {
  setLocale(locale); threeWeeks()
  vi.mocked(imports.recognizeImportWeeks).mockResolvedValueOnce({ weeks: [0, 1, 2].map(index => ({ index, start_date: '2026-10-19', days: [] })) })
  await source(); await click(S.sheetImport.recognize(3))
  expect(host.textContent).toContain(message)
  expect(button(S.sheetImport.create).disabled).toBe(true)
  await click(S.sheetImport.create)
  expect(plans.createPlan).not.toHaveBeenCalled()
  await click(S.sheetImport.leaveEmpty); await click(S.sheetImport.leaveEmpty); await click(S.sheetImport.omit)
  expect(host.querySelector('.import-failure')).toBeNull()
  expect(host.textContent).toContain(message)
  expect(button(S.sheetImport.create).disabled).toBe(true)
  await click(S.sheetImport.create)
  expect(plans.createPlan).not.toHaveBeenCalled()
  expect(pending.putPendingRevision).not.toHaveBeenCalled()
  expect(onImported).not.toHaveBeenCalled()
})

it('omits a failed middle week and reduces the imported week count', async () => {
  threeWeeks(); await source(); await click('识别这 3 周'); await click('不导这一周'); await click('这周先空着，进编辑器填')
  expect(host.textContent).toContain('2 周 · 1 个训练日 · 1 个动作')
})

it('creates a new draft with both RPE and weight saved, deduplicates custom lifts and never backfills during import', async () => {
  threeWeeks()
  const dualTrack = { ...aiExercise, sets: 2, intensity_kind: 'rpe' as const, intensity_values: ['6', '6'], weight_values: ['227.5', '227.5'] }
  vi.mocked(imports.recognizeImportWeeks).mockResolvedValue({ weeks: [0, 1, 2].map(index => ({ index, start_date: null, days: [{ weekday: 2, day_index: 1, rest: false, exercises: [dualTrack, dualTrack] }] })) })
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
  const savedExercises = vi.mocked(plans.batchDays).mock.calls.flatMap(([, body]) => body.upsert_days.flatMap(day => day.exercises))
  expect(savedExercises).toHaveLength(6)
  for (const saved of savedExercises) {
    expect(saved.sets).toEqual([1, 2].map(set_number => expect.objectContaining({
      set_number, target_reps: 5, load_mode: 'rpe', target_rpe: '6', target_weight: '227.5',
    })))
  }
  expect(plans.markImportedHistory).not.toHaveBeenCalled()
  expect(pending.putPendingRevision).toHaveBeenCalled()
  expect(onImported).toHaveBeenCalledOnce()
  const result = onImported.mock.calls[0][0]
  expect(result.weeks).toHaveLength(3)
  expect(result.weeks[0].days[0].rows[0]).toMatchObject({ exerciseId: 'custom', importDoubts: ['inferred'] })
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
  vi.mocked(imports.recognizeImportWeeks).mockImplementationOnce(async (_id, input) => ({ weeks: input.weeks.map(w => ({ index: w.index, start_date: null, days: [{ weekday: 0, day_index: 1, rest: false, exercises: [aiExercise] }] })) }))
    .mockRejectedValueOnce(new Error('network'))
  await source(); await click('识别这 12 周')
  expect(imports.recognizeImportWeeks).toHaveBeenCalledTimes(2)
  vi.mocked(imports.recognizeImportWeeks).mockImplementation(async (_id, input) => ({ weeks: input.weeks.map(w => ({ index: w.index, start_date: null, days: [{ weekday: 0, day_index: 1, rest: false, exercises: [aiExercise] }] })) }))
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

it.each([
  ['zh', '这张表的格式读不了，试试另存为 .xlsx 或直接粘贴'],
  ['en', 'Unable to read this table format. Try saving it as .xlsx or pasting it directly.'],
] as const)('explains outline validation errors in %s', async (locale, message) => {
  setLocale(locale)
  vi.mocked(imports.getImportStatus).mockResolvedValue({ enabled: true, daily_limit: 3, remaining_today: 3 })
  vi.mocked(imports.outlineImport).mockRejectedValueOnce(new ApiException(400, 'VALIDATION_ERROR'))
  await render(); await click(S.sheetImport.title); await uploadWorkbook(true); await click(S.sheetImport.start)
  expect(host.querySelector('[role=alert]')?.textContent).toBe(message)
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
  vi.mocked(imports.recognizeImportWeeks).mockResolvedValue({ weeks: [0,1,2].map(index => ({ index, start_date: '2026-10-19', days: [{ weekday: 0, day_index: 1, rest: false, exercises: [aiExercise] }] })) })
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

it.each([
  ['zh', false, '全部确认', '已全部确认 · 撤销'],
  ['zh', true, '全部确认', '已全部确认 · 撤销'],
  ['en', false, 'Confirm all', 'All confirmed · Undo'],
  ['en', true, 'Confirm all', 'All confirmed · Undo'],
] as const)('keeps informational counts and allows bulk inferred confirmation in %s (undo=%s)', async (locale, undo, confirmLabel, undoLabel) => {
  setLocale(locale)
  threeWeeks()
  vi.mocked(imports.recognizeImportWeeks).mockResolvedValue({ weeks: [
    { index: 0, start_date: null, days: [{ weekday: 0, day_index: 1, rest: false, exercises: [{ ...aiExercise, flags: ['inferred', 'note_fallback'], note: 'tempo' }] }] },
    { index: 1, error: 'PARSE_FAILED', reason: 'BAD_OUTPUT' },
    { index: 2, error: 'PARSE_FAILED', reason: 'BAD_OUTPUT' },
  ] })
  const draft = { id: 'bulk-confirm', trainee_id: 'trainee', name: 'Synthetic', plan_weeks: 3, start_date: '2026-10-19', end_date: '2026-11-08', status: 'draft', days: [] } as never
  vi.mocked(plans.createPlan).mockResolvedValue(draft); vi.mocked(plans.getPlan).mockResolvedValue(draft); vi.mocked(plans.batchDays).mockResolvedValue(draft)
  vi.mocked(catalog.createCustomExercise).mockResolvedValue({ id: 'custom', name: aiExercise.name, created_by_coach_id: 'coach' } as never)
  await source(); await click(S.sheetImport.recognize(3))
  await click(S.sheetImport.leaveEmpty); await click(S.sheetImport.leaveEmpty)
  expect(host.querySelector('[data-doubt-count=new_exercise] b')?.textContent).toBe('1')
  expect(host.querySelector('[data-doubt-count=new_exercise] small')?.textContent).toBe(aiExercise.name)
  expect(host.querySelector('[data-doubt-count=note_fallback] b')?.textContent).toBe('1')
  expect(host.querySelector('[data-doubt-count=no_date] b')?.textContent).toBe('1')
  expect(button(confirmLabel)?.getAttribute('aria-pressed')).toBe('false')
  await click(confirmLabel)
  expect(button(undoLabel)?.getAttribute('aria-pressed')).toBe('true')
  expect(host.querySelector('[data-doubt-count=inferred] b')?.textContent).toBe('1')
  if (undo) { await click(undoLabel); expect(button(confirmLabel)?.getAttribute('aria-pressed')).toBe('false') }
  await click(S.sheetImport.create)
  expect(onImported).toHaveBeenCalledOnce()
  const weeks: Week[] = onImported.mock.calls[0][0].weeks
  expect(weeks[0].days.flatMap(day => day.rows)[0].importDoubts ?? []).toEqual(undo ? ['inferred'] : [])
  expect(weeks[1].importDoubts).toEqual(['empty_week'])
  expect(weeks[2].importDoubts).toEqual(['empty_week'])
  const saved = vi.mocked(pending.putPendingRevision).mock.calls.at(-1)![1].content.weeks
  expect(saved[0].days.flatMap(day => day.rows)[0].importDoubts ?? []).toEqual(undo ? ['inferred'] : [])
})

function ordinalWeeks(count = 4, weekdayKnown = false, dated = false) {
  vi.mocked(imports.outlineImport).mockResolvedValue({ import_id: 'ordinal', sheet: 'Paste', truncated_rows: 0, header_region: null,
    weeks: [{ index: 0, label: 'W1', start_date: dated ? '2026-10-19' : null, training_days: count, region: { r1: 1, c1: 1, r2: 1, c2: 3 } }] })
  vi.mocked(imports.recognizeImportWeeks).mockResolvedValue({ weeks: [{ index: 0, start_date: dated ? '2026-10-19' : null,
    days: Array.from({ length: count }, (_, index) => ({ weekday: weekdayKnown ? index : null, day_index: index + 1, rest: false, exercises: [{ ...aiExercise, note: `Day${index + 1}` }] })).reverse(),
  }] })
}
function selectedWeekdays() {
  return [...host.querySelectorAll<HTMLButtonElement>('[data-training-weekday][aria-pressed=true]')].map(button => Number(button.dataset.trainingWeekday))
}
it.each([
  [2, [0, 3]], [3, [0, 2, 4]], [4, [0, 2, 4, 5]], [5, [0, 1, 3, 4, 5]], [6, [0, 1, 2, 3, 4, 5]],
])('offers the default spread for %i ordinal training days and requires an exact count', async (count, expected) => {
  ordinalWeeks(count as number); await source(); await click(S.sheetImport.recognize(1))
  expect(host.textContent).toContain(`表里只写了 Day1–Day${count}，没写星期几`)
  expect(host.textContent).toContain('① 每周哪几天练')
  expect(host.textContent).toContain('② 哪天是 D1')
  expect(selectedWeekdays()).toEqual(expected)
  expect(button(S.sheetImport.create).disabled).toBe(false)
  await act(async () => host.querySelector<HTMLButtonElement>('[data-training-weekday="0"]')!.click())
  expect(button(S.sheetImport.create).disabled).toBe(true)
  await click(S.sheetImport.create)
  expect(plans.createPlan).not.toHaveBeenCalled()
  await act(async () => host.querySelector<HTMLButtonElement>('[data-training-weekday="0"]')!.click())
  expect(button(S.sheetImport.create).disabled).toBe(false)
  await act(async () => host.querySelector<HTMLButtonElement>('[data-training-weekday="6"]')!.click())
  expect(button(S.sheetImport.create).disabled).toBe(true)
})
it.each([false, true])('does not offer a weekday picker for known weekdays (dated=%s)', async dated => {
  ordinalWeeks(4, true, dated); await source(); await click(S.sheetImport.recognize(1))
  expect(host.querySelector('[data-training-weekday]')).toBeNull()
  expect(host.querySelector('input[type=date]') !== null).toBe(!dated)
  expect(button(S.sheetImport.create).disabled).toBe(false)
})

it.each([
  ['zh', false, '2026-10-19', [0, 2, 4, 5], ['10/19', '10/21', '10/23', '10/24']],
  ['en', true, '2026-10-22', [3, 6, 0, 1], ['Oct 22', 'Oct 25', 'Oct 26', 'Oct 27']],
] as const)('saves ordinal days on the chosen weekdays and dates in %s (custom=%s)', async (locale, custom, date, weekdays, dates) => {
  setLocale(locale)
  ordinalWeeks()
  const draft = { id: 'ordinal-created', trainee_id: 'trainee', name: 'Synthetic', plan_weeks: 1, start_date: date, status: 'draft', days: [] } as never
  vi.mocked(plans.createPlan).mockResolvedValue(draft); vi.mocked(plans.getPlan).mockResolvedValue(draft); vi.mocked(plans.batchDays).mockResolvedValue(draft)
  vi.mocked(catalog.createCustomExercise).mockResolvedValue({ id: 'custom', name: aiExercise.name, created_by_coach_id: 'coach' } as never)
  await source(); await click(S.sheetImport.recognize(1))
  if (locale === 'en') expect(host.textContent).toContain('The table only says Day1–Day4, without weekdays.')
  if (custom) {
    for (const day of [2, 4, 5, 1, 3, 6]) await act(async () => host.querySelector<HTMLButtonElement>(`[data-training-weekday="${day}"]`)!.click())
    await act(async () => host.querySelector<HTMLButtonElement>('[data-d1="3"]')!.click())
  }
  await act(async () => inputValue(host.querySelector<HTMLInputElement>('input[type=date]')!, date))
  await click(S.sheetImport.create)
  expect(plans.createPlan).toHaveBeenCalledWith(expect.objectContaining({ start_date: date, anchor_weekday: weekdays[0] + 1, plan_weeks: 1 }))
  expect(onImported).toHaveBeenCalledOnce()
  const result = onImported.mock.calls[0][0]
  expect(result.weekdays).toEqual(weekdays)
  const training = (result.weeks as Week[])[0].days.filter(day => day.rows.length)
  expect(training.map(day => day.rows[0].note)).toEqual(['Day1', 'Day2', 'Day3', 'Day4'])
  expect(training.map(day => day.dateLabel)).toEqual(dates)
  const saved = vi.mocked(plans.batchDays).mock.calls.flatMap(([, body]) => body.upsert_days)
  expect(saved.map(day => [day.week_number, day.day_of_week, day.exercises[0].notes])).toEqual(custom
    ? [[1, 1, 'Day1'], [1, 4, 'Day2'], [1, 5, 'Day3'], [1, 6, 'Day4']]
    : [[1, 1, 'Day1'], [1, 3, 'Day2'], [1, 5, 'Day3'], [1, 6, 'Day4']])
})
it('requires the first training date to match D1 and resets its date when D1 changes', async () => {
  ordinalWeeks(); await source(); await click(S.sheetImport.recognize(1))
  const date = host.querySelector<HTMLInputElement>('input[type=date]')!
  await act(async () => inputValue(date, '2026-10-20'))
  expect(button(S.sheetImport.create).disabled).toBe(true)
  expect(host.querySelector('[role=alert]')?.textContent).toBe(S.block.invalidDate)
  await click(S.sheetImport.create)
  expect(plans.createPlan).not.toHaveBeenCalled()
  await act(async () => host.querySelector<HTMLButtonElement>('[data-d1="4"]')!.click())
  expect(new Date(`${date.value}T12:00:00`).getDay()).toBe(5)
  expect(button(S.sheetImport.create).disabled).toBe(false)
})

function unreadableWeek(unreadable: imports.UnreadableExercise[], exercises: imports.AIExercise[] = [aiExercise]) {
  vi.mocked(imports.outlineImport).mockResolvedValue({ import_id: 'rows', sheet: 'Paste', truncated_rows: 0, header_region: null,
    weeks: [{ index: 18, label: 'W19', start_date: '2026-10-19', training_days: 1, region: { r1: 1, c1: 1, r2: 20, c2: 4 } }] })
  vi.mocked(imports.recognizeImportWeeks).mockResolvedValue({ weeks: [{ index: 18, start_date: '2026-10-19',
    days: [{ weekday: 1, day_index: 1, rest: false, exercises }], unreadable,
  }] })
}

it.each([
  ['zh', 'W19 周二 · 负重山羊挺身 4×15 rpe 6789 —— 写的是 4 组，但只认出 3 个 RPE'],
  ['en', 'W19 Tue · 负重山羊挺身 4×15 rpe 6789 —— Expected 4 sets, but only recognized 3 RPE values'],
] as const)('locates unreadable set counts using original local cells in %s', async (locale, message) => {
  setLocale(locale)
  unreadableWeek([{ day_index: 1, weekday: 1, source_cells: [[1,1], [1,2], [1,3]], reason: 'SETS_VALUES_MISMATCH', detail: { track: 'intensity', sets: 4, got: 3 } }])
  await source(new ExerciseIndex([]), '负重山羊挺身\t4×15\trpe 6789'); await click(S.sheetImport.recognize(1))
  expect(host.textContent).toContain(message)
  expect(host.querySelector('.import-failure')).toBeNull()
})

it.each([
  ['zh', 'INVALID_NUMBER', { track: 'weight', value: '10O' }, 'W19 Day 2 · 无名 10O —— 10O 不是有效的数字'],
  ['en', 'INVALID_NUMBER', { track: 'weight', value: '10O' }, 'W19 Day 2 · 无名 10O —— 10O is not a valid number'],
  ['zh', 'MISSING_NAME', {}, 'W19 Day 2 · 无名 10O —— 没找到动作名'],
  ['en', 'MISSING_NAME', {}, 'W19 Day 2 · 无名 10O —— No exercise name found'],
  ['zh', 'MISSING_SETS', {}, 'W19 Day 2 · 无名 10O —— 没找到组数'],
  ['en', 'MISSING_SETS', {}, 'W19 Day 2 · 无名 10O —— No set count found'],
  ['zh', 'OTHER', {}, 'W19 Day 2 · 无名 10O —— 这一行没读懂'],
  ['en', 'OTHER', {}, 'W19 Day 2 · 无名 10O —— This row could not be understood'],
] as const)('explains unreadable %s %s with ordinal day and local text', async (locale, reason, detail, message) => {
  setLocale(locale)
  unreadableWeek([{ day_index: 2, weekday: null, source_cells: [[1,1], [1,3]], reason, detail } as imports.UnreadableExercise])
  await source(new ExerciseIndex([]), '无名\tignored\t10O'); await click(S.sheetImport.recognize(1))
  expect(host.textContent).toContain(message)
})

it('highlights and scrolls exactly to unreadable source cells, then replaces only the edited week', async () => {
  unreadableWeek([{ day_index: 1, weekday: 1, source_cells: [[12,1], [12,3]], reason: 'INVALID_NUMBER', detail: { track: 'weight', value: '10O' } }])
  const ancestorScroll = vi.fn()
  const scroll = vi.fn()
  const bounds = vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
    const cell = this.getAttribute('aria-label') === 'W19 A12'
    return { left: cell ? 700 : 0, right: cell ? 800 : 500, top: cell ? 300 : 0, bottom: cell ? 330 : 160, width: cell ? 100 : 500, height: cell ? 30 : 160, x: 0, y: 0, toJSON() {} }
  })
  Object.defineProperty(HTMLElement.prototype, 'scrollTo', { configurable: true, value: scroll })
  Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', { configurable: true, value: ancestorScroll })
  try {
    await source(new ExerciseIndex([]), ['Squat\t4*8\t100', ...Array(10).fill('heading'), 'Press\t4*8\t10O'].join('\n'))
    await click(S.sheetImport.recognize(1))
    expect([...host.querySelectorAll('[aria-invalid=true]')].map(e => e.getAttribute('aria-label'))).toEqual(['W19 A12', 'W19 C12'])
    expect(ancestorScroll).not.toHaveBeenCalled()
    expect(scroll.mock.contexts[0]).toBe(host.querySelector('.import-cell-scroll'))
    expect(scroll).toHaveBeenCalledWith({ left: 300, top: 170 })
    expect(host.querySelector('.import-dialog')?.scrollLeft).toBe(0)
    expect(host.textContent).toContain('W19 还有 1 个动作没读懂')
    expect(button(S.sheetImport.create).disabled).toBe(true)
    await click(S.sheetImport.create); expect(plans.createPlan).not.toHaveBeenCalled()
    await act(async () => inputValue(host.querySelector<HTMLInputElement>('[aria-label="W19 C12"]')!, '100'))
    expect(scroll).toHaveBeenCalledTimes(1)
    vi.mocked(imports.recognizeImportWeeks).mockResolvedValueOnce({ weeks: [{ index: 18, start_date: '2026-10-19', days: [{ weekday: 1, day_index: 1, rest: false, exercises: [aiExercise] }] }] })
    await click('重新识别这一周')
    expect(imports.recognizeImportWeeks).toHaveBeenLastCalledWith('rows', { weeks: [{ index: 18, cells: expect.arrayContaining([[12,3,'100']]) }], header_cells: [] })
    expect(host.querySelector('.import-unreadable')).toBeNull()
    expect(button(S.sheetImport.create).disabled).toBe(false)
  } finally {
    bounds.mockRestore()
    delete (HTMLElement.prototype as Partial<HTMLElement>).scrollIntoView
    delete (HTMLElement.prototype as Partial<HTMLElement>).scrollTo
  }
})

it.each(['zh', 'en'] as const)('confirms and undoes skipping unreadable exercises in %s without importing them', async locale => {
  setLocale(locale)
  const bad = { ...aiExercise, name: 'Unreadable lift', source_cells: [[1,1], [1,3]] as imports.SourceCell[] }
  unreadableWeek([{ day_index: 1, weekday: 1, source_cells: [[1,1], [1,3]], reason: 'MISSING_SETS', detail: {} }], [aiExercise, bad])
  const confirm = vi.spyOn(window, 'confirm').mockReturnValueOnce(false).mockReturnValue(true)
  const draft = { id: 'skip', trainee_id: 'trainee', name: 'Synthetic', plan_weeks: 1, start_date: '2026-10-19', status: 'draft', days: [] } as never
  vi.mocked(plans.createPlan).mockResolvedValue(draft); vi.mocked(plans.getPlan).mockResolvedValue(draft); vi.mocked(plans.batchDays).mockResolvedValue(draft)
  try {
    await source(new ExerciseIndex([{ id: 'good', name: aiExercise.name } as never])); await click(S.sheetImport.recognize(1))
    const skip = locale === 'zh' ? '跳过这几个动作' : 'Skip these exercises'
    const undo = locale === 'zh' ? '已跳过这几个动作 · 撤销' : 'Exercises skipped · Undo'
    expect(button(S.sheetImport.create).disabled).toBe(true)
    await click(skip); expect(button(S.sheetImport.create).disabled).toBe(true)
    await click(skip); expect(button(S.sheetImport.create).disabled).toBe(false)
    await click(undo); expect(button(S.sheetImport.create).disabled).toBe(true)
    await click(skip); await click(S.sheetImport.create)
    expect(catalog.createCustomExercise).not.toHaveBeenCalled()
    expect(onImported).toHaveBeenCalledOnce()
    const rows = (onImported.mock.calls[0][0].weeks as Week[]).flatMap(w => w.days.flatMap(d => d.rows))
    expect(rows.map(row => row.name)).toEqual([aiExercise.name])
    expect(vi.mocked(plans.batchDays).mock.calls.flatMap(([, body]) => body.upsert_days.flatMap(d => d.exercises)).map(e => e.exercise_id)).toEqual(['good'])
  } finally { confirm.mockRestore() }
})

it('keeps an all-unreadable week in its own editable block and never creates an empty plan after skip', async () => {
  unreadableWeek([{ day_index: 1, weekday: 1, source_cells: [[1,1]], reason: 'MISSING_NAME', detail: {} }], [])
  const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true)
  try {
    await source(); await click(S.sheetImport.recognize(1))
    expect(host.querySelector('.import-failure')).toBeNull()
    expect(host.textContent).toContain('W19 周二 · Squat —— 没找到动作名')
    await click('跳过这几个动作')
    expect(button(S.sheetImport.create).disabled).toBe(true)
    expect(host.textContent).toContain('这几周没有训练内容')
    await click('创建草稿计划'); expect(plans.createPlan).not.toHaveBeenCalled()
  } finally { confirm.mockRestore() }
})


it.each([
  ['zh', 'rpe', 'intensity', 'RPE'], ['zh', 'rir', 'intensity', 'RIR'], ['zh', 'pct', 'intensity', '百分比'],
  ['zh', null, 'intensity', '强度'], ['zh', 'rpe', 'weight', '重量'],
  ['en', 'pct', 'intensity', 'percentage'], ['en', null, 'intensity', 'intensity'], ['en', null, 'weight', 'weight'],
] as const)('names unreadable track in %s (kind=%s, track=%s)', async (locale, intensity_kind, track, label) => {
  setLocale(locale)
  unreadableWeek([{ day_index: 1, weekday: 1, source_cells: [[1,1]], reason: 'SETS_VALUES_MISMATCH', detail: { track, sets: 4, got: 3 } }], [{ ...aiExercise, intensity_kind, source_cells: [[1,1]] }])
  await source(); await click(S.sheetImport.recognize(1))
  expect(host.textContent).toContain(locale === 'zh' ? `写的是 4 组，但只认出 3 个 ${label}` : `Expected 4 sets, but only recognized 3 ${label} values`)
})

it('resolves each unreadable week independently and resets skip when new unreadable results arrive', async () => {
  threeWeeks()
  const unreadable: imports.UnreadableExercise[] = [{ day_index: 1, weekday: 0, source_cells: [[1,1]], reason: 'MISSING_NAME', detail: {} }]
  const good = { index: 0, start_date: '2026-10-19', days: [{ weekday: 0, day_index: 1, rest: false, exercises: [aiExercise] }] }
  vi.mocked(imports.recognizeImportWeeks).mockResolvedValueOnce({ weeks: [good, { ...good, index: 1, unreadable }, { ...good, index: 2, unreadable }] })
  const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true)
  try {
    await source(); await click(S.sheetImport.recognize(3))
    expect(host.querySelectorAll('.import-unreadable')).toHaveLength(2)
    await click('跳过这几个动作')
    expect(host.textContent).not.toContain('W2 还有 1 个动作没读懂')
    expect(host.textContent).toContain('W3 还有 1 个动作没读懂')
    expect(button(S.sheetImport.create).disabled).toBe(true)
    vi.mocked(imports.recognizeImportWeeks).mockResolvedValueOnce({ weeks: [{ ...good, index: 1, unreadable }] })
    await click('重新识别这一周')
    expect(host.textContent).toContain('W2 还有 1 个动作没读懂')
    await click('跳过这几个动作'); await click('跳过这几个动作')
    expect(button(S.sheetImport.create).disabled).toBe(false)
    expect(host.textContent).toContain('3 周 · 3 个训练日 · 3 个动作')
    await click(S.sheetImport.reselect); await click(S.sheetImport.changeSource)
    await click(S.sheetImport.start)
    vi.mocked(imports.recognizeImportWeeks).mockResolvedValueOnce({ weeks: [good, { ...good, index: 1, unreadable }, { ...good, index: 2, unreadable }] })
    await click(S.sheetImport.recognize(3))
    expect(host.textContent).toContain('W2 还有 1 个动作没读懂')
    expect(host.textContent).toContain('W3 还有 1 个动作没读懂')
    expect(button(S.sheetImport.create).disabled).toBe(true)
  } finally { confirm.mockRestore() }
})

it.each([
  ['zh', 'failed', 'rpe', '8', null],
  ['en', '6', 'rir', '2', '80'],
  ['zh', '6', 'pct', '75', '80'],
  ['zh', '6', null, '', '80'],
] as const)('groups repeated texts across selected weeks and applies every fix to every set (%s, %s, %s)', async (locale, reps, kind, value, weight) => {
  setLocale(locale); threeWeeks()
  const exercise = { ...aiExercise, reps: '', sets: 2, note: '原备注', unparsed: [
    { field: 'reps' as const, text: '尽力' }, { field: 'intensity' as const, text: '随意' }, { field: 'weight' as const, text: '随意' },
  ] }
  vi.mocked(imports.recognizeImportWeeks).mockResolvedValue({ weeks: [0, 1, 2].map(index => ({ index, start_date: '2026-10-19', days: [{ weekday: 0, day_index: 1, rest: false, exercises: [exercise, exercise] }] })) })
  const draft = { id: 'created', plan_weeks: 3, start_date: '2026-10-19', status: 'draft', days: [] }
  vi.mocked(plans.createPlan).mockResolvedValue(draft as never)
  vi.mocked(plans.getPlan).mockResolvedValue(draft as never)
  vi.mocked(plans.batchDays).mockResolvedValue(draft as never)
  vi.mocked(catalog.createCustomExercise).mockResolvedValue({ id: 'custom', name: aiExercise.name, created_by_coach_id: 'coach' } as never)
  await source(); await click(S.sheetImport.recognize(3))
  const groups = () => [...host.querySelectorAll<HTMLElement>('[role=group]')].filter(g => g.hasAttribute('data-unparsed-field'))
  expect(groups()).toHaveLength(3)
  expect(groups()[0].textContent).toContain(locale === 'zh' ? '次数写的是『尽力』· 6 个动作' : 'Reps says “尽力” · 6 exercises')
  expect(host.textContent).toContain(locale === 'zh' ? '还有 3 类写法没处理' : '3 text groups still need a fix')
  expect(button(S.sheetImport.create).disabled).toBe(true)
  await click(S.sheetImport.create)
  expect(plans.createPlan).not.toHaveBeenCalled()
  const group = (field: string) => host.querySelector<HTMLElement>(`[data-unparsed-field=${field}]`)!
  const choose = async (field: string, text: string) => act(async () => [...group(field).querySelectorAll('button')].find(b => b.textContent === text)!.click())
  const fill = async (field: string, value: string) => act(async () => inputValue(group(field).querySelector('input')!, value))
  if (reps === 'failed') await choose('reps', locale === 'zh' ? '力竭' : 'To failure')
  else {
    await fill('reps', '0'); expect(button(S.sheetImport.create).disabled).toBe(true)
    await fill('reps', reps)
  }
  expect(button(S.sheetImport.create).disabled).toBe(true)
  if (kind) {
    await act(async () => { const select = group('intensity').querySelector('select')!; select.value = kind; select.dispatchEvent(new Event('change', { bubbles: true })) })
    await fill('intensity', value)
  } else await choose('intensity', locale === 'zh' ? '不设强度' : 'No intensity')
  expect(button(S.sheetImport.create).disabled).toBe(true)
  if (weight) await fill('weight', weight)
  else await choose('weight', locale === 'zh' ? '不设重量' : 'No weight')
  expect(button(S.sheetImport.create).disabled).toBe(false)
  await click(S.sheetImport.create)
  const saved = vi.mocked(plans.batchDays).mock.calls.flatMap(([, body]) => body.upsert_days.flatMap(day => day.exercises))
  expect(saved).toHaveLength(6)
  for (const exercise of saved) {
    expect(exercise.notes).toContain('原备注')
    expect(exercise.notes).toContain('尽力')
    expect(exercise.notes).toContain('随意')
    expect(exercise.sets).toEqual([1, 2].map(set_number => expect.objectContaining({
      set_number, target_reps: reps === 'failed' ? 1 : 6, set_type: reps === 'failed' ? 'failed' : 'working',
      load_mode: kind, target_rpe: kind === 'rpe' ? value : null, rir_target: kind === 'rir' ? value : null,
      target_pct: kind === 'pct' ? value : null, target_weight: weight,
    })))
  }
})


it.each(['unreadable', 'failure'] as const)('W1 contains a wide %s table inside its own scroll container', async kind => {
  const style = document.createElement('style')
  style.textContent = readFileSync('src/features/plan-editor/import/import.css', 'utf8')
  document.head.append(style)
  try {
    if (kind === 'unreadable') unreadableWeek([{ day_index: 1, weekday: 1, source_cells: [[1, 12]], reason: 'OTHER', detail: {} }])
    else threeWeeks()
    vi.mocked(imports.outlineImport).mockResolvedValue({ import_id: 'wide', sheet: 'Paste', truncated_rows: 0, header_region: null,
      weeks: (kind === 'unreadable' ? [18] : [0, 1, 2]).map(index => ({
        index, label: `W${index + 1}`, start_date: '2026-10-19', training_days: 1,
        region: { r1: 1, c1: 1, r2: 1, c2: 20 },
      })),
    })
    await source(new ExerciseIndex([]), Array(20).fill('very-long-source-text-without-spaces'.repeat(4)).join('\t'))
    await click(S.sheetImport.recognize(kind === 'unreadable' ? 1 : 3))
    const dialog = host.querySelector<HTMLElement>('.import-dialog')!
    const block = host.querySelector<HTMLElement>(`.import-${kind}`)!
    const scroller = block.querySelector<HTMLElement>('.import-cell-scroll')!
    expect(scroller.querySelectorAll('thead th')).toHaveLength(21)
    expect(getComputedStyle(dialog).width).toBe('620px')
    expect(getComputedStyle(dialog).gridTemplateColumns).toBe('minmax(0, 1fr)')
    expect(getComputedStyle(block).minWidth).toBe('0')
    expect(getComputedStyle(block).overflowWrap).toBe('anywhere')
    expect(getComputedStyle(scroller).minWidth).toBe('0')
    expect(getComputedStyle(scroller).overflowX).toBe('auto')
  } finally { style.remove() }
})

it.each(['zh', 'en'] as const)('W2 falls back for malformed INVALID_NUMBER details in %s', async locale => {
  setLocale(locale)
  const details = [
    { track: 'weight', value: null }, { track: 'weight' },
    { track: 'weight', value: '' }, { track: 'weight', value: '  ' },
    { track: 'weight', value: false }, { track: 'weight', value: {} },
    { track: 'weight', value: [] }, { track: 'reps', value: 'bad' },
    { value: 'bad' },
  ]
  unreadableWeek(details.map(detail => ({ day_index: 1, weekday: 1, source_cells: [[1, 1]], reason: 'INVALID_NUMBER', detail } as unknown as imports.UnreadableExercise)))
  await source(); await click(S.sheetImport.recognize(1))
  expect([...host.querySelectorAll('.import-unreadable > p')].map(p => p.textContent?.split(' —— ')[1]))
    .toEqual(details.map(() => S.sheetImport.unreadableReasons.OTHER))
})

it.each(['zh', 'en'] as const)('W2 preserves valid string and numeric INVALID_NUMBER details in %s', async locale => {
  setLocale(locale)
  unreadableWeek(['intensity', 'weight'].flatMap(track => ['10O', 0].map(value => ({
    day_index: 1, weekday: 1, source_cells: [[1, 1]], reason: 'INVALID_NUMBER', detail: { track, value },
  } as imports.UnreadableExercise))))
  await source(); await click(S.sheetImport.recognize(1))
  expect([...host.querySelectorAll('.import-unreadable > p')].map(p => p.textContent?.split(' —— ')[1]))
    .toEqual(['10O', 0, '10O', 0].map(value => S.sheetImport.unreadableInvalid(String(value))))
})


// Known W3 regression: remove .fails when the separately authorized fix lands.
it.fails('W3 retains the pending revision and 力竭 after importing degraded rows and remounting the editor', async () => {
  vi.useFakeTimers()
  const stored = new Map<string, string>()
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => stored.get(key) ?? null,
    setItem: (key: string, value: string) => { stored.set(key, value) },
    removeItem: (key: string) => { stored.delete(key) },
    clear: () => stored.clear(), key: (index: number) => [...stored.keys()][index] ?? null,
    get length() { return stored.size },
  } satisfies Storage)
  let remote: pending.PendingRevisionResponse | null = null
  const requests: string[] = []
  vi.mocked(pending.putPendingRevision).mockImplementation(async (id, mirror) => {
    requests.push('PUT')
    remote = { plan_id: id, version: mirror.version, content_hash: mirror.contentHash,
      content: structuredClone(mirror.content), saved_at: new Date().toISOString() }
    return remote
  })
  vi.mocked(pending.getPendingRevision).mockImplementation(async () => { requests.push('GET'); return structuredClone(remote) })
  vi.mocked(pending.deletePendingRevision).mockImplementation(async () => { requests.push('DELETE'); remote = null })
  let tree: PlanWithChildren = {
    id: 'w3-plan', trainee_id: 'trainee', coach_id: 'coach', name: '导入计划', plan_weeks: 1,
    start_date: '2026-10-19', end_date: '2026-10-25', status: 'draft', days: [],
    source: 'coach', source_template_id: null, kind: 'regular', created_at: '2026-10-19T00:00:00Z', updated_at: new Date().toISOString(),
    total_shift_days: 0, latest_shift_created_at: null, latest_shift: null,
  }
  vi.mocked(plans.createPlan).mockImplementation(async () => structuredClone(tree))
  vi.mocked(plans.getPlan).mockImplementation(async () => structuredClone(tree))
  vi.mocked(plans.batchDays).mockImplementation(async (_id, body) => {
    tree = { ...tree, ...body.plan_patch, days: body.upsert_days.map(day => ({
      ...day, id: 'w3-day', plan_id: tree.id, shifted_to_date: null,
      exercises: day.exercises.map(exercise => ({
        ...exercise, id: 'w3-row', plan_day_id: 'w3-day', notes: exercise.notes ?? null,
        target: null, has_logs: false, sets: [],
      })),
    })) }
    return structuredClone(tree)
  })
  const exercise = { ...aiExercise, reps: '', sets: 2, weight_values: [], flags: [],
    unparsed: [{ field: 'reps' as const, text: '尽力' }] }
  unreadableWeek([], [exercise])
  vi.mocked(catalog.createCustomExercise).mockResolvedValue({ id: 'custom', name: exercise.name, created_by_coach_id: 'coach' } as never)
  const names = new Map([['custom', { name: exercise.name, custom: true }]])
  const mountEditor = async (initialWeeks: Week[]) => {
    await act(async () => root.render(<StrictMode><PlanEditor initialWeeks={initialWeeks} weeksCount={1}
      planStartDate={tree.start_date} studentName="Synthetic trainee" planName={tree.name}
      currentPlanId={tree.id} planStatus="draft" planUpdatedAt={tree.updated_at}
      onSave={(weeks, _start, _mark, progress, deletedDayIds) => saveBlockPlan(tree.id, weeks, progress, { catalog: names, deletedDayIds })} /></StrictMode>))
    await act(async () => { await vi.advanceTimersByTimeAsync(3000) })
  }
  try {
    await source(); await click(S.sheetImport.recognize(1)); await click('力竭'); await click(S.sheetImport.create)
    expect(onImported).toHaveBeenCalledOnce()
    const imported = onImported.mock.calls[0][0] as ImportedPlan
    expect(imported.weeks[0].days.flatMap(d => d.rows)[0].reps).toBe('力竭')
    expect(vi.mocked(plans.batchDays).mock.calls[0][1].upsert_days[0].exercises[0].sets).toEqual([])
    expect(await pending.getPendingRevision(tree.id)).not.toBeNull()
    await mountEditor(imported.weeks)
    openBlockDay(host)
    expect(host.querySelector<HTMLInputElement>('[data-c="reps"] input')?.value).toBe('力竭')
    await act(async () => root.render(null))
    await act(async () => { await vi.advanceTimersByTimeAsync(3000) })
    await mountEditor(mapPlanToWeeks(await plans.getPlan(tree.id), names))
    const recovery = [...host.querySelectorAll('button')].find(b => b.textContent === '恢复')
    if (recovery) await act(async () => recovery.click())
    openBlockDay(host)
    expect.soft(await pending.getPendingRevision(tree.id), requests.join(' → ')).not.toBeNull()
    expect.soft(host.querySelector<HTMLInputElement>('[data-c="reps"] input')?.value).toBe('力竭')
  } finally {
    await act(async () => root.render(null))
    vi.useRealTimers()
    vi.mocked(pending.getPendingRevision).mockReset()
    vi.mocked(pending.putPendingRevision).mockReset()
    vi.mocked(pending.deletePendingRevision).mockReset()
    vi.unstubAllGlobals()
  }
})

it.each(['zh', 'en'] as const)('W4 localizes the pasted sheet name in %s without changing the wire name', async locale => {
  setLocale(locale); threeWeeks(); await source()
  expect(host.textContent).toContain(S.sheetImport.found(locale === 'zh' ? '粘贴的表格' : 'Pasted sheet', 3))
  expect(host.textContent).not.toContain(S.sheetImport.found('Paste', 3))
  expect(vi.mocked(imports.outlineImport).mock.calls[0][0].sheets[0].name).toBe('Paste')
})

it('W4 reports a clean publication after save and calendar projection replace the weeks objects', async () => {
  const { blockWeeks } = await import('../blockGridTestUtils')
  const weeks = blockWeeks([[0]])
  const publish = vi.fn(async () => {})
  const save = vi.fn(async (saved: Week[]) => ({
    changedDays: 1, degradedRows: 0, skippedRows: 0,
    weeks: structuredClone(saved).map(week => ({ ...week, days: week.days.map(day => ({ ...day, serverDayId: day.dow === 0 ? 'saved-day' : null })) })),
  }))
  await act(async () => root.render(<PlanEditor initialWeeks={weeks} weeksCount={1} planStartDate="2026-10-19"
    studentName="Synthetic trainee" planName="Synthetic plan" onSave={save} onPublish={publish} />))
  await click('发布给学员')
  expect(save).toHaveBeenCalledOnce()
  expect(publish).toHaveBeenCalledOnce()
  expect(host.querySelector('[data-testid="plan-save-status"]')?.textContent).toBe('已发布给 Synthetic trainee')
  expect(host.querySelector('[data-testid="plan-save-status"]')?.classList.contains('published-dirty')).toBe(false)
})

it('W4 retains edits made while publication is pending and reports them as unpublished', async () => {
  const { blockWeeks } = await import('../blockGridTestUtils')
  let finishPublish!: () => void
  const publishing = new Promise<void>(resolve => { finishPublish = resolve })
  const weeks = blockWeeks([[0]])
  await act(async () => root.render(<PlanEditor initialWeeks={weeks} weeksCount={1} planStartDate="2026-10-19"
    studentName="Synthetic trainee" planName="Synthetic plan"
    onSave={async saved => ({ changedDays: 1, degradedRows: 0, skippedRows: 0, weeks: structuredClone(saved) })}
    onPublish={() => publishing} />))
  await click('发布给学员')
  openBlockDay(host)
  await act(async () => inputValue(host.querySelector<HTMLInputElement>('[data-c="note"] input')!, 'edit during publication'))
  await act(async () => finishPublish())
  expect(host.querySelector<HTMLInputElement>('[data-c="note"] input')?.value).toBe('edit during publication')
  expect(host.querySelector('[data-testid="plan-save-status"]')?.textContent).toBe(S.editor.publishedDirtyLocal('Synthetic trainee'))
  expect(button('更新计划').disabled).toBe(false)
})
