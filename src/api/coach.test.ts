import { afterEach, expect, it, vi } from 'vitest'
import { getStudentSetLogs } from './coach'

afterEach(() => vi.unstubAllGlobals())

it('requests scope=all and accepts the legacy response without plan_day_id', async () => {
  vi.stubGlobal('localStorage', { getItem: () => null })
  const logs = [{ id: 'legacy', plan_exercise_id: 'pe-1' }]
  const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ logs }), { status: 200 }))
  vi.stubGlobal('fetch', fetchMock)
  await expect(getStudentSetLogs('student-1', '2026-08-01', '2026-08-10')).resolves.toEqual(logs)
  expect(fetchMock).toHaveBeenCalledWith(
    '/api/students/student-1/sets?from=2026-08-01&to=2026-08-10&scope=all',
    expect.objectContaining({ method: 'GET' }),
  )
})
