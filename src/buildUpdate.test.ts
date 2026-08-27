import { afterEach, describe, expect, it, vi } from 'vitest'
import { buildIdFromHtml, fetchDeployedBuildId, monitorBuildUpdates } from './buildUpdate'

describe('web build update monitor', () => {
  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('reads only a valid numeric build id', () => {
    expect(buildIdFromHtml('<meta name="meetpr-build-id" content="1787824347672">')).toBe(1787824347672)
    expect(buildIdFromHtml('<meta name="meetpr-build-id" content="release-a">')).toBeNull()
    expect(buildIdFromHtml('<html></html>')).toBeNull()
  })

  it('fetches the uncached deployed index instead of an API route', async () => {
    const fetcher = vi.fn().mockResolvedValue({
      ok: true,
      text: async () => '<meta name="meetpr-build-id" content="200">',
    })
    await expect(fetchDeployedBuildId(fetcher)).resolves.toBe(200)
    const [url, init] = fetcher.mock.calls[0]
    expect(String(url)).toContain('/?_meetpr_build_check=')
    expect(init).toMatchObject({ cache: 'no-store', headers: { Accept: 'text/html' } })
  })

  it('announces a newer build only after a second post-rollout confirmation', async () => {
    vi.useFakeTimers()
    const onNewBuild = vi.fn()
    const fetchBuildId = vi.fn().mockResolvedValue(200)
    const stop = monitorBuildUpdates(onNewBuild, {
      currentId: 100,
      fetchBuildId,
      intervalMs: 60_000,
      confirmDelayMs: 50,
    })

    await Promise.resolve()
    expect(onNewBuild).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(50)
    expect(fetchBuildId).toHaveBeenCalledTimes(2)
    expect(onNewBuild).toHaveBeenCalledTimes(1)
    stop()
  })

  it('never rolls a newer tab back to an older replica', async () => {
    vi.useFakeTimers()
    const onNewBuild = vi.fn()
    const fetchBuildId = vi.fn().mockResolvedValue(100)
    const stop = monitorBuildUpdates(onNewBuild, {
      currentId: 200,
      fetchBuildId,
      intervalMs: 100,
      confirmDelayMs: 10,
    })

    await vi.advanceTimersByTimeAsync(500)
    expect(onNewBuild).not.toHaveBeenCalled()
    stop()
  })
})
