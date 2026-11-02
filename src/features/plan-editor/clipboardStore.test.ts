import { beforeEach, expect, it } from 'vitest'
import { createClipboardStore, type EditorClipboard } from './clipboardStore'
import { blockRow } from './blockGridTestUtils'

const copied: EditorClipboard = { kind: 'row', text: 'copied text', rows: [blockRow('copied')] }
beforeEach(() => sessionStorage.clear())

it('reads the last copy after recreating the store and replaces it on the next copy', () => {
  const store = createClipboardStore()
  expect(store.read()).toBeNull()
  store.write(copied)
  expect(createClipboardStore().read()).toEqual(copied)
  const next: EditorClipboard = { kind: 'days', text: 'next', days: [{ offset: 0, rows: [] }, { offset: 2, rows: copied.rows }] }
  store.write(next)
  expect(createClipboardStore().read()).toEqual(next)
})

it.each(['access', 'read', 'write'])('keeps the latest copy in memory when storage %s throws', (failure) => {
  let fail = false
  const storage = {
    getItem: (key: string) => { if (fail && failure === 'read') throw new Error('blocked'); return sessionStorage.getItem(key) },
    setItem: (key: string, value: string) => { if (fail && failure === 'write') throw new Error('quota'); sessionStorage.setItem(key, value) },
  }
  const store = createClipboardStore(() => { if (fail && failure === 'access') throw new Error('denied'); return storage })
  store.write(copied)
  fail = true
  // Reading may fail before the next copy, or only writing may fail.
  expect(store.read()).toEqual(copied)
  const next: EditorClipboard = { kind: 'day', text: 'latest', rows: [] }
  store.write(next)
  expect(store.read()).toEqual(next)
  fail = false
  expect(store.read()).toEqual(next) // a stale stored copy must not win
})

it('keeps the written copy when persisted data fails validation', () => {
  const store = createClipboardStore()
  store.write(copied)
  const key = sessionStorage.key(0)!
  sessionStorage.setItem(key, JSON.stringify({ version: 1, content: { kind: 'row', text: '', rows: [{}] } }))
  expect(store.read()).toEqual(copied)
})

it.each([
  '{',
  JSON.stringify({ version: 2, content: copied }),
  JSON.stringify({ version: 1, content: { kind: 'unknown', text: '' } }),
  JSON.stringify({ version: 1, content: { kind: 'row', text: '', rows: [{}] } }),
  JSON.stringify({ version: 1, content: { kind: 'days', text: '', days: [{ offset: '2', rows: [] }] } }),
])('treats malformed or unsupported persisted data as empty: %s', (raw) => {
  const store = createClipboardStore()
  store.write(copied)
  const key = sessionStorage.key(0)!
  sessionStorage.setItem(key, raw)
  expect(createClipboardStore().read()).toBeNull()
  store.write(copied)
  expect(createClipboardStore().read()).toEqual(copied)
})

it('starts empty in an independent tab storage area', () => {
  createClipboardStore().write(copied)
  const otherTab = createClipboardStore(() => ({ getItem: () => null, setItem: () => {} }))
  expect(otherTab.read()).toBeNull()
})
