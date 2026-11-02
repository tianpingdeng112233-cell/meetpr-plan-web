import { useCallback, useState } from 'react'

export function usePersistentCollapse(storageKey: string, defaultCollapsed = false) {
  const [collapsed, setCollapsed] = useState(() => {
    try {
      const stored = window.localStorage.getItem(storageKey)
      return stored == null ? defaultCollapsed : stored === 'true'
    } catch {
      return defaultCollapsed
    }
  })

  const persist = useCallback((next: boolean) => {
    setCollapsed(next)
    try { window.localStorage.setItem(storageKey, String(next)) }
    catch { /* Storage can be unavailable; session state still works. */ }
  }, [storageKey])
  const toggleCollapsed = useCallback(() => persist(!collapsed), [collapsed, persist])

  return [collapsed, toggleCollapsed, persist] as const
}
