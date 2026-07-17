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
    muscle_groups: ['core'],
    equipment: ['bodyweight'],
    movement_pattern: ['other'],
    competition_stance: null,
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
    expect(index.resolve('二头动作自选')).toMatchObject({ id: 'curl' })
  })

  it('resolves coach shorthand aliases from import sheets', () => {
    const index = new ExerciseIndex([
      exercise('side-plank', '侧平板支撑'),
      exercise('v-up', '静力两头起'),
      exercise('spoto', 'spoto 暂停卧推'),
      exercise('ssb-tempo', '安全杠节奏深蹲'),
    ])

    expect(index.resolve('侧平板')).toMatchObject({ id: 'side-plank' })
    expect(index.resolve('两头起')).toMatchObject({ id: 'v-up' })
    expect(index.resolve('spoto暂停')).toMatchObject({ id: 'spoto' })
    expect(index.resolve('安全杆节奏蹲')).toMatchObject({ id: 'ssb-tempo' })
  })

  it('normalizes latin case, spaces and separators in catalog names', () => {
    const index = new ExerciseIndex([
      exercise('band-squat', '弹力带-深蹲'),
      exercise('v-row', '坐姿 v 把划船'),
    ])

    expect(index.resolve('弹力带深蹲')).toMatchObject({ id: 'band-squat' })
    expect(index.resolve('坐姿V把划船')).toMatchObject({ id: 'v-row' })
  })

  it('exposes the catalog tier by id, including exercises added after construction', () => {
    const squat = { ...exercise('sq', '低杠位深蹲'), exercise_type: 'main_lift' as const }
    const index = new ExerciseIndex([squat, exercise('fly', '蝴蝶机夹胸')])

    expect(index.typeById('sq')).toBe('main_lift')
    expect(index.typeById('fly')).toBe('accessory')
    expect(index.typeById('missing')).toBeNull()

    index.add({ ...exercise('spoto', 'spoto 暂停卧推'), exercise_type: 'main_lift_variation' })
    expect(index.typeById('spoto')).toBe('main_lift_variation')
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
