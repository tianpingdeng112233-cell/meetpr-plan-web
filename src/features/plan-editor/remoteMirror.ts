import { ApiException } from '../../api/client'
import {
  deletePendingRevision,
  putPendingRevision,
  type PutPendingRevisionResponse,
} from '../../api/pendingRevision'
import {
  createDraftMirror,
  draftContentHash,
  type DraftMirror,
  type DraftMirrorContent,
} from './draftMirror'

export const REMOTE_MIRROR_DELAY = 3000
export const REMOTE_MIRROR_MAX_RETRIES = 3

export type RemoteMirrorState =
  | { status: 'idle' }
  | { status: 'stashing' }
  | { status: 'saved'; savedAt: string }
  | { status: 'local-only' }

interface BeforeUnloadTarget {
  addEventListener(type: 'beforeunload', listener: () => void): void
  removeEventListener(type: 'beforeunload', listener: () => void): void
}

export interface RemoteMirrorWriter {
  schedule(content: DraftMirrorContent): void
  /** Delete the remote baseline, cancelling every pending write. */
  clear(): void
  /** Delete the covered snapshot while preserving a newer edit queued during the save. */
  markCovered(contentHash: string): void
  flush(options?: { keepalive?: boolean }): void
  cancel(): void
  dispose(): void
}

function browserBeforeUnloadTarget(): BeforeUnloadTarget | null {
  return typeof window === 'undefined' ? null : window
}

function retryDelay(error: unknown, retryNumber: number): number | null {
  const status = error instanceof ApiException
    ? error.status
    : typeof error === 'object' && error !== null && 'status' in error
      ? Number((error as { status: unknown }).status)
      : NaN
  if (status === 404 || status === 405) return null
  if (status === 429) {
    const directed = error instanceof ApiException
      ? error.retryAfterMs
      : typeof error === 'object' && error !== null && 'retryAfterMs' in error
        ? Number((error as { retryAfterMs: unknown }).retryAfterMs)
        : NaN
    return typeof directed === 'number' && Number.isFinite(directed) && directed > 0 ? directed : 5000
  }
  return 1000 * (2 ** Math.max(0, retryNumber - 1))
}

export function createRemoteMirrorWriter({
  planId,
  delay = REMOTE_MIRROR_DELAY,
  now = () => new Date(),
  put = putPendingRevision,
  remove = deletePendingRevision,
  onState = () => {},
  eventTarget = browserBeforeUnloadTarget(),
}: {
  planId: string
  delay?: number
  now?: () => Date
  put?: (planId: string, mirror: DraftMirror, options?: { keepalive?: boolean }) => Promise<PutPendingRevisionResponse>
  remove?: (planId: string) => Promise<void>
  onState?: (state: RemoteMirrorState) => void
  eventTarget?: BeforeUnloadTarget | null
}): RemoteMirrorWriter {
  // Model: `latest` is the newest snapshot the coach produced; `serverGeneration`
  // is the generation of the snapshot the server most recently *received*
  // (completion order, not send order). The writer's only job is to make those
  // two agree once every request has settled — that single reconcile step is
  // what survives keepalive PUTs overlapping normal ones, out-of-order commits,
  // Retry-After back-off, DELETE interleaving, and unmount.
  let timer: ReturnType<typeof setTimeout> | null = null
  let timerKind: 'debounce' | 'retry' | null = null
  let latest: { content: DraftMirrorContent; generation: number } | null = null
  let generation = 0
  let serverGeneration = 0
  let retries = 0
  let retryWait: number | null = null
  let gaveUp = false
  let activePuts = 0
  let deleteRequested = false
  let deleting = false
  let flushAfterDelete = false
  let flushAfterDeleteKeepalive = false
  let disposed = false

  const notify = (state: RemoteMirrorState) => {
    if (!disposed) onState(state)
  }
  const cancelTimer = () => {
    if (timer !== null) clearTimeout(timer)
    timer = null
    timerKind = null
  }
  const dropLatest = () => {
    latest = null
    generation++
    retries = 0
    retryWait = null
    gaveUp = false
    cancelTimer()
  }

  let runPut: (keepalive: boolean) => void
  let runDelete: () => void
  let reconcile: () => void

  // Timers keep working after dispose (plan switch inside the SPA): a disposed
  // writer fires its PUT with keepalive so a closing page still gets a chance.
  const arm = (wait: number, kind: 'debounce' | 'retry') => {
    if (deleteRequested || !latest) return
    cancelTimer()
    timerKind = kind
    timer = setTimeout(() => {
      timer = null
      timerKind = null
      runPut(disposed)
    }, wait)
  }

  // Called whenever a request settles: bring the server back to `latest`.
  reconcile = () => {
    if (deleteRequested) {
      runDelete()
      return
    }
    if (activePuts > 0 || deleting || !latest || gaveUp) return
    if (serverGeneration === latest.generation) return
    if (timer !== null) return // a debounce or back-off timer already owns the next PUT
    if (retryWait !== null) {
      // The newest snapshot failed (e.g. 429): honour its back-off even when an
      // older request settles afterwards — never retry early, never reset budget.
      const wait = retryWait
      retryWait = null
      arm(wait, 'retry')
      return
    }
    // Either a newer snapshot arrived during the flight, or an older PUT committed
    // after the newest one and overwrote the server: replay the newest now.
    runPut(disposed)
  }

  runDelete = () => {
    if (activePuts > 0 || deleting || !deleteRequested) return
    cancelTimer()
    deleting = true
    void remove(planId)
      .catch(() => {})
      .finally(() => {
        deleting = false
        deleteRequested = false
        serverGeneration = 0
        const keepalive = flushAfterDeleteKeepalive
        const flush = flushAfterDelete
        flushAfterDelete = false
        flushAfterDeleteKeepalive = false
        if (!latest) return
        if (flush || disposed) runPut(keepalive || disposed)
        else arm(delay, 'debounce')
      })
  }

  runPut = (keepalive) => {
    if (!latest || gaveUp) return
    if (latest.generation === serverGeneration) return
    if (deleteRequested || deleting) {
      flushAfterDelete = true
      flushAfterDeleteKeepalive ||= keepalive
      return
    }
    // Normal PUTs serialize behind whatever is in flight (finally → reconcile).
    // A keepalive PUT (beforeunload / dispose) may overlap: the page is leaving.
    if (!keepalive && (disposed || activePuts > 0)) return
    cancelTimer()
    retryWait = null
    const captured = latest
    const mirror = createDraftMirror(planId, captured.content, now)
    activePuts++
    notify({ status: 'stashing' })
    void put(planId, mirror, { keepalive })
      .then((response) => {
        // Completion order decides what the server holds — even after dispose.
        serverGeneration = captured.generation
        if (latest && captured.generation === latest.generation) {
          retries = 0
          retryWait = null
          notify({
            status: 'saved',
            savedAt: typeof response.saved_at === 'string' ? response.saved_at : mirror.savedAt,
          })
        }
      })
      .catch((error: unknown) => {
        // Only failures of the newest snapshot consume the retry budget.
        if (!latest || captured.generation !== latest.generation || deleteRequested) return
        if (retries >= REMOTE_MIRROR_MAX_RETRIES) {
          gaveUp = true
          notify({ status: 'local-only' })
          return
        }
        const wait = retryDelay(error, retries + 1)
        if (wait === null) {
          gaveUp = true
          notify({ status: 'local-only' })
          return
        }
        retries++
        retryWait = wait
      })
      .finally(() => {
        activePuts--
        reconcile()
      })
  }

  const onBeforeUnload = () => { runPut(true) }
  eventTarget?.addEventListener('beforeunload', onBeforeUnload)

  return {
    schedule(content) {
      if (disposed) return
      latest = { content, generation: ++generation }
      gaveUp = false
      notify({ status: 'stashing' })
      // Editing during a Retry-After back-off must not shorten it: the armed
      // retry timer uploads whatever `latest` is when it fires.
      if (timerKind === 'retry') return
      retries = 0
      retryWait = null
      if (!deleteRequested && !deleting) arm(delay, 'debounce')
    },
    clear() {
      if (disposed) return
      dropLatest()
      deleteRequested = true
      flushAfterDelete = false
      flushAfterDeleteKeepalive = false
      notify({ status: 'idle' })
      runDelete()
    },
    markCovered(contentHash) {
      if (disposed) return
      if (latest && draftContentHash(latest.content) === contentHash) {
        // The explicit plan update applied exactly this snapshot: nothing left to stash.
        dropLatest()
        flushAfterDelete = false
        flushAfterDeleteKeepalive = false
      }
      // Whatever the server holds is now stale (either covered or older than a
      // newer edit); DELETE it, then reconcile re-uploads `latest` if any.
      deleteRequested = true
      notify(latest ? { status: 'stashing' } : { status: 'idle' })
      runDelete()
    },
    flush(options = {}) {
      runPut(options.keepalive === true)
    },
    cancel() {
      dropLatest()
      flushAfterDelete = false
      flushAfterDeleteKeepalive = false
      notify({ status: 'idle' })
    },
    dispose() {
      if (disposed) return
      eventTarget?.removeEventListener('beforeunload', onBeforeUnload)
      disposed = true
      // A Retry-After back-off already owns the next PUT: leave it armed (it
      // fires with keepalive now that we are disposed). Otherwise collapse the
      // debounce and snapshot the newest content with keepalive right away,
      // even if a normal PUT is in flight; a queued DELETE goes first.
      if (timerKind === 'retry') return
      cancelTimer()
      if (latest && !gaveUp && latest.generation !== serverGeneration) runPut(true)
      // Requested DELETEs stay fire-and-forget across unmount; an in-flight PUT
      // triggers it again from finally → reconcile once it settles.
      runDelete()
    },
  }
}
