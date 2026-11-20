import { afterEach, expect, it, vi } from 'vitest'
import { batchDays, publishPlan } from './plans'

afterEach(() => vi.unstubAllGlobals())

it('requests partial publication for both initial delivery and batch updates', async () => {
  vi.stubGlobal('localStorage', { getItem: () => null })
  const fetchMock = vi.fn().mockImplementation(async () => new Response('{}'))
  vi.stubGlobal('fetch', fetchMock)
  const body = { delete_day_ids: [], upsert_days: [] }
  await publishPlan('p')
  await batchDays('p', body)
  expect(fetchMock).toHaveBeenCalledWith('/api/plans/p/publish?allow_empty_training_days=true',
    expect.objectContaining({ method: 'POST' }))
  expect(fetchMock).toHaveBeenCalledWith('/api/plans/p/days/batch?include_rest_days=true&allow_empty_training_days=true',
    expect.objectContaining({ method: 'POST', body: JSON.stringify(body) }))
})
