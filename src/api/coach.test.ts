import { afterEach, expect, it, vi } from 'vitest'
import { getStudentSetLogs, getExerciseStats } from './coach'

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

it('encodes exercise history and sends only valid dependent sets/reps filters', async () => {
  vi.stubGlobal('localStorage', { getItem: () => null })
  const fetchMock = vi.fn().mockImplementation(() => Promise.resolve(new Response('{}', { status: 200 })))
  vi.stubGlobal('fetch', fetchMock)
  await getExerciseStats('student', 'sumo / dl', { sets: 4, reps: 3 })
  expect(fetchMock.mock.calls[0][0]).toBe('/api/coach/students/student/exercise-stats?exercise_id=sumo%20%2F%20dl&sets=4&reps=3')
  await getExerciseStats('student', 'sumo', { reps: 3 })
  expect(fetchMock.mock.calls[1][0]).toBe('/api/coach/students/student/exercise-stats?exercise_id=sumo')
})
