import { describe, expect, it } from 'vitest'
import type { ExerciseResponse } from '../../api/types'
import type { ExerciseRow } from './types'
import { ExerciseIndex } from './exerciseIndex'
import { parseClipboardRows, serializeRowsForClipboard } from './clipboard'

function exercise(id: string, name: string): ExerciseResponse {
  return {
    id,
    name,
    name_en: null,
    exercise_type: 'accessory',
    main_lift_family: null,
    is_competition_lift: false,
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
})
