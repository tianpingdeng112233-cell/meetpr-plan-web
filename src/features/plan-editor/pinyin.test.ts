import { describe, expect, it } from 'vitest'
import { matchesPinyin, pinyinMatchScore } from './pinyin'

describe('matchesPinyin', () => {
  it('matches full pinyin from the start of a name', () => {
    expect(matchesPinyin('传统硬拉', 'chuantong')).toBe(true)
    expect(pinyinMatchScore('传统硬拉', 'chuantong')).toBe(0)
  })

  it('matches initials, a middle word, and mixed full/initial spelling', () => {
    expect(matchesPinyin('传统硬拉', 'ctyl')).toBe(true)
    expect(matchesPinyin('传统硬拉', 'yingla')).toBe(true)
    expect(matchesPinyin('传统硬拉', 'chuantongyl')).toBe(true)
    expect(pinyinMatchScore('传统硬拉', 'yingla')).toBe(2)
  })

  it('lets the last syllable be half-typed', () => {
    expect(matchesPinyin('传统硬拉', 'chu')).toBe(true)
    expect(matchesPinyin('传统硬拉', 'chuantongyin')).toBe(true)
    expect(matchesPinyin('传统硬拉', 'chuax')).toBe(false)
  })

  it('keeps every reading for polyphonic characters', () => {
    expect(matchesPinyin('长凳卧推', 'changdeng')).toBe(true)
    expect(matchesPinyin('长凳卧推', 'zhangdeng')).toBe(true)
    expect(matchesPinyin('海豹划船', 'haibaohuaichuan')).toBe(false) // 划 has no reading "huai"
  })

  it('consumes ASCII runs literally and only skips separators', () => {
    expect(matchesPinyin('单腿 RDL', 'dantuirdl')).toBe(true)
    expect(matchesPinyin('单腿 RDL', 'rdl')).toBe(true)
    expect(matchesPinyin('ABC深蹲', 'abcsd')).toBe(true)
    expect(matchesPinyin('ABC深蹲', 'acsd')).toBe(false)
    expect(matchesPinyin('ABC深蹲', 'shendun')).toBe(true)
    expect(matchesPinyin('3D深蹲', '3dshendun')).toBe(true)
    expect(pinyinMatchScore('3D深蹲', 'dshendun')).toBe(1) // start-anywhere: begins at D, digits are literal not skippable
    expect(matchesPinyin('3D深蹲', '3shendun')).toBe(false)
  })

  it('rejects short, unrelated, and non-ASCII queries', () => {
    expect(matchesPinyin('传统硬拉', 'c')).toBe(false)
    expect(matchesPinyin('传统硬拉', 'xxx')).toBe(false)
    expect(matchesPinyin('传统硬拉', '硬拉')).toBe(false)
  })

  it('stays bounded on adversarial state-accumulating input', () => {
    // Every 传 can consume "c" (initial) at every live offset, so states pile up to
    // query length; 1251 names × 120 chars × 60 states is far beyond any real catalog.
    const name = '传'.repeat(120)
    const query = `${'c'.repeat(60)}x`
    const started = performance.now()
    for (let i = 0; i < 1251; i++) matchesPinyin(name, query)
    expect(performance.now() - started).toBeLessThan(1000)
  })
})
