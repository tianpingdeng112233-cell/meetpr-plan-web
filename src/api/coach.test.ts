import { afterEach, expect, it, vi } from 'vitest'
import { getStudentSetLogs, getExerciseStats, unbindCoachStudent, setCoachStudentAlias, refreshCoachStudents } from './coach'
import type { CoachStudent } from './types'

afterEach(() => vi.unstubAllGlobals())

it('opts into ended students while preserving the legacy roster request and response', async () => {
  vi.stubGlobal('localStorage', { getItem: () => null })
  const legacy: CoachStudent = { id: 'active', display_name: '王明', status: 'active', evaluation: null }
  const ended: CoachStudent = {
    ...legacy, id: 'ended', alias: '小王', bond_status: 'ended',
    ended_at: '2026-11-01T12:00:00Z', today: null, pending_video_count: 0,
  }
  const fetchMock = vi.fn()
    .mockResolvedValueOnce(new Response(JSON.stringify({ students: [legacy] })))
    .mockResolvedValueOnce(new Response(JSON.stringify({ students: [legacy, ended] })))
    .mockResolvedValueOnce(new Response(JSON.stringify({ students: [legacy] })))
  vi.stubGlobal('fetch', fetchMock)
  await expect(refreshCoachStudents()).resolves.toEqual([legacy])
  await expect(refreshCoachStudents({ include_ended: true })).resolves.toEqual([legacy, ended])
  await expect(refreshCoachStudents({ include_ended: false })).resolves.toEqual([legacy])
  expect(fetchMock.mock.calls.map(([path]) => path)).toEqual([
    '/api/coach/students', '/api/coach/students?include_ended=1', '/api/coach/students',
  ])
  expect(fetchMock.mock.calls.every(([, options]) => options.method === 'GET' && options.body === undefined)).toBe(true)
})

it.each(['小王', null])('sets or clears a coach-only alias (%s)', async (alias) => {
  vi.stubGlobal('localStorage', { getItem: () => null })
  const fetchMock = vi.fn().mockResolvedValue(new Response('{}', { status: 200 }))
  vi.stubGlobal('fetch', fetchMock)
  await setCoachStudentAlias('student-1', alias)
  expect(fetchMock).toHaveBeenCalledWith(
    '/api/coach/students/student-1',
    expect.objectContaining({ method: 'PATCH', body: JSON.stringify({ alias }) }),
  )
})

it('unbinds a coach student through the unbind endpoint', async () => {
  vi.stubGlobal('localStorage', { getItem: () => null })
  const fetchMock = vi.fn().mockResolvedValue(new Response('{}', { status: 200 }))
  vi.stubGlobal('fetch', fetchMock)
  await unbindCoachStudent('student-1')
  expect(fetchMock).toHaveBeenCalledWith(
    '/api/coach/students/student-1/unbind',
    expect.objectContaining({ method: 'POST', body: undefined }),
  )
})

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
