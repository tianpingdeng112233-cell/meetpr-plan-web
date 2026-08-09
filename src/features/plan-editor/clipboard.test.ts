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

    expect(serialized).toContain('旧逐组RPE\t7.5/8')
    expect(parsed?.[0]).toMatchObject({
      mode: 'rpe',
      boxes: [{ val: '7.5', empty: false }, { val: '8', empty: false }],
    })
    expect(parsed?.[0].intensity).toBeUndefined()
    expect(parsed?.[0].weightMode).toBeUndefined()
  })
})
