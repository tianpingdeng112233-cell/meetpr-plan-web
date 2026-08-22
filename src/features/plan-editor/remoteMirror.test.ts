import { afterEach, describe, expect, it, vi } from 'vitest'
import { ApiException } from '../../api/client'
import type { PutPendingRevisionResponse } from '../../api/pendingRevision'
import type { ExerciseRow, Week } from './types'
import { draftContentHash, type DraftMirror, type DraftMirrorContent } from './draftMirror'
import { createRemoteMirrorWriter } from './remoteMirror'

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej })
  return { promise, resolve, reject }
}

function content(note: string): DraftMirrorContent {
  const row: ExerciseRow = {
    id: 'row', serverRowId: null, serverSortOrder: null, hasLogs: false, conflictMessage: null,
    exerciseId: 'exercise', name: '深蹲', ku: true, custom: false, isMain: true,
    aux: false, reps: '5', mode: 'kg', boxes: [{ val: '100', empty: false }], note,
  }
  const weeks: Week[] = [{
    num: 1, num2: '01', range: '', isCurrent: false, vol: '',
    days: Array.from({ length: 7 }, (_, dow) => ({
      dow, dowLabel: `${dow}`, dateLabel: '', rest: dow !== 0, rows: dow === 0 ? [row] : [],
    })),
  }]
  return { weeks, planStartDate: '2026-01-01', weeksCount: 1 }
}

function response(savedAt = '2026-08-22T10:00:00.000Z'): PutPendingRevisionResponse {
  return { plan_id: 'plan', version: 3, content_hash: 'hash', saved_at: savedAt }
}

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('remote draft mirror writer', () => {
  it('debounces and coalesces writes to the latest content', async () => {
    vi.useFakeTimers()
    const put = vi.fn().mockResolvedValue(response())
    const writer = createRemoteMirrorWriter({ planId: 'plan', put, remove: vi.fn(), eventTarget: null })

    writer.schedule(content('first'))
    await vi.advanceTimersByTimeAsync(2000)
    writer.schedule(content('latest'))
    await vi.advanceTimersByTimeAsync(2999)
    expect(put).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(1)

    expect(put).toHaveBeenCalledTimes(1)
    expect(put.mock.calls[0][1].content.weeks[0].days[0].rows[0].note).toBe('latest')
    writer.dispose()
  })

  it('retries failures exponentially and respects Retry-After for 429', async () => {
    vi.useFakeTimers()
    const put = vi.fn()
      .mockRejectedValueOnce(new Error('offline'))
      .mockRejectedValueOnce(new ApiException(429, 'RATE_LIMITED', {}, 7000))
      .mockResolvedValue(response())
    const writer = createRemoteMirrorWriter({ planId: 'plan', delay: 10, put, remove: vi.fn(), eventTarget: null })

    writer.schedule(content('retry'))
    await vi.advanceTimersByTimeAsync(10)
    expect(put).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(999)
    expect(put).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(1)
    expect(put).toHaveBeenCalledTimes(2)
    await vi.advanceTimersByTimeAsync(6999)
    expect(put).toHaveBeenCalledTimes(2)
    await vi.advanceTimersByTimeAsync(1)
    expect(put).toHaveBeenCalledTimes(3)
    writer.dispose()
  })

  it('cancels a pending write and DELETEs when content returns to baseline', async () => {
    vi.useFakeTimers()
    const put = vi.fn().mockResolvedValue(response())
    const remove = vi.fn().mockResolvedValue(undefined)
    const writer = createRemoteMirrorWriter({ planId: 'plan', put, remove, eventTarget: null })

    writer.schedule(content('temporary'))
    writer.clear()
    await Promise.resolve()
    await vi.runAllTimersAsync()

    expect(remove).toHaveBeenCalledWith('plan')
    expect(put).not.toHaveBeenCalled()
    writer.dispose()
  })

  it('falls back to local-only after three bounded retries', async () => {
    vi.useFakeTimers()
    const put = vi.fn().mockRejectedValue(new Error('offline'))
    const onState = vi.fn()
    const writer = createRemoteMirrorWriter({
      planId: 'plan', delay: 10, put, remove: vi.fn(), onState, eventTarget: null,
    })

    writer.schedule(content('offline'))
    await vi.advanceTimersByTimeAsync(10 + 1000 + 2000 + 4000)

    expect(put).toHaveBeenCalledTimes(4)
    expect(onState).toHaveBeenLastCalledWith({ status: 'local-only' })
    writer.dispose()
  })

  it('flushes immediately with fetch keepalive semantics on beforeunload', async () => {
    vi.useFakeTimers()
    const put = vi.fn().mockResolvedValue(response())
    const target = new EventTarget()
    const writer = createRemoteMirrorWriter({
      planId: 'plan', put, remove: vi.fn(),
      eventTarget: target as unknown as Window,
    })

    writer.schedule(content('closing'))
    target.dispatchEvent(new Event('beforeunload'))
    await Promise.resolve()

    expect(put).toHaveBeenCalledTimes(1)
    expect(put.mock.calls[0][2]).toEqual({ keepalive: true })
    writer.dispose()
  })

  it('sends the latest pending snapshot with keepalive while an older PUT is in flight', async () => {
    vi.useFakeTimers()
    const first = deferred<PutPendingRevisionResponse>()
    const put = vi.fn()
      .mockImplementationOnce(() => first.promise)
      .mockResolvedValue(response('2026-08-22T10:01:00.000Z'))
    const writer = createRemoteMirrorWriter({ planId: 'plan', put, remove: vi.fn(), eventTarget: null })

    writer.schedule(content('older in flight'))
    await vi.advanceTimersByTimeAsync(3000)
    writer.schedule(content('latest before unload'))
    writer.flush({ keepalive: true })
    await Promise.resolve()

    expect(put).toHaveBeenCalledTimes(2)
    expect(put.mock.calls[1][1].content.weeks[0].days[0].rows[0].note).toBe('latest before unload')
    expect(put.mock.calls[1][2]).toEqual({ keepalive: true })
    first.resolve(response())
    await first.promise
    await Promise.resolve()
    await Promise.resolve()
    await Promise.resolve()
    expect(put).toHaveBeenCalledTimes(3)
    expect(put.mock.calls[2][1].content.weeks[0].days[0].rows[0].note).toBe('latest before unload')
    writer.dispose()
  })

  it('replays the latest snapshot when an older PUT commits after the keepalive PUT', async () => {
    vi.useFakeTimers()
    const requests = [
      deferred<PutPendingRevisionResponse>(),
      deferred<PutPendingRevisionResponse>(),
    ]
    const server = { note: '', commits: [] as string[] }
    const put = vi.fn((_planId: string, mirror: DraftMirror) => {
      const request = requests[put.mock.calls.length - 1]
      return request
        ? request.promise.then((value) => {
          server.note = mirror.content.weeks[0].days[0].rows[0].note
          server.commits.push(server.note)
          return value
        })
        : Promise.resolve(response('2026-08-22T10:02:00.000Z')).then((value) => {
          server.note = mirror.content.weeks[0].days[0].rows[0].note
          server.commits.push(server.note)
          return value
        })
    })
    const writer = createRemoteMirrorWriter({ planId: 'plan', put, remove: vi.fn(), eventTarget: null })

    writer.schedule(content('A'))
    await vi.advanceTimersByTimeAsync(3000)
    writer.schedule(content('B'))
    writer.flush({ keepalive: true })
    expect(put).toHaveBeenCalledTimes(2)

    requests[1].resolve(response('2026-08-22T10:01:00.000Z'))
    await requests[1].promise
    await Promise.resolve()
    expect(server.note).toBe('B')

    requests[0].resolve(response())
    await requests[0].promise
    await Promise.resolve()
    await Promise.resolve()
    await Promise.resolve()
    await Promise.resolve()

    expect(put).toHaveBeenCalledTimes(3)
    expect(put.mock.calls[2][1].content.weeks[0].days[0].rows[0].note).toBe('B')
    expect(server.commits).toEqual(['B', 'A', 'B'])
    expect(server.note).toBe('B')
    writer.dispose()
  })

  it('uses the writer default five-second delay for a 429 without a valid directed delay', async () => {
    vi.useFakeTimers()
    const put = vi.fn()
      .mockRejectedValueOnce(new ApiException(429, 'RATE_LIMITED'))
      .mockResolvedValueOnce(response())
    const writer = createRemoteMirrorWriter({ planId: 'plan', delay: 10, put, remove: vi.fn(), eventTarget: null })

    writer.schedule(content('rate limited'))
    await vi.advanceTimersByTimeAsync(10)
    await vi.advanceTimersByTimeAsync(4999)
    expect(put).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(1)
    expect(put).toHaveBeenCalledTimes(2)
    writer.dispose()
  })

  it('finishes a requested DELETE after an in-flight PUT even when disposed immediately', async () => {
    vi.useFakeTimers()
    const first = deferred<PutPendingRevisionResponse>()
    const put = vi.fn(() => first.promise)
    const remove = vi.fn().mockResolvedValue(undefined)
    const writer = createRemoteMirrorWriter({ planId: 'plan', delay: 10, put, remove, eventTarget: null })

    writer.schedule(content('being discarded'))
    await vi.advanceTimersByTimeAsync(10)
    writer.clear()
    writer.dispose()
    expect(remove).not.toHaveBeenCalled()

    first.resolve(response())
    await first.promise
    await Promise.resolve()
    await Promise.resolve()
    expect(remove).toHaveBeenCalledWith('plan')
  })

  it('flushes pending content with keepalive before disposal', async () => {
    const put = vi.fn().mockResolvedValue(response())
    const writer = createRemoteMirrorWriter({ planId: 'plan', put, remove: vi.fn(), eventTarget: null })

    writer.schedule(content('pending at dispose'))
    writer.dispose()
    await Promise.resolve()

    expect(put).toHaveBeenCalledTimes(1)
    expect(put.mock.calls[0][1].content.weeks[0].days[0].rows[0].note).toBe('pending at dispose')
    expect(put.mock.calls[0][2]).toEqual({ keepalive: true })
  })

  it('serializes schedule/clear/markCovered/flush/dispose so a newer edit survives DELETE', async () => {
    vi.useFakeTimers()
    const firstPut = deferred<PutPendingRevisionResponse>()
    const deletion = deferred<void>()
    const put = vi.fn()
      .mockImplementationOnce(() => firstPut.promise)
      .mockResolvedValueOnce(response('2026-08-22T10:02:00.000Z'))
    const remove = vi.fn(() => deletion.promise)
    const writer = createRemoteMirrorWriter({ planId: 'plan', delay: 10, put, remove, eventTarget: null })
    const covered = content('covered update')
    const newer = content('newer edit')

    writer.schedule(covered)
    await vi.advanceTimersByTimeAsync(10)
    writer.schedule(newer)
    writer.clear()
    writer.schedule(covered)
    writer.markCovered(draftContentHash(covered))
    writer.schedule(newer)
    writer.flush()
    writer.dispose()

    firstPut.resolve(response())
    await firstPut.promise
    await Promise.resolve()
    await Promise.resolve()
    expect(remove).toHaveBeenCalledWith('plan')
    expect(put).toHaveBeenCalledTimes(1)

    deletion.resolve()
    await deletion.promise
    await Promise.resolve()
    await Promise.resolve()
    expect(put).toHaveBeenCalledTimes(2)
    expect(put.mock.calls[1][1].content.weeks[0].days[0].rows[0].note).toBe('newer edit')
    expect(put.mock.calls[1][2]).toEqual({ keepalive: true })
  })
  it('replays the newest snapshot with keepalive when an older PUT commits after dispose', async () => {
    vi.useFakeTimers()
    const requests = [deferred<PutPendingRevisionResponse>(), deferred<PutPendingRevisionResponse>()]
    const server = { commits: [] as string[] }
    const put = vi.fn((_planId: string, mirror: DraftMirror, _options?: { keepalive?: boolean }) => {
      const note = mirror.content.weeks[0].days[0].rows[0].note
      const request = requests[put.mock.calls.length - 1]
      const settle = (value: PutPendingRevisionResponse) => { server.commits.push(note); return value }
      return request ? request.promise.then(settle) : Promise.resolve(response()).then(settle)
    })
    const writer = createRemoteMirrorWriter({ planId: 'plan', put, remove: vi.fn(), eventTarget: null })

    writer.schedule(content('A'))
    await vi.advanceTimersByTimeAsync(3000)      // A: normal PUT in flight
    writer.schedule(content('B'))
    writer.dispose()                              // B: keepalive PUT, component gone
    expect(put).toHaveBeenCalledTimes(2)

    requests[1].resolve(response('2026-08-22T10:01:00.000Z'))
    await requests[1].promise
    await Promise.resolve()
    requests[0].resolve(response())               // stale A commits last
    await requests[0].promise
    for (let i = 0; i < 6; i++) await Promise.resolve()

    expect(put).toHaveBeenCalledTimes(3)
    expect(put.mock.calls[2][1].content.weeks[0].days[0].rows[0].note).toBe('B')
    expect(put.mock.calls[2][2]).toEqual({ keepalive: true })
    expect(server.commits).toEqual(['B', 'A', 'B'])
  })

  it('keeps the newest snapshot\'s Retry-After back-off and budget when an older PUT settles later', async () => {
    vi.useFakeTimers()
    const older = deferred<PutPendingRevisionResponse>()
    const put = vi.fn()
      .mockImplementationOnce(() => older.promise)
      .mockRejectedValueOnce(new ApiException(429, 'RATE_LIMITED', {}, 7000))
      .mockResolvedValue(response('2026-08-22T10:03:00.000Z'))
    const states: string[] = []
    const writer = createRemoteMirrorWriter({
      planId: 'plan', put, remove: vi.fn(), eventTarget: null, onState: (s) => states.push(s.status),
    })

    writer.schedule(content('A'))
    await vi.advanceTimersByTimeAsync(3000)      // A in flight
    writer.schedule(content('B'))
    writer.flush({ keepalive: true })             // B rejected with 429 Retry-After 7s
    await Promise.resolve(); await Promise.resolve(); await Promise.resolve()
    expect(put).toHaveBeenCalledTimes(2)

    older.resolve(response())                     // stale A settles afterwards
    await older.promise
    for (let i = 0; i < 6; i++) await Promise.resolve()
    expect(put).toHaveBeenCalledTimes(2)          // no early retry
    await vi.advanceTimersByTimeAsync(6999)
    expect(put).toHaveBeenCalledTimes(2)
    await vi.advanceTimersByTimeAsync(1)
    expect(put).toHaveBeenCalledTimes(3)          // retried exactly at Retry-After
    expect(put.mock.calls[2][1].content.weeks[0].days[0].rows[0].note).toBe('B')
    await Promise.resolve(); await Promise.resolve()
    expect(states.at(-1)).toBe('saved')
    writer.dispose()
  })
  it('honours Retry-After for the keepalive snapshot even after dispose', async () => {
    vi.useFakeTimers()
    const older = deferred<PutPendingRevisionResponse>()
    const put = vi.fn()
      .mockImplementationOnce(() => older.promise)
      .mockRejectedValueOnce(new ApiException(429, 'RATE_LIMITED', {}, 7000))
      .mockResolvedValue(response('2026-08-22T10:04:00.000Z'))
    const writer = createRemoteMirrorWriter({ planId: 'plan', put, remove: vi.fn(), eventTarget: null })

    writer.schedule(content('A'))
    await vi.advanceTimersByTimeAsync(3000)      // A in flight
    writer.schedule(content('B'))
    writer.dispose()                              // B keepalive → 429 Retry-After 7s
    await Promise.resolve(); await Promise.resolve(); await Promise.resolve()
    expect(put).toHaveBeenCalledTimes(2)

    older.resolve(response())                     // stale A settles afterwards
    await older.promise
    for (let i = 0; i < 6; i++) await Promise.resolve()
    expect(put).toHaveBeenCalledTimes(2)          // no immediate retry after dispose
    await vi.advanceTimersByTimeAsync(6999)
    expect(put).toHaveBeenCalledTimes(2)
    await vi.advanceTimersByTimeAsync(1)
    expect(put).toHaveBeenCalledTimes(3)
    expect(put.mock.calls[2][1].content.weeks[0].days[0].rows[0].note).toBe('B')
    expect(put.mock.calls[2][2]).toEqual({ keepalive: true })
  })
  it('keeps an armed Retry-After back-off across dispose instead of flushing early', async () => {
    vi.useFakeTimers()
    const put = vi.fn()
      .mockRejectedValueOnce(new ApiException(429, 'RATE_LIMITED', {}, 7000))
      .mockResolvedValue(response('2026-08-22T10:05:00.000Z'))
    const writer = createRemoteMirrorWriter({ planId: 'plan', delay: 10, put, remove: vi.fn(), eventTarget: null })

    writer.schedule(content('throttled'))
    await vi.advanceTimersByTimeAsync(10)         // PUT → 429, 7 s back-off armed
    await Promise.resolve(); await Promise.resolve(); await Promise.resolve()
    expect(put).toHaveBeenCalledTimes(1)
    writer.dispose()                              // must not flush early
    await Promise.resolve(); await Promise.resolve()
    expect(put).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(6999)
    expect(put).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(1)
    expect(put).toHaveBeenCalledTimes(2)
    expect(put.mock.calls[1][2]).toEqual({ keepalive: true })
  })
  it('does not let a new edit cut an armed Retry-After back-off short', async () => {
    vi.useFakeTimers()
    const put = vi.fn()
      .mockRejectedValueOnce(new ApiException(429, 'RATE_LIMITED', {}, 7000))
      .mockResolvedValue(response('2026-08-22T10:06:00.000Z'))
    const writer = createRemoteMirrorWriter({ planId: 'plan', delay: 10, put, remove: vi.fn(), eventTarget: null })

    writer.schedule(content('first'))
    await vi.advanceTimersByTimeAsync(10)         // PUT → 429, 7 s back-off armed
    await Promise.resolve(); await Promise.resolve(); await Promise.resolve()
    expect(put).toHaveBeenCalledTimes(1)
    writer.schedule(content('edited during back-off'))
    await vi.advanceTimersByTimeAsync(10)         // debounce must NOT fire
    expect(put).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(6989)
    expect(put).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(1)
    expect(put).toHaveBeenCalledTimes(2)
    expect(put.mock.calls[1][1].content.weeks[0].days[0].rows[0].note).toBe('edited during back-off')
    writer.dispose()
  })
})
