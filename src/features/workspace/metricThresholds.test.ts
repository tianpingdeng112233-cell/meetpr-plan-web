import { describe, expect, it } from 'vitest'
import { completionRateTone, rpeTone } from './metricThresholds'

describe('shared metric thresholds', () => {
  it('uses the completion-rate boundaries exactly', () => {
    expect(completionRateTone(85)).toBe('ok')
    expect(completionRateTone(84.999)).toBe('warn')
    expect(completionRateTone(65)).toBe('warn')
    expect(completionRateTone(64.999)).toBe('bad')
    expect(completionRateTone(null)).toBe('neutral')
  })

  it('uses the RPE boundaries exactly', () => {
    expect(rpeTone(8.4)).toBe('bad')
    expect(rpeTone(8.399)).toBe('warn')
    expect(rpeTone(8)).toBe('warn')
    expect(rpeTone(7.999)).toBe('neutral')
    expect(rpeTone(undefined)).toBe('neutral')
  })
})
