import { useLayoutEffect, useRef, type RefObject } from 'react'
import type { FeedbackEntry } from './feedbackModel'

export interface PlanPlayback { entry: FeedbackEntry; request: number }

/** Scroll the plan beside the existing floating player, without owning editing selection. */
export function useVideoPlanScroll(gridRef: RefObject<HTMLDivElement>, playback: PlanPlayback | null | undefined,
  columns: number, byDayWidth?: number) {
  const leading = useRef(0)
  const following = useRef(true)
  const byDay = byDayWidth != null
  useLayoutEffect(() => { following.current = true }, [playback?.request, playback?.entry.video.id, playback?.entry.dayId, playback?.entry.rowId, byDay])
  useLayoutEffect(() => {
    const grid = gridRef.current
    const scroller = grid?.closest<HTMLElement>('.scroller')
    if (!grid || !scroller) return
    const clear = () => {
      const left = scroller.scrollLeft - leading.current
      grid.removeAttribute('data-video-plan-scroll')
      for (const name of ['leading', 'trailing', 'width', 'column-width']) grid.style.removeProperty(`--video-plan-${name}`)
      leading.current = 0
      scroller.scrollLeft = Math.max(0, left)
    }
    if (!playback) { clear(); return }
    const entry = playback.entry
    const target = entry.inPlan ? [...grid.querySelectorAll<HTMLElement>('.block-cell')].find(cell =>
      (entry.dayId && cell.dataset.blockDayId === entry.dayId)
      || (entry.rowId && [...cell.querySelectorAll<HTMLElement>('[data-rowid]')].some(row => row.dataset.rowid === entry.rowId))) : undefined
    let frame = 0, geometry = ''
    const measure = () => {
      frame = 0
      // The player is a sibling: measure after its own layout effect has positioned it.
      const player = grid.closest('.plan-with-rail')?.querySelector<HTMLElement>('.history-player')
      if (!player) return
      const viewport = scroller.getBoundingClientRect(), video = player.getBoundingClientRect()
      if (!video.width || !viewport.width || !columns) return
      const right = video.left - 12
      const overhead = byDay ? 84 : 80
      const naturalWidth = byDayWidth ?? Math.max(950, scroller.clientWidth, overhead + columns * 215)
      // A one-day plan otherwise stretches a single card under the whole player.
      const maxColumn = Math.max(byDay ? 160 : 205, right - viewport.left - 78)
      const width = Math.min(naturalWidth, overhead + columns * (maxColumn + 10))
      const trailing = Math.max(0, viewport.right - right - 16)
      grid.style.setProperty('--video-plan-width', `${width}px`)
      grid.style.setProperty('--video-plan-column-width', `${(width - overhead) / columns - 10}px`)
      grid.style.setProperty('--video-plan-leading', `${leading.current}px`)
      grid.style.setProperty('--video-plan-trailing', `${trailing}px`)
      grid.setAttribute('data-video-plan-scroll', '')
      const first = grid.querySelector<HTMLElement>('.block-cell')?.getBoundingClientRect()
      if (!first?.width) return
      const signature = [viewport.left, viewport.width, video.left, video.width, width, first.width].join(':')
      if (signature === geometry) return
      geometry = signature
      const nextLeading = Math.max(0, right - (first.right + scroller.scrollLeft - leading.current))
      grid.style.setProperty('--video-plan-leading', `${nextLeading}px`)
      scroller.scrollLeft += nextLeading - leading.current
      leading.current = nextLeading
      if (target && following.current) {
        const bounds = target.getBoundingClientRect()
        scroller.scrollLeft += bounds.right - right
        if (bounds.top < viewport.top + 48 || bounds.bottom > viewport.bottom - 12) {
          scroller.scrollTop += bounds.top - viewport.top - 48
        }
      }
    }
    const schedule = () => { if (!frame) frame = requestAnimationFrame(measure) }
    const browse = () => { following.current = false }
    scroller.addEventListener('wheel', browse, { passive: true })
    scroller.addEventListener('mousedown', browse)
    scroller.addEventListener('touchstart', browse, { passive: true })
    scroller.addEventListener('keydown', browse)
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(schedule)
    observer?.observe(scroller)
    const player = grid.closest('.plan-with-rail')?.querySelector<HTMLElement>('.history-player')
    if (player) observer?.observe(player)
    if (target) observer?.observe(target)
    window.addEventListener('resize', schedule)
    schedule()
    return () => {
      cancelAnimationFrame(frame); observer?.disconnect()
      window.removeEventListener('resize', schedule)
      scroller.removeEventListener('wheel', browse); scroller.removeEventListener('mousedown', browse)
      scroller.removeEventListener('touchstart', browse); scroller.removeEventListener('keydown', browse)
    }
  }, [gridRef, playback?.request, playback?.entry.video.id, playback?.entry.dayId, playback?.entry.rowId, columns, byDayWidth])
}
