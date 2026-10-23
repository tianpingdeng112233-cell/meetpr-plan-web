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
import * as XLSX from 'xlsx'
import type { Week } from '../types'
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
async function source(index = new ExerciseIndex([])) {
  vi.mocked(imports.getImportStatus).mockResolvedValue({ enabled: true, daily_limit: 3, remaining_today: 3 })
  await render(index); await click(S.sheetImport.title)
  await act(async () => {
    const event = new Event('paste', { bubbles: true, cancelable: true })
    Object.defineProperty(event, 'clipboardData', { value: { getData: (type: string) => type === 'text/plain' ? 'Squat\t4*8\t100' : '' } })
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
const aiExercise = { name: 'Synthetic squat', sets: 1, reps: '5', intensity_kind: null, intensity_values: [], weight_values: ['100'], note: '', family_guess: 'squat' as const, flags: ['inferred' as const] }
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
