import { describe, expect, it } from 'vitest'
import type { ExerciseResponse } from '../../api/types'
import { displayExerciseName, ExerciseIndex } from './exerciseIndex'
import aliasesData from '../../data/exercise-aliases.json'
import catalogSnapshot from './exercise-catalog-names.fixture.json'

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

  it('resolveExact refuses fuzzy inference that resolve still allows for import paths', () => {
    const index = new ExerciseIndex([exercise('curl', '哑铃二头弯举')])

    expect(index.resolveExact('二头弯举加停顿')).toBeNull()
    expect(index.resolve('二头弯举加停顿')).toMatchObject({ id: 'curl' })
    expect(index.resolveExact('哑铃二头弯举')).toMatchObject({ id: 'curl' })
    expect(index.resolveExact('二头')).toMatchObject({ id: 'curl' })
  })

  it('resolves coach shorthand aliases from import sheets', () => {
    const index = new ExerciseIndex([
      exercise('side-plank', '侧平板支撑'),
      exercise('v-up', 'V字上举'),
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

  it('stably ranks the complete alias/catalog result set by usage before taking the limit', () => {
    const catalog = Array.from({ length: 10 }, (_, index) => exercise(`row-${index}`, `测试动作${index}`))
    const usage = [{ exercise_id: 'row-9', plan_count: 20 }]
    const index = new ExerciseIndex(catalog, {}, usage)

    expect(index.search('测试动作').map((hit) => hit.id)).toEqual([
      'row-9', 'row-0', 'row-1', 'row-2', 'row-3', 'row-4', 'row-5', 'row-6',
    ])

    const tied = new ExerciseIndex(catalog, {}, [
      { exercise_id: 'row-2', plan_count: 3 },
      { exercise_id: 'row-3', plan_count: 3 },
    ])
    expect(tied.search('测试动作').slice(0, 2).map((hit) => hit.id)).toEqual(['row-2', 'row-3'])
  })

  it('bumps session usage immediately and shares it with derived indexes', () => {
    const sharedUsage = new Map<string, number>()
    const index = new ExerciseIndex([
      exercise('first', '测试推举一'),
      exercise('second', '测试推举二'),
    ], {}, sharedUsage)

    expect(index.search('测试推举').map((hit) => hit.id)).toEqual(['first', 'second'])
    index.bump('second')
    expect(index.search('测试推举').map((hit) => hit.id)).toEqual(['second', 'first'])
    expect(index.withAdded(exercise('third', '测试推举三')).search('测试推举')[0].id).toBe('second')
  })

  it('recalls the four duplicate-prevention target cases through shared search scoring', () => {
    const index = new ExerciseIndex([
      { ...exercise('band-pallof', '弹力带 pallof 推'), name_en: 'Band Pallof Press' },
      { ...exercise('cable-pallof', '绳索帕洛夫推'), name_en: 'Cable Pallof Press' },
      exercise('side-plank', '侧平板支撑'),
      exercise('seated-press', '坐姿哑铃推举'),
      exercise('hammer-curl', '绳索锤式弯举'),
    ])

    expect(index.search('帕洛夫推').map((hit) => hit.id)).toEqual(expect.arrayContaining(['band-pallof', 'cable-pallof']))
    expect(index.search('平板侧支撑')[0]).toMatchObject({ id: 'side-plank' })
    expect(index.search('坐姿哑铃推肩')[0]).toMatchObject({ id: 'seated-press' })
    expect(index.search('绳索对握弯举')[0]).toMatchObject({ id: 'hammer-curl' })
  })

  it('returns nothing for blank queries and ranks substring hits above character-set hits', () => {
    const index = new ExerciseIndex([
      exercise('side-plank', '侧平板支撑'),
      exercise('rack', '平板侧支撑架'),
      exercise('scrambled-a', '撑支板平侧'),
      exercise('scrambled-b', '支撑侧板平'),
    ])

    expect(index.search('')).toEqual([])
    expect(index.search(' - · ')).toEqual([])
    // substring (tier 1) before any-order character set (tier 2); equal fuzzy scores keep catalog order
    expect(index.search('平板侧支撑').map((hit) => hit.id)).toEqual(['rack', 'side-plank', 'scrambled-a', 'scrambled-b'])
  })

  it('adds full, initial, and middle pinyin matches after the existing tiers', () => {
    const index = new ExerciseIndex([
      exercise('traditional', '传统硬拉'),
      exercise('traditional-pause', '传统暂停硬拉'),
      exercise('prefix', '英拉辅助动作测试'),
    ])

    expect(index.search('chuantong').map((hit) => hit.id)).toEqual(['traditional', 'traditional-pause'])
    expect(index.search('ctyl').map((hit) => hit.id)).toEqual(['traditional'])
    expect(index.search('yingla').map((hit) => hit.id)).toEqual(['prefix', 'traditional', 'traditional-pause'])
  })

  it('keeps name_en substring matches ahead of pinyin matches', () => {
    const english = { ...exercise('english', '测试动作'), name_en: 'Deadlift / Yingla practice' }
    const index = new ExerciseIndex([exercise('traditional', '传统硬拉'), english])

    expect(index.search('yingla').map((hit) => hit.id)).toEqual(['english', 'traditional'])
    expect(index.search('deadlift')[0]).toMatchObject({ id: 'english' })
  })

  it('does not invoke pinyin matching for non-ASCII queries', () => {
    const index = new ExerciseIndex([
      exercise('traditional', '传统硬拉'),
      exercise('scrambled', '硬统拉传'),
    ])

    expect(index.search('传统硬拉').map((hit) => hit.id)).toEqual(['traditional', 'scrambled'])
  })

  it('keeps every iOS-copy alias canonical attached to the catalog snapshot', () => {
    // Every canonical must be a seed catalog name: a single coach's custom exercise
    // cannot back a global alias (it would dangle for every other coach).
    const catalogNames = new Set(catalogSnapshot.names)
    const dangling = aliasesData.aliases.filter((entry) => !catalogNames.has(entry.canonical))

    expect(dangling).toEqual([])
  })
})
