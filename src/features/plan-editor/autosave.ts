// Serialized save controller for the plan editor.
//
// One persist runs at a time; if content changes while a persist is in flight, the controller
// persists again afterwards — so the latest edits are never dropped (this is what makes the
// debounced autosave, the manual "save now", and the unmount flush safe to interleave). They all
// funnel through the same queue.
//
//   scheduleAutosave() — content changed on a draft: (re)arm the debounce.
//   saveNow()          — persist now; resolves true on success, false if a persist failed.
//   flush()            — persist pending edits now, only if there are any (used on unmount).
//   cancelAutosave()   — drop the debounce timer WITHOUT persisting (edits stay pending).
//
// persist() is supplied by the caller, reads the latest content itself, and resolves to whether it
// succeeded. On failure the controller keeps the edits pending so the next trigger retries them.

export interface SaveController {
  scheduleAutosave: () => void
  saveNow: () => Promise<boolean>
  flush: () => Promise<boolean>
  cancelAutosave: () => void
}

export function createSaveController(opts: { delay: number; persist: () => Promise<boolean> }): SaveController {
  let timer: ReturnType<typeof setTimeout> | null = null
  let draining: Promise<boolean> | null = null
  let dirty = false

  const drain = async (): Promise<boolean> => {
    let ok = true
    while (dirty) {
      dirty = false
      ok = await opts.persist()
      if (!ok) { dirty = true; break } // persist failed: keep edits pending for a later retry
    }
    return ok
  }
  // Ensure a single drain loop is running; concurrent callers share (and await) the same one.
  const kick = (): Promise<boolean> => {
    if (!draining) draining = drain().finally(() => { draining = null })
    return draining
  }
  const clearTimer = () => { if (timer) { clearTimeout(timer); timer = null } }

  const scheduleAutosave = () => {
    dirty = true
    clearTimer()
    timer = setTimeout(() => { timer = null; void kick() }, opts.delay)
  }
  const saveNow = (): Promise<boolean> => { dirty = true; clearTimer(); return kick() }
  const flush = (): Promise<boolean> => { clearTimer(); return dirty ? kick() : Promise.resolve(true) }
  const cancelAutosave = () => { clearTimer() }

  return { scheduleAutosave, saveNow, flush, cancelAutosave }
}
