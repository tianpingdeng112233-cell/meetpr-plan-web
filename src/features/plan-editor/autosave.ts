// Debounced, coalescing autosaver. Pure timer logic (no React) so it unit-tests with fake timers.
//
//   schedule() — (re)arm the debounce; after `delay` ms idle, run save().
//   flush()    — if a save is armed, run it now (used on unmount to persist the last edits).
//   cancel()   — drop an armed save without running it.
//   dispose()  — stop for good: cancel and prevent any post-in-flight re-arming.
//
// If edits land while a save is in flight, it re-saves once afterwards so the backend
// converges to the latest content (save() is expected to read the newest state each call).

export interface Autosaver {
  schedule: () => void
  flush: () => void
  cancel: () => void
  dispose: () => void
}

export function createAutosaver(opts: { delay: number; save: () => void | Promise<void> }): Autosaver {
  let timer: ReturnType<typeof setTimeout> | null = null
  let inFlight = false
  let dirtyWhileInFlight = false
  let disposed = false

  const run = async () => {
    timer = null
    if (inFlight) { dirtyWhileInFlight = true; return } // a save is running; re-save after it settles
    inFlight = true
    try {
      await opts.save()
    } finally {
      inFlight = false
      if (!disposed && dirtyWhileInFlight) { dirtyWhileInFlight = false; schedule() }
    }
  }

  const schedule = () => {
    if (disposed) return
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => { void run() }, opts.delay)
  }

  const cancel = () => {
    if (timer) { clearTimeout(timer); timer = null }
  }

  const flush = () => {
    if (timer) { clearTimeout(timer); timer = null; void run() }
  }

  const dispose = () => {
    disposed = true
    cancel()
  }

  return { schedule, flush, cancel, dispose }
}
