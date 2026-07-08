import { describe, expect, it } from 'vitest'
import type { ExerciseResponse } from '../../api/types'
import { displayExerciseName, ExerciseIndex } from './exerciseIndex'

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

describe('ExerciseIndex', () => {
  it('renames dumbbell bench for display while keeping the old catalog id resolvable', () => {
    const index = new ExerciseIndex([exercise('db-bench', '哑铃卧推')])

    expect(displayExerciseName('哑铃卧推')).toBe('平板哑铃卧推')
    expect(index.resolve('哑铃卧推')).toMatchObject({ id: 'db-bench', name: '平板哑铃卧推' })
    expect(index.resolve('平板哑铃卧推')).toMatchObject({ id: 'db-bench', name: '平板哑铃卧推' })
  })

  it('falls back arbitrary biceps curl names to dumbbell curls', () => {
    const index = new ExerciseIndex([exercise('curl', '哑铃二头弯举')])

    expect(index.resolve('任意二头弯举')).toMatchObject({ id: 'curl' })
    expect(index.resolve('二头任意弯举')).toMatchObject({ id: 'curl' })
  })

  it('maps generic paused deadlift by the student deadlift style', () => {
    const catalog = [
      exercise('conv', '传统暂停硬拉'),
      exercise('sumo', '相扑暂停硬拉'),
    ]

    expect(new ExerciseIndex(catalog, { deadliftStyle: 'conventional' }).resolve('暂停硬拉'))
      .toMatchObject({ id: 'conv' })
    expect(new ExerciseIndex(catalog, { deadliftStyle: 'sumo' }).resolve('暂停硬拉'))
      .toMatchObject({ id: 'sumo' })
  })
})
