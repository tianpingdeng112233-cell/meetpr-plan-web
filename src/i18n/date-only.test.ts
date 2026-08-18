import { afterAll, beforeAll, describe, expect, it } from 'vitest'

describe('date-only formatting', () => {
  const nodeProcess = (globalThis as typeof globalThis & {
    process: { env: Record<string, string | undefined> }
  }).process
  const previousTimezone = nodeProcess.env.TZ

  beforeAll(async () => {
    nodeProcess.env.TZ = 'America/Los_Angeles'
    const { setLocale } = await import('./locale')
    setLocale('en')
  })

  afterAll(async () => {
    if (previousTimezone === undefined) delete nodeProcess.env.TZ
    else nodeProcess.env.TZ = previousTimezone
    const { setLocale } = await import('./locale')
    setLocale('zh')
  })

  it('keeps a date-only value on its local calendar day in Pacific time', async () => {
    const { shortDate } = await import('../features/workspace/WorkspaceCommon')
    expect(shortDate('2026-08-18')).toBe('Aug 18')
  })
})
