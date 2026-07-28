import { useCallback, useState } from 'react'

export function usePersistentCollapse(storageKey: string) {
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return window.localStorage.getItem(storageKey) === 'true'
    } catch {
      return false
    }
  })

  const toggleCollapsed = useCallback(() => {
    setCollapsed((current) => {
      const next = !current
      try {
        window.localStorage.setItem(storageKey, String(next))
      } catch {
        // Storage can be unavailable in private or locked-down browser contexts.
      }
      return next
    })
  }, [storageKey])

  return [collapsed, toggleCollapsed] as const
}
