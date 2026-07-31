import { describe, expect, it, vi } from 'vitest'
import { navigateCoachView } from './coachViewNavigation'

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((done) => { resolve = done })
  return { promise, resolve }
}

describe('navigateCoachView', () => {
  it('keeps the editor mounted when its leave guard refuses the rail switch', async () => {
    const commitView = vi.fn()
    const refreshEditor = vi.fn(async () => true)

    await expect(navigateCoachView({
      currentView: 'editor',
      nextView: 'board',
      guardLeave: vi.fn(async () => false),
      refreshEditor,
      commitView,
    })).resolves.toBe(false)

    expect(commitView).not.toHaveBeenCalled()
    expect(refreshEditor).not.toHaveBeenCalled()
  })

  it('awaits the editor flush before committing a rail switch', async () => {
    const flush = deferred<boolean>()
    const commitView = vi.fn()
    const navigation = navigateCoachView({
      currentView: 'editor',
      nextView: 'messages',
      guardLeave: vi.fn(() => flush.promise),
      refreshEditor: vi.fn(async () => true),
      commitView,
    })

    await Promise.resolve()
    expect(commitView).not.toHaveBeenCalled()
    flush.resolve(true)
    await expect(navigation).resolves.toBe(true)
    expect(commitView).toHaveBeenCalledWith('messages')
  })

  it('fetches the current plan before remounting the editor', async () => {
    const freshPlan = deferred<boolean>()
    const commitView = vi.fn()
    const refreshEditor = vi.fn(() => freshPlan.promise)
    const navigation = navigateCoachView({
      currentView: 'catalog',
      nextView: 'editor',
      refreshEditor,
      commitView,
    })

    expect(refreshEditor).toHaveBeenCalledTimes(1)
    expect(commitView).not.toHaveBeenCalled()
    freshPlan.resolve(true)
    await expect(navigation).resolves.toBe(true)
    expect(commitView).toHaveBeenCalledWith('editor')
  })

  it('does not remount the editor when the fresh-plan request is stale or fails', async () => {
    const commitView = vi.fn()

    await expect(navigateCoachView({
      currentView: 'board',
      nextView: 'editor',
      refreshEditor: vi.fn(async () => false),
      commitView,
    })).resolves.toBe(false)
    expect(commitView).not.toHaveBeenCalled()

    await expect(navigateCoachView({
      currentView: 'board',
      nextView: 'editor',
      refreshEditor: vi.fn(async () => { throw new Error('network') }),
      commitView,
    })).rejects.toThrow('network')
    expect(commitView).not.toHaveBeenCalled()
  })
})
