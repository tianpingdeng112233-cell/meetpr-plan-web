import { describe, expect, it } from 'vitest'
import { FRAME_SECONDS, frameStepTime, VIDEO_SPEEDS } from './videoPlayback'

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
