import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createCustomExercise, customExerciseBody, customExercisePatchBody, deleteCustomExercise, getExerciseUsageStats, updateCustomExercise } from './exercises'

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

  it('trims an optional English name and sends blank English names as null', () => {
    expect(customExerciseBody({ name: '帕洛夫推', nameEn: ' Cable Pallof Press ' })).toMatchObject({
      name: '帕洛夫推',
      name_en: 'Cable Pallof Press',
    })
    expect(customExerciseBody({ name: '帕洛夫推', nameEn: '  ' })).toMatchObject({ name_en: null })
    expect(customExerciseBody({ name: '帕洛夫推' })).not.toHaveProperty('name_en')
  })

  it('builds a main-lift variation payload when the coach picks that 分类', () => {
    expect(customExerciseBody({
      name: '高杆节奏蹲310',
      exerciseType: 'main_lift_variation',
      mainLiftFamily: 'squat',
      muscleGroup: 'quad',
      equipment: 'barbell',
      movementPattern: 'squat',
    })).toMatchObject({
      exercise_type: 'main_lift_variation',
      main_lift_family: 'squat',
      is_competition_lift: false,
    })
  })

  it('falls back to accessory when a variation is requested without a family', () => {
    expect(customExerciseBody({
      name: '节奏无腿卧推530',
      exerciseType: 'main_lift_variation',
      muscleGroup: 'chest',
      equipment: 'barbell',
      movementPattern: 'horizontal_push',
    })).toMatchObject({ exercise_type: 'accessory', main_lift_family: null })
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

  it('patches only the edited fields so untouched type/competition fields survive a rename', async () => {
    const original = {
      id: 'ex-1', name: '帕洛夫推', name_en: null, exercise_type: 'main_lift' as const,
      main_lift_family: 'bench' as const, is_competition_lift: true, muscle_groups: ['core' as const], equipment: ['cable' as const],
      movement_pattern: ['other' as const], competition_stance: null, created_by_coach_id: 'coach-1',
      created_at: '2026-07-08T00:00:00.000Z',
    }
    const updated = { ...original, name: '绳索帕洛夫推', name_en: 'Cable Pallof Press' }
    const fetchMock = vi.fn().mockResolvedValue(res(200, updated))
    vi.stubGlobal('fetch', fetchMock)

    // The catalog edit form cannot express `main_lift`, so it omits exerciseType; nothing else changed.
    const input = { name: '绳索帕洛夫推', nameEn: 'Cable Pallof Press', muscleGroups: ['core' as const], equipmentList: ['cable' as const], movementPattern: 'other' as const }
    expect(customExercisePatchBody(input, original)).toEqual({ name: '绳索帕洛夫推', name_en: 'Cable Pallof Press' })
    await expect(updateCustomExercise('ex-1', input, original)).resolves.toEqual(updated)
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('/api/exercises/ex-1')
    expect(init.method).toBe('PATCH')
    expect(JSON.parse(init.body as string)).toEqual({ name: '绳索帕洛夫推', name_en: 'Cable Pallof Press' })

    // Clearing the English name sends an explicit null; switching type sends both type fields.
    expect(customExercisePatchBody({ name: '帕洛夫推', nameEn: '', exerciseType: 'accessory' }, { ...original, name_en: 'Pallof' }))
      .toEqual({ name_en: null, exercise_type: 'accessory', main_lift_family: null })
  })

  it('skips the request when the edit changes nothing', async () => {
    const original = {
      id: 'ex-1', name: '帕洛夫推', name_en: null, exercise_type: 'accessory' as const,
      main_lift_family: null, is_competition_lift: false, muscle_groups: ['core' as const], equipment: ['cable' as const],
      movement_pattern: ['other' as const], competition_stance: null, created_by_coach_id: 'coach-1',
      created_at: '2026-07-08T00:00:00.000Z',
    }
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    await expect(updateCustomExercise('ex-1', { name: ' 帕洛夫推 ', nameEn: null, muscleGroup: 'core', equipment: 'cable' }, original)).resolves.toBe(original)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('deletes an owned custom exercise and preserves 409 usage counts', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
      .mockResolvedValueOnce(res(409, { error: 'EXERCISE_IN_USE', plan_count: 3, log_count: 7 }))
    vi.stubGlobal('fetch', fetchMock)

    await expect(deleteCustomExercise('free')).resolves.toBeUndefined()
    await expect(deleteCustomExercise('used')).rejects.toMatchObject({
      status: 409,
      code: 'EXERCISE_IN_USE',
      details: { plan_count: 3, log_count: 7 },
    })
  })
})
