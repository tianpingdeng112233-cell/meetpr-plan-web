import { useEffect, useRef, useState } from 'react'

export interface DelayedLoadingOptions {
  delayMs?: number
  minimumVisibleMs?: number
  enabled?: boolean
}

/**
 * Delays first-load feedback and, once shown, holds it long enough to avoid a
 * flash. Pass `enabled: false` for polling and other background refreshes.
 */
export function useDelayedLoading(
  loading: boolean,
  { delayMs = 150, minimumVisibleMs = 300, enabled = true }: DelayedLoadingOptions = {},
): boolean {
  const [visible, setVisible] = useState(false)
  const visibleSince = useRef<number | null>(null)

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined

    if (!enabled) {
      visibleSince.current = null
      setVisible(false)
      return
    }

    if (loading) {
      if (!visible) {
        timer = setTimeout(() => {
          visibleSince.current = Date.now()
          setVisible(true)
        }, delayMs)
      }
    } else if (visible) {
      const elapsed = visibleSince.current == null ? minimumVisibleMs : Date.now() - visibleSince.current
      timer = setTimeout(() => {
        visibleSince.current = null
        setVisible(false)
      }, Math.max(0, minimumVisibleMs - elapsed))
    } else {
      visibleSince.current = null
    }

    return () => {
      if (timer) clearTimeout(timer)
    }
  }, [delayMs, enabled, loading, minimumVisibleMs, visible])

  return visible
}
