import { describe, expect, it } from 'vitest'
import type { LiftFamily } from '../../api/types'
import {
  classifySets, JTS_VOLUME_BANDS, loadJtsPhase, saveJtsPhase, type JtsPhase,
} from './jtsVolumeBands'

const phases = Object.keys(JTS_VOLUME_BANDS) as JtsPhase[]
const families: LiftFamily[] = ['squat', 'bench', 'deadlift']

describe('JTS weekly working-set bands', () => {
  for (const phase of phases) for (const family of families) {
    const { mev, mrv } = JTS_VOLUME_BANDS[phase][family]

    it(`${phase}/${family} classifies every MEV and MRV endpoint`, () => {
      expect(classifySets(family, phase, mev[0])).toBe('mev_band')
      expect(classifySets(family, phase, mev[1])).toBe(mev[1] >= mrv[0] ? 'mrv_band' : 'mev_band')
      expect(classifySets(family, phase, mrv[0])).toBe('mrv_band')
      expect(classifySets(family, phase, mrv[1])).toBe('mrv_band')
      expect(classifySets(family, phase, mev[0] - 1)).toBe(mev[0] === 1 ? null : 'below_mev')
      expect(classifySets(family, phase, mrv[1] + 1)).toBe('above_mrv')
    })
  }

  it('classifies the gap between non-overlapping bands', () => {
    expect(classifySets('bench', 'hypertrophy', 13)).toBe('between')
  })

  it('does not prompt for zero sets, invalid counts, or an unknown family', () => {
    expect(classifySets('squat', 'hypertrophy', 0)).toBeNull()
    expect(classifySets('squat', 'hypertrophy', Number.NaN)).toBeNull()
    expect(classifySets('other', 'hypertrophy', 10)).toBeNull()
    expect(classifySets(null, 'hypertrophy', 10)).toBeNull()
  })
})

describe('JTS phase local preference', () => {
  it('round-trips independently by plan id and defaults invalid/missing values to off', () => {
    const values = new Map<string, string>()
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => { values.set(key, value) },
    }

    expect(loadJtsPhase('plan-a', storage)).toBe('off')
    saveJtsPhase('plan-a', 'strength', storage)
    saveJtsPhase('plan-b', 'peaking', storage)
    expect(loadJtsPhase('plan-a', storage)).toBe('strength')
    expect(loadJtsPhase('plan-b', storage)).toBe('peaking')

    values.set('meetpr.planEditor.jtsVolumePhase.plan-a', 'unsupported')
    expect(loadJtsPhase('plan-a', storage)).toBe('off')
    expect(loadJtsPhase(undefined, storage)).toBe('off')
  })

  it('degrades to off and never throws when storage access itself throws (private mode)', () => {
    const throwing = {
      getItem: () => { throw new Error('denied') },
      setItem: () => { throw new Error('denied') },
    }
    expect(loadJtsPhase('plan-a', throwing)).toBe('off')
    expect(() => saveJtsPhase('plan-a', 'strength', throwing)).not.toThrow()
  })
})
