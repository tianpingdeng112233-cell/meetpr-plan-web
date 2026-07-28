import { describe, expect, it } from 'vitest'
import { markerPositionPercent, moveVideoIndex, videoAssociation } from './VideosPage'

describe('video master-detail helpers', () => {
  it('moves between videos without crossing either boundary', () => {
    expect(moveVideoIndex(0, -1, 4)).toBe(0)
    expect(moveVideoIndex(0, 1, 4)).toBe(1)
    expect(moveVideoIndex(2, -1, 4)).toBe(1)
    expect(moveVideoIndex(3, 1, 4)).toBe(3)
  })

  it('builds the association label while omitting missing fields', () => {
    expect(videoAssociation({ logged_at: '2026-07-17T08:00:00.000Z', created_at: '2026-07-18T08:00:00.000Z', exercise_name: '低杠位深蹲', set_index: 0 })).toBe('07/17 · 低杠位深蹲 · 第 1 组')
    expect(videoAssociation({ logged_at: null, created_at: '2026-07-18T08:00:00.000Z', exercise_name: null, set_index: 2 })).toBe('07/18 · 第 3 组')
    expect(videoAssociation({ logged_at: null, created_at: null, exercise_name: '卧推', set_index: null })).toBe('卧推')
    expect(videoAssociation({ logged_at: null, created_at: null, exercise_name: null, set_index: null })).toBe('')
  })

  it('positions marker ticks from time_ms and clamps malformed or out-of-range values', () => {
    expect(markerPositionPercent(12_000, 40)).toBe(30)
    expect(markerPositionPercent(50_000, 40)).toBe(100)
    expect(markerPositionPercent(-2_000, 40)).toBe(0)
    expect(markerPositionPercent(4_000, 0)).toBe(0)
  })
})
