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
