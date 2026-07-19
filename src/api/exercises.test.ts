import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createCustomExercise, customExerciseBody, getExerciseUsageStats } from './exercises'

function res(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

describe('createCustomExercise', () => {
  beforeEach(() => {
    const store = new Map<string, string>()
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k),
      clear: () => store.clear(),
    })
  })
  afterEach(() => vi.restoreAllMocks())

  it('builds the complete backend payload for coach custom accessory exercises', () => {
    expect(customExerciseBody({
      name: ' 平板侧支撑 ',
      muscleGroup: 'core',
      equipment: 'bodyweight',
      movementPattern: 'other',
    })).toEqual({
      name: '平板侧支撑',
      exercise_type: 'accessory',
      main_lift_family: null,
      is_competition_lift: false,
      muscle_groups: ['core'],
      equipment: ['bodyweight'],
      movement_pattern: ['other'],
    })
  })

  it('keeps the primary muscle first and supports synergists plus multiple equipment', () => {
    expect(customExerciseBody({
      name: '史密斯箭步蹲',
      muscleGroups: ['quad', 'glute', 'quad'],
      equipmentList: ['machine', 'barbell', 'machine'],
      movementPattern: 'squat',
    })).toMatchObject({
      muscle_groups: ['quad', 'glute'],
      equipment: ['machine', 'barbell'],
      movement_pattern: ['squat'],
    })
  })

  it('posts that payload to /exercises', async () => {
    const fetchMock = vi.fn().mockResolvedValue(res(201, {
      id: 'ex-1',
      name: '哑铃划船',
      name_en: null,
      exercise_type: 'accessory',
      main_lift_family: null,
      is_competition_lift: false,
      muscle_groups: ['back'],
      equipment: ['dumbbell'],
      movement_pattern: ['horizontal_pull'],
      competition_stance: null,
      created_by_coach_id: 'coach-1',
      created_at: '2026-07-08T00:00:00.000Z',
    }))
    vi.stubGlobal('fetch', fetchMock)

    await expect(createCustomExercise({
      name: '哑铃划船',
      muscleGroup: 'back',
      equipment: 'dumbbell',
      movementPattern: 'horizontal_pull',
    })).resolves.toMatchObject({ id: 'ex-1', name: '哑铃划船' })

    expect(fetchMock).toHaveBeenCalledWith('/api/exercises', expect.objectContaining({ method: 'POST' }))
    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string)
    expect(body).toEqual({
      name: '哑铃划船',
      exercise_type: 'accessory',
      main_lift_family: null,
      is_competition_lift: false,
      muscle_groups: ['back'],
      equipment: ['dumbbell'],
      movement_pattern: ['horizontal_pull'],
    })
  })

  it('fetches coach-scoped usage stats from the fixed endpoint', async () => {
    const fetchMock = vi.fn().mockResolvedValue(res(200, {
      stats: [{ exercise_id: 'ex-1', plan_count: 7 }],
    }))
    vi.stubGlobal('fetch', fetchMock)

    await expect(getExerciseUsageStats()).resolves.toEqual([{ exercise_id: 'ex-1', plan_count: 7 }])
    expect(fetchMock).toHaveBeenCalledWith('/api/exercises/usage-stats', expect.objectContaining({ method: 'GET' }))
  })
})
