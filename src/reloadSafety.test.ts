import { describe, expect, it } from 'vitest'
import { isReloadBlocked, registerReloadBlocker } from './reloadSafety'

describe('safe automatic reload registry', () => {
  it('blocks while any mounted editor reports at-risk content', () => {
    const removeSafe = registerReloadBlocker(() => false)
    const removeDirty = registerReloadBlocker(() => true)
    expect(isReloadBlocked()).toBe(true)
    removeDirty()
    expect(isReloadBlocked()).toBe(false)
    removeSafe()
  })
})
