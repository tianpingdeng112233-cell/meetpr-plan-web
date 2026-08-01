import { describe, expect, it } from 'vitest'
import { FRAME_SECONDS, frameStepTime, precisionScrubTime, VIDEO_SPEEDS } from './videoPlayback'

describe('professional video playback helpers', () => {
  it('includes quarter-speed playback', () => {
    expect(VIDEO_SPEEDS).toEqual([0.25, 0.5, 1, 1.5, 2])
  })

  it('steps by 1/30 second and clamps at both boundaries', () => {
    expect(frameStepTime(1, 1, 5)).toBeCloseTo(1 + FRAME_SECONDS)
    expect(frameStepTime(0, -1, 5)).toBe(0)
    expect(frameStepTime(5, 1, 5)).toBe(5)
    expect(frameStepTime(1, 1, 0)).toBeNull()
  })
})

describe('precisionScrubTime', () => {
  it('maps one pixel of travel to one frame from the anchor', () => {
    expect(precisionScrubTime(10, 100, 130, 43)).toBeCloseTo(10 + 30 * FRAME_SECONDS)
    expect(precisionScrubTime(10, 100, 70, 43)).toBeCloseTo(10 - 30 * FRAME_SECONDS)
  })
  it('clamps to the clip bounds and rejects a missing duration', () => {
    expect(precisionScrubTime(0.02, 100, -1000, 43)).toBe(0)
    expect(precisionScrubTime(42.9, 100, 1000, 43)).toBe(43)
    expect(precisionScrubTime(10, 100, 130, 0)).toBeNull()
    expect(precisionScrubTime(10, 100, 130, Number.NaN)).toBeNull()
  })
})
