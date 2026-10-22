import { describe, expect, it } from 'vitest'
import { rankAdoptionCandidates } from './adoptionCandidates'

const official = (id: string, name: string, name_en: string | null = null) => ({ id, name, name_en, created_by_coach_id: null })

describe('rankAdoptionCandidates', () => {
  it('ranks alias matches above containment above single-character Dice, taking the best spelling and only three officials', () => {
    const catalog = [official('dice', '卧式推举'), official('contains', '暂停卧推'), official('alias', '竞技卧推'), official('fourth', '推举卧式'), official('none', '硬拉'), { ...official('custom', '卧推'), created_by_coach_id: 'coach' }]
    expect(rankAdoptionCandidates(['陌生叫法', ' 卧 推 '], catalog).map(x => x.id)).toEqual(['alias', 'contains', 'dice'])
  })
  it('normalizes full-width Latin, case and whitespace and compares English names in both containment directions', () => {
    const catalog = [official('english', '未知名称', 'DB Row'), official('long', '无关', 'Paused DB Row')]
    expect(rankAdoptionCandidates([' ＤＢ　ＲＯＷ '], catalog).map(x => x.id)).toEqual(['english', 'long'])
    expect(rankAdoptionCandidates(['heavy db row variation'], [catalog[0]]).map(x => x.id)).toEqual(['english'])
  })

  it('includes Dice exactly at 0.5, excludes weaker matches, and ignores empty spellings', () => {
    expect(rankAdoptionCandidates(['甲乙丙丁'], [official('half', '甲乙戊己'), official('weak', '甲戊己庚')]).map(x => x.id)).toEqual(['half'])
    expect(rankAdoptionCandidates(['', '　 '], [official('none', '甲乙')])).toEqual([])
    expect(rankAdoptionCandidates(['猫牛式'], [official('none', '竞技卧推')])).toEqual([])
  })

})
