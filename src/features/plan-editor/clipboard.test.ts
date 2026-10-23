import { describe, expect, it } from 'vitest'
import type { ExerciseResponse } from '../../api/types'
import type { ExerciseRow } from './types'
import { ExerciseIndex } from './exerciseIndex'
import {
  formatTranslatedDaysPasteStatus,
  parseClipboardRows,
  serializeRowsForClipboard,
} from './clipboard'

function exercise(id: string, name: string): ExerciseResponse {
  return {
    id,
    name,
    name_en: null,
    exercise_type: 'accessory',
    main_lift_family: null,
    is_competition_lift: false,
    muscle_groups: ['core'],
    equipment: ['bodyweight'],
    movement_pattern: ['other'],
    competition_stance: null,
    created_by_coach_id: null,
    created_at: '2026-01-01T00:00:00Z',
  }
}

describe('plan editor clipboard rows', () => {
  it('round-trips a single exercise row through the clipboard format', () => {
    const row: ExerciseRow = {
      id: 'row-1',
      serverRowId: null,
      serverSortOrder: null,
      hasLogs: false,
      conflictMessage: null,
      exerciseId: 'bench',
      name: '卧推',
      ku: true,
      custom: false,
      isMain: true,

      aux: false,
      reps: '5',
      mode: 'kg',
      boxes: [
        { val: '100', empty: false },
        { val: '102.5', empty: false },
      ],
      note: '暂停 2 秒',
    }

    const parsed = parseClipboardRows(serializeRowsForClipboard([row]), new ExerciseIndex([exercise('bench', '卧推')]))

    expect(parsed).toHaveLength(1)
    expect(parsed?.[0]).toMatchObject({
      exerciseId: 'bench',
      name: '卧推',
      ku: true,
      reps: '5',
      mode: 'kg',
      boxes: [
        { val: '100', empty: false },
        { val: '102.5', empty: false },
      ],
      note: '暂停 2 秒',
    })
  })

  it('round-trips a row-level range even when the optional weight and note cells are empty', () => {
    const source: ExerciseRow = {
      id: 'row-range', serverRowId: null, serverSortOrder: null, hasLogs: false, conflictMessage: null,
      exerciseId: 'bench', name: '卧推', ku: true, custom: false, isMain: true,
      aux: false, reps: '5', mode: 'kg',
      intensity: { mode: 'rpe_range', value: '7', high: '8.5' },
      weightMode: 'uniform',
      boxes: [{ val: '', empty: true }, { val: '', empty: true }],
      note: '',
    }

    const parsed = parseClipboardRows(serializeRowsForClipboard([source]), new ExerciseIndex([exercise('bench', '卧推')]))
    expect(parsed?.[0]).toMatchObject({
      mode: 'kg',
      intensity: { mode: 'rpe_range', value: '7', high: '8.5' },
      weightMode: 'uniform',
      boxes: [{ val: '', empty: true }, { val: '', empty: true }],
    })
  })

  it('round-trips a weight range through the weight columns, not intensity', () => {
    const source: ExerciseRow = {
      id: 'weight-range', serverRowId: null, serverSortOrder: null, hasLogs: false, conflictMessage: null,
      exerciseId: 'bench', name: '卧推', ku: true, custom: false, isMain: true,
      aux: false, reps: '5', mode: 'kg',
      intensity: { mode: 'weight_range', value: '165', high: '175' },
      weightMode: 'uniform',
      boxes: [{ val: '', empty: true }, { val: '', empty: true }],
      note: '',
    }

    const serialized = serializeRowsForClipboard([source])
    const parsed = parseClipboardRows(serialized, new ExerciseIndex([exercise('bench', '卧推')]))

    expect(serialized).toContain('\t无\t\t重量区间\t165-175\t')
    expect(parsed?.[0]).toMatchObject({
      intensity: { mode: 'weight_range', value: '165', high: '175' },
      weightMode: 'uniform',
      boxes: [{ val: '', empty: true }, { val: '', empty: true }],
    })
  })

  it('round-trips legacy per-set RPE values without turning them into weights', () => {
    const source: ExerciseRow = {
      id: 'legacy-rpe', serverRowId: 'server-legacy', serverSortOrder: 0, hasLogs: false, conflictMessage: null,
      exerciseId: 'bench', name: '卧推', ku: true, custom: false, isMain: true,
      aux: false, reps: '5', mode: 'rpe',
      boxes: [{ val: '7.5', empty: false }, { val: '8', empty: false }],
      note: '',
    }

    const serialized = serializeRowsForClipboard([source])
    const parsed = parseClipboardRows(serialized, new ExerciseIndex([exercise('bench', '卧推')]))

    expect(serialized).toContain('rpe\t7.5/8')
    expect(serialized).not.toContain('旧逐组RPE')
    expect(parsed?.[0]).toMatchObject({
      mode: 'kg',
      intensity: { mode: 'rpe', value: '7.5', high: '' },
      intensityMode: 'per_set',
      intensityBoxes: [{ val: '7.5', empty: false }, { val: '8', empty: false }],
      boxes: [{ val: '', empty: true }, { val: '', empty: true }],
    })
    expect(parsed?.[0].weightMode).toBe('uniform')
  })

  it('round-trips sparse per-set single-value intensity without moving it into weight', () => {
    const source: ExerciseRow = {
      id: 'pct-sparse', serverRowId: null, serverSortOrder: null, hasLogs: false, conflictMessage: null,
      exerciseId: 'bench', name: '卧推', ku: true, custom: false, isMain: true,
      aux: false, reps: '5', mode: 'kg',
      intensity: { mode: 'pct', value: '70', high: '' },
      pctAnchor: 'top_set',
      intensityMode: 'per_set',
      intensityBoxes: [
        { val: '70', empty: false }, { val: '', empty: true },
        { val: '75', empty: false }, { val: '', empty: true },
      ],
      weightMode: 'uniform',
      boxes: Array.from({ length: 4 }, () => ({ val: '', empty: true })),
      note: '',
    }

    const parsed = parseClipboardRows(serializeRowsForClipboard([source]), new ExerciseIndex([exercise('bench', '卧推')]))
    expect(parsed?.[0]).toMatchObject({
      intensity: { mode: 'pct', value: '70', high: '' },
      pctAnchor: 'top_set',
      intensityMode: 'per_set',
      intensityBoxes: [
        { val: '70', empty: false }, { val: '', empty: true },
        { val: '75', empty: false }, { val: '', empty: true },
      ],
      boxes: Array.from({ length: 4 }, () => ({ val: '', empty: true })),
    })
    expect(serializeRowsForClipboard([source])).toContain('\t当日顶组')
  })

  it('parses the previous eight-column clipboard format with the default pct anchor', () => {
    const legacyText = [
      '动作\t组\t次\t强度类型\t强度值\t重量模式\t重量\t备注',
      '卧推\t2\t5\tpct\t72.5/75\t逐组标重\t100/102.5\t旧剪贴板',
    ].join('\n')

    const parsed = parseClipboardRows(legacyText, new ExerciseIndex([exercise('bench', '卧推')]))

    expect(parsed?.[0]).toMatchObject({
      intensity: { mode: 'pct', value: '72.5', high: '' },
      pctAnchor: 'one_rm',
      intensityMode: 'per_set',
      intensityBoxes: [{ val: '72.5', empty: false }, { val: '75', empty: false }],
      boxes: [{ val: '100', empty: false }, { val: '102.5', empty: false }],
      note: '旧剪贴板',
    })
  })

  it('ignores multi-day comments and every repeated header row', () => {
    const text = [
      '# W03 周一 8/3',
      '动作\t组\t次\t强度类型\t强度\t备注',
      '卧推\t2\t5\tKG\t100/102.5\t暂停',
      '# W03 周三 8/5',
      '动作\t组\t次\t强度类型\t强度\t备注',
      '深蹲\t1\t3\tRPE\t8\t',
    ].join('\r\n')

    const parsed = parseClipboardRows(text)

    expect(parsed?.map((row) => row.name)).toEqual(['卧推', '深蹲'])
  })

  it('reports an all-out-of-range translated paste as entirely skipped', () => {
    expect(formatTranslatedDaysPasteStatus(0, 2)).toBe('2 天全部超出计划范围已跳过')
  })
})

it('pastes Traditional protocol fields and binds names without changing notes or custom names', () => {
  const custom = { ...exercise('custom', '自訂卧推'), created_by_coach_id: 'coach' }
  const index = new ExerciseIndex([exercise('bench', '竞技卧推'), custom])
  const pasted = parseClipboardRows('動作\t組\t次\t強度類型\t強度值\t重量模式\t重量\t備註\t百分比錨點\n臥推\t3\t5\trpe\t8\t逐組標重\t100/102/104\t教练原文备注\t\n自訂卧推\t1\t5\trpe\t7\t固定重量\t20\t保留原文\t', index)
  expect(pasted).toHaveLength(2)
  expect(pasted?.[0]).toMatchObject({ name: '竞技卧推', exerciseId: 'bench', note: '教练原文备注', weightMode: 'per_set', boxes: [{ val: '100' }, { val: '102' }, { val: '104' }] })
  expect(pasted?.[1]).toMatchObject({ name: '自訂卧推', custom: true, note: '保留原文' })
})

it('recognizes reordered Taiwan reps and note columns in pasted Excel rows', () => {
  const rows = parseClipboardRows('動作\t下數\t組數\t教練指示\t反饋備註\n滑輪下拉\t6\t3\t合成指示：慢放\t合成反饋：稳住')
  expect(rows).toHaveLength(1)
  expect(rows?.[0]).toMatchObject({ name: '滑輪下拉', reps: '6', note: '合成指示：慢放 · 合成反饋：稳住' })
  expect(rows?.[0].boxes).toHaveLength(3)
  expect(rows?.[0].boxes.every(box => box.empty)).toBe(true)
})

it('pastes compact Taiwan reps without losing percentage guidance or size specifications', () => {
  const index = new ExerciseIndex([exercise('row', '高位下拉')])
  const rows = parseClipboardRows('動作\t組數\t下數\t教練指示\n滑輪下拉（2cm)\t3\t2下@8。80%\t合成备注：慢放', index)
  expect(rows?.[0]).toMatchObject({
    exerciseId: 'row', name: '高位下拉', reps: '2',
    intensity: { mode: 'rpe', value: '8', high: '' },
    note: '合成备注：慢放 · 80% · （2cm)',
  })
  expect(rows?.[0].intensityBoxes).toEqual(Array.from({ length: 3 }, () => ({ val: '8', empty: false })))
})

it('preserves custom dimensions for both exact and fallback paste bindings', () => {
  const custom = { ...exercise('custom', '合成自建練習'), created_by_coach_id: 'synthetic-coach' }
  const index = new ExerciseIndex([custom, { ...custom, id: 'exact', name: '合成自建練習（4cm)' }])
  const rows = parseClipboardRows('動作\t組數\t下數\t教練指示\n合成自建練習（2cm)\t3\t6\t原文\n合成自建練習（4cm)\t3\t6\t原文', index)
  expect(rows?.[0]).toMatchObject({ exerciseId: 'custom', name: '合成自建練習', note: '原文 · （2cm)' })
  expect(rows?.[1]).toMatchObject({ exerciseId: 'exact', name: '合成自建練習（4cm)', note: '原文' })
})
