import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createAutosaver } from './autosave'

describe('createAutosaver', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('does not save before the delay elapses', () => {
    const save = vi.fn()
    const a = createAutosaver({ delay: 1500, save })
    a.schedule()
    vi.advanceTimersByTime(1499)
    expect(save).not.toHaveBeenCalled()
  })

  it('saves once after the delay', () => {
    const save = vi.fn()
    const a = createAutosaver({ delay: 1500, save })
    a.schedule()
    vi.advanceTimersByTime(1500)
    expect(save).toHaveBeenCalledTimes(1)
  })

  it('debounces rapid schedules into a single save', () => {
    const save = vi.fn()
    const a = createAutosaver({ delay: 1500, save })
    a.schedule(); vi.advanceTimersByTime(1000)
    a.schedule(); vi.advanceTimersByTime(1000) // resets: only 1000ms since the last schedule
    expect(save).not.toHaveBeenCalled()
    vi.advanceTimersByTime(500) // 1500ms since the last schedule
    expect(save).toHaveBeenCalledTimes(1)
  })

  it('flush saves immediately when a save is armed', () => {
    const save = vi.fn()
    const a = createAutosaver({ delay: 1500, save })
    a.schedule()
    a.flush()
    expect(save).toHaveBeenCalledTimes(1)
  })

  it('flush is a no-op when nothing is armed', () => {
    const save = vi.fn()
    const a = createAutosaver({ delay: 1500, save })
    a.flush()
    expect(save).not.toHaveBeenCalled()
  })

  it('cancel drops an armed save', () => {
    const save = vi.fn()
    const a = createAutosaver({ delay: 1500, save })
    a.schedule()
    a.cancel()
    vi.advanceTimersByTime(5000)
    expect(save).not.toHaveBeenCalled()
  })

  it('re-saves when edits land while a save is in flight', async () => {
    let resolveFirst: () => void = () => {}
    const save = vi.fn(() => new Promise<void>((r) => { resolveFirst = r }))
    const a = createAutosaver({ delay: 1500, save })
    a.schedule()
    await vi.advanceTimersByTimeAsync(1500) // save #1 starts, stays in flight
    expect(save).toHaveBeenCalledTimes(1)
    a.schedule() // edit arrives mid-flight
    await vi.advanceTimersByTimeAsync(1500) // this run sees in-flight -> marks dirty, no 2nd call yet
    expect(save).toHaveBeenCalledTimes(1)
    resolveFirst() // #1 settles -> re-arm because dirty
    await vi.advanceTimersByTimeAsync(1500) // save #2 runs
    expect(save).toHaveBeenCalledTimes(2)
  })

  it('dispose prevents further saves and post-flight re-arming', () => {
    const save = vi.fn()
    const a = createAutosaver({ delay: 1500, save })
    a.schedule()
    a.dispose()
    vi.advanceTimersByTime(5000)
    expect(save).not.toHaveBeenCalled()
    a.schedule() // ignored after dispose
    vi.advanceTimersByTime(5000)
    expect(save).not.toHaveBeenCalled()
  })
})
