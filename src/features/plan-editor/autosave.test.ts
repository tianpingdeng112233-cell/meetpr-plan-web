import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createSaveController } from './autosave'

const ok = () => Promise.resolve(true)

// A persist stub that stays "in flight" until you call its .resolve(); records how many times
// it ran and what each run observed via the getter.
function deferredPersist(getValue: () => unknown) {
  const runs: unknown[] = []
  let pending: (() => void) | null = null
  const persist = vi.fn(() => new Promise<boolean>((res) => {
    runs.push(getValue())
    pending = () => res(true)
  }))
  return { persist, runs, resolve: () => { const p = pending; pending = null; p?.() } }
}

describe('createSaveController', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('does not persist before the debounce elapses', () => {
    const persist = vi.fn(ok)
    const c = createSaveController({ delay: 1500, persist })
    c.scheduleAutosave()
    vi.advanceTimersByTime(1499)
    expect(persist).not.toHaveBeenCalled()
  })

  it('persists once after the debounce', async () => {
    const persist = vi.fn(ok)
    const c = createSaveController({ delay: 1500, persist })
    c.scheduleAutosave()
    await vi.advanceTimersByTimeAsync(1500)
    expect(persist).toHaveBeenCalledTimes(1)
  })

  it('debounces rapid edits into a single persist', async () => {
    const persist = vi.fn(ok)
    const c = createSaveController({ delay: 1500, persist })
    c.scheduleAutosave(); vi.advanceTimersByTime(1000)
    c.scheduleAutosave(); vi.advanceTimersByTime(1000)
    expect(persist).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(500)
    expect(persist).toHaveBeenCalledTimes(1)
  })

  it('saveNow persists immediately and reports success', async () => {
    const persist = vi.fn(ok)
    const c = createSaveController({ delay: 1500, persist })
    await expect(c.saveNow()).resolves.toBe(true)
    expect(persist).toHaveBeenCalledTimes(1)
  })

  it('saveNow reports false when persist fails, and keeps the edit pending to retry', async () => {
    const persist = vi.fn().mockResolvedValueOnce(false).mockResolvedValue(true)
    const c = createSaveController({ delay: 1500, persist })
    await expect(c.saveNow()).resolves.toBe(false)
    // edit is still pending -> a later flush retries it
    await expect(c.flush()).resolves.toBe(true)
    expect(persist).toHaveBeenCalledTimes(2)
  })

  it('flush persists pending edits, and is a no-op when nothing is pending', async () => {
    const persist = vi.fn(ok)
    const c = createSaveController({ delay: 1500, persist })
    await expect(c.flush()).resolves.toBe(true) // nothing pending
    expect(persist).not.toHaveBeenCalled()
    c.scheduleAutosave() // arm (marks dirty) but do not let the timer fire
    await c.flush()
    expect(persist).toHaveBeenCalledTimes(1)
  })

  it('cancelAutosave drops the timer but keeps the edit pending for flush', async () => {
    const persist = vi.fn(ok)
    const c = createSaveController({ delay: 1500, persist })
    c.scheduleAutosave()
    c.cancelAutosave()
    vi.advanceTimersByTime(5000)
    expect(persist).not.toHaveBeenCalled() // timer dropped
    await c.flush()
    expect(persist).toHaveBeenCalledTimes(1) // but the edit was not lost
  })

  // The core data-loss guarantee (review findings 3 & 4): an edit that lands while a persist is
  // in flight must still be persisted afterwards — and it must persist the NEWEST content.
  it('re-persists the latest content when an edit lands mid-flight (no drop)', async () => {
    let value = 'v1'
    const d = deferredPersist(() => value)
    const c = createSaveController({ delay: 1500, persist: d.persist })

    value = 'v1'; c.saveNow()                 // persist #1 starts, in flight, reads v1
    await Promise.resolve()
    expect(d.persist).toHaveBeenCalledTimes(1)

    value = 'v2'; c.scheduleAutosave()        // edit arrives mid-flight
    await vi.advanceTimersByTimeAsync(1500)   // its timer fires but a drain is already running
    expect(d.persist).toHaveBeenCalledTimes(1) // no overlapping second persist

    d.resolve()                               // #1 settles -> drain loops because dirty
    await Promise.resolve(); await Promise.resolve()
    expect(d.persist).toHaveBeenCalledTimes(2)
    expect(d.runs).toEqual(['v1', 'v2'])      // second persist saw the newest content
  })

  // Publish safety (review finding 1): saveNow() must AWAIT an already in-flight reconcile, so a
  // background draft write can't still be running when the caller (publish) proceeds.
  it('saveNow awaits an already in-flight persist before resolving', async () => {
    let value = 'v1'
    const d = deferredPersist(() => value)
    const c = createSaveController({ delay: 1500, persist: d.persist })

    c.scheduleAutosave()
    await vi.advanceTimersByTimeAsync(1500) // persist #1 in flight, dirty already cleared to false
    expect(d.persist).toHaveBeenCalledTimes(1)

    let resolved = false
    const p = c.saveNow().then(() => { resolved = true })
    await Promise.resolve()
    expect(resolved).toBe(false) // saveNow does NOT resolve while the reconcile is still running
    d.resolve()                  // in-flight persist #1 settles -> drain loops for saveNow's forced persist #2
    await Promise.resolve(); await Promise.resolve()
    expect(resolved).toBe(false) // still pending: saveNow awaits the forced persist too
    d.resolve()                  // persist #2 settles -> drain exits
    await p
    expect(resolved).toBe(true)
    expect(d.persist).toHaveBeenCalledTimes(2)
  })

  it('flush during an in-flight persist still persists the last edit (unmount safety)', async () => {
    let value = 'v1'
    const d = deferredPersist(() => value)
    const c = createSaveController({ delay: 1500, persist: d.persist })

    value = 'v1'; c.scheduleAutosave()
    await vi.advanceTimersByTimeAsync(1500)   // persist #1 in flight
    expect(d.persist).toHaveBeenCalledTimes(1)

    value = 'v2'; c.scheduleAutosave()        // last edit before leaving
    c.flush()                                 // unmount flush while #1 is in flight
    d.resolve()                               // #1 settles -> must persist v2
    await Promise.resolve(); await Promise.resolve()
    expect(d.persist).toHaveBeenCalledTimes(2)
    expect(d.runs[1]).toBe('v2')
  })
})
