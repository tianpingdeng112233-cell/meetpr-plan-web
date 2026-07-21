import { describe, expect, it } from 'vitest'
import { moveVideoIndex, videoAssociation } from './VideosPage'

describe('video modal helpers', () => {
  it('moves between videos without crossing either boundary', () => {
    expect(moveVideoIndex(0, -1, 4)).toBe(0)
    expect(moveVideoIndex(0, 1, 4)).toBe(1)
    expect(moveVideoIndex(2, -1, 4)).toBe(1)
    expect(moveVideoIndex(3, 1, 4)).toBe(3)
  })

  it('builds the association label while omitting missing fields', () => {
    expect(videoAssociation({ logged_at: '2026-07-17T08:00:00.000Z', created_at: '2026-07-18T08:00:00.000Z', exercise_name: '低杠位深蹲', set_index: 2 })).toBe('07/17 · 低杠位深蹲 · 第 2 组')
    expect(videoAssociation({ logged_at: null, created_at: '2026-07-18T08:00:00.000Z', exercise_name: null, set_index: 3 })).toBe('07/18 · 第 3 组')
    expect(videoAssociation({ logged_at: null, created_at: null, exercise_name: '卧推', set_index: null })).toBe('卧推')
    expect(videoAssociation({ logged_at: null, created_at: null, exercise_name: null, set_index: null })).toBe('')
  })
})
