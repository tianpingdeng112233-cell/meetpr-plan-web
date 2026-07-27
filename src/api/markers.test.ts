import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { CreateVideoMarkerPayload } from './types'
import { createVideoMarker, deleteVideoMarker, getVideoMarkers } from './markers'

const marker = {
  id: 'marker-1',
  video_id: 'video-1',
  coach_id: 'coach-1',
  time_ms: 12_000,
  level: 'warn' as const,
  note: '骨盆先动',
  created_at: '2026-07-27T12:00:00Z',
}

function response(status: number, body?: unknown): Response {
  return new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
  })
}

describe('video markers API', () => {
  beforeEach(() => {
    const store = new Map<string, string>()
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => void store.set(key, value),
      removeItem: (key: string) => void store.delete(key),
      clear: () => store.clear(),
    })
  })

  afterEach(() => vi.restoreAllMocks())

  it('uses the snake_case GET and POST contract', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(response(200, { markers: [marker] }))
      .mockResolvedValueOnce(response(201, marker))
    vi.stubGlobal('fetch', fetchMock)

    await expect(getVideoMarkers('video-1')).resolves.toEqual([marker])
    await expect(createVideoMarker('video-1', {
      time_ms: 12_000,
      level: 'warn',
      note: '骨盆先动',
    })).resolves.toEqual(marker)

    expect(fetchMock.mock.calls[0]?.[0]).toBe('/api/videos/video-1/markers')
    expect(fetchMock.mock.calls[1]?.[0]).toBe('/api/videos/video-1/markers')
    expect(fetchMock.mock.calls[1]?.[1]).toMatchObject({ method: 'POST' })
    expect(JSON.parse(fetchMock.mock.calls[1]?.[1].body as string)).toEqual({
      time_ms: 12_000,
      level: 'warn',
      note: '骨盆先动',
    })
  })

  it('deletes a marker from its video-scoped route', async () => {
    const fetchMock = vi.fn().mockResolvedValue(response(204))
    vi.stubGlobal('fetch', fetchMock)

    await expect(deleteVideoMarker('video-1', 'marker-1')).resolves.toBeUndefined()
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/videos/video-1/markers/marker-1',
      expect.objectContaining({ method: 'DELETE' }),
    )
  })

  it.each([
    ['GET', 404, () => getVideoMarkers('video-1')],
    ['GET', 409, () => getVideoMarkers('video-1')],
    ['POST', 422, () => createVideoMarker('video-1', {
      time_ms: 12_000,
      level: 'warn',
      note: '骨盆先动',
    } satisfies CreateVideoMarkerPayload)],
  ])('preserves a %s %i response as an API error', async (_method, status, request) => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response(status, { error: `MARKER_${status}` })))

    await expect(request()).rejects.toMatchObject({ status, code: `MARKER_${status}` })
  })
})
