import { useEffect, useRef, useState } from 'react'

export function useVisiblePolling(
  tick: () => Promise<number | void>,
  intervalMs: number,
  opts: { enabled?: boolean; immediate?: boolean } = {},
): void {
  const tickRef = useRef(tick)
  tickRef.current = tick
  const enabled = opts.enabled ?? true
  const immediate = opts.immediate ?? true

  useEffect(() => {
    if (!enabled) return
    let alive = true
    let timer: number | undefined
    let running = false

    const clearTimer = () => {
      if (timer !== undefined) window.clearTimeout(timer)
      timer = undefined
    }
    const schedule = (delay: number) => {
      clearTimer()
      if (!alive || document.visibilityState !== 'visible') return
      timer = window.setTimeout(() => { void run() }, delay)
    }
    const run = async () => {
      if (!alive || running || document.visibilityState !== 'visible') return
      running = true
      try {
        const nextDelay = await tickRef.current()
        schedule(typeof nextDelay === 'number' ? nextDelay : intervalMs)
      } catch {
        schedule(intervalMs)
      } finally {
        running = false
      }
    }
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') void run()
      else clearTimer()
    }

    document.addEventListener('visibilitychange', onVisibilityChange)
    if (document.visibilityState === 'visible') {
      if (immediate) void run()
      else schedule(intervalMs)
    }
    return () => {
      alive = false
      clearTimer()
      document.removeEventListener('visibilitychange', onVisibilityChange)
    }
  }, [enabled, immediate, intervalMs])
}

export function useClockTick(intervalMs: number, enabled = true): number {
  const [now, setNow] = useState(() => Date.now())
  useVisiblePolling(async () => { setNow(Date.now()) }, intervalMs, { enabled, immediate: false })
  return now
}
