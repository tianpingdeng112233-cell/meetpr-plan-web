import { useState } from 'react'
import type { BlockLayout } from './blockGridModel'

export const BLOCK_LAYOUT_KEY = 'meetpr.plan-editor.block-layout'

export function useBlockLayout() {
  const [layout, setLayout] = useState<BlockLayout>(() => {
    try { return window.localStorage.getItem(BLOCK_LAYOUT_KEY) === 'by-day' ? 'by-day' : 'by-week' }
    catch { return 'by-week' }
  })
  return [layout, (next: BlockLayout) => {
    try { window.localStorage.setItem(BLOCK_LAYOUT_KEY, next) } catch { /* Session preference still works. */ }
    setLayout(next)
  }] as const
}
