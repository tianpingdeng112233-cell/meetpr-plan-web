import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DayColumn } from './components/DayColumn'
import type { ExerciseRow } from './types'

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

function row(id: string, partial: Partial<ExerciseRow> = {}): ExerciseRow {
  return {
    id, serverRowId: null, serverSortOrder: null, hasLogs: false, conflictMessage: null,
    exerciseId: 'ex', name: '深蹲', ku: true, custom: false, isMain: false,
    aux: false, reps: '5', mode: 'kg', boxes: [{ val: '100', empty: false }], note: '',
    ...partial,
  }
}

const COLW = { name: 92, sets: 26, reps: 26, int: 110, note: 36 }
const noop = {
  onSelect: vi.fn(), onResizeStart: vi.fn(), onNameFocus: vi.fn(), onNameChange: vi.fn(),
  onNameBlur: vi.fn(), onAddRow: vi.fn(), onEditRow: vi.fn(), onDeleteRow: vi.fn(),
}

/** Tier resolver used across cases: isMain flag stands in for the catalog lookup. */
const tierByIsMain = (r: ExerciseRow) => (r.isMain ? 'main' as const : 'aux' as const)

function headerLabels(host: HTMLElement): string[] {
  return [...host.querySelectorAll<HTMLElement>('.tierhead')].map((el) => el.children[1]?.textContent ?? '')
}

describe('day tier sections', () => {
  let host: HTMLDivElement
  let root: Root | null

  beforeEach(() => {
    host = document.createElement('div')
    document.body.appendChild(host)
    root = createRoot(host)
  })

  afterEach(() => {
    if (root) act(() => root?.unmount())
    host.remove()
    root = null
    vi.restoreAllMocks()
    // jsdom has no native elementsFromPoint; drop the injected one to avoid cross-test leakage.
    Reflect.deleteProperty(document, 'elementsFromPoint')
  })

  it('groups rows under 主项及变式 and 辅助项 preserving in-group order', () => {
    act(() => root?.render(
      <DayColumn
        day={{
          dow: 0, dowLabel: '周一', dateLabel: '1/1', rest: false,
          rows: [row('sq', { isMain: true }), row('row1'), row('bp', { isMain: true }), row('row2')],
        }}
        colW={COLW} selected={false} rowTier={tierByIsMain} {...noop}
      />,
    ))

    expect(headerLabels(host)).toEqual(['主项及变式', '辅助项'])
    const orderedIds = [...host.querySelectorAll<HTMLElement>('[data-rowid]')].map((el) => el.dataset.rowid)
    expect(orderedIds).toEqual(['sq', 'bp', 'row1', 'row2'])
  })

  it('renders only the non-empty section when unselected, both when selected', () => {
    const auxOnly = {
      dow: 2, dowLabel: '周三', dateLabel: '1/3', rest: false,
      rows: [row('a1', { aux: true }), row('a2', { aux: true })],
    }
    act(() => root?.render(<DayColumn day={auxOnly} colW={COLW} selected={false} rowTier={tierByIsMain} {...noop} />))
    expect(headerLabels(host)).toEqual(['辅助项'])

    act(() => root?.render(<DayColumn day={auxOnly} colW={COLW} selected rowTier={tierByIsMain} {...noop} />))
    expect(headerLabels(host)).toEqual(['主项及变式', '辅助项'])
  })

  it('shows section sets and tonnage, omitting zero tonnage from the auxiliary section', () => {
    act(() => root?.render(
      <DayColumn
        day={{
          dow: 0, dowLabel: '周一', dateLabel: '1/1', rest: false,
          rows: [
            row('sq', { isMain: true, boxes: [{ val: '100', empty: false }, { val: '100', empty: false }] }),
            row('row1', { mode: 'rpe', boxes: [{ val: '8', empty: false }] }),
          ],
        }}
        colW={COLW} selected={false} rowTier={tierByIsMain} {...noop}
      />,
    ))

    const summaries = [...host.querySelectorAll<HTMLElement>('.tierhead-summary')]
    expect(summaries.map((el) => el.textContent)).toEqual(['2 组 · 总重 1,000 kg', '1 组'])
    expect(summaries[0].querySelector('.tierhead-tonnage')).not.toBeNull()
    expect(summaries[1].querySelector('.tierhead-tonnage')).toBeNull()
  })

  it('renders the legacy flat list when no rowTier resolver is provided', () => {
    act(() => root?.render(
      <DayColumn
        day={{ dow: 0, dowLabel: '周一', dateLabel: '1/1', rest: false, rows: [row('sq', { isMain: true }), row('row1')] }}
        colW={COLW} selected={false} {...noop}
      />,
    ))
    expect(headerLabels(host)).toEqual([])
    const orderedIds = [...host.querySelectorAll<HTMLElement>('[data-rowid]')].map((el) => el.dataset.rowid)
    expect(orderedIds).toEqual(['sq', 'row1'])
  })

  it('rejects cross-section drops but allows in-section reorder', () => {
    const reorder = vi.fn()
    act(() => root?.render(
      <DayColumn
        day={{
          dow: 0, dowLabel: '周一', dateLabel: '1/1', rest: false,
          rows: [row('sq', { isMain: true }), row('bp', { isMain: true }), row('row1')],
        }}
        colW={COLW} selected rowTier={tierByIsMain} onSelectRow={vi.fn()} onReorderRow={reorder} {...noop}
      />,
    ))

    const dragTo = (fromId: string, toId: string) => {
      const handle = host.querySelector<HTMLElement>(`[data-rowid="${fromId}"] .rowdrag`)!
      const target = host.querySelector<HTMLElement>(`[data-rowid="${toId}"]`)!
      const rect = { top: 0, height: 10 }
      vi.spyOn(target, 'getBoundingClientRect').mockReturnValue(rect as DOMRect)
      // jsdom has no elementsFromPoint; inject one that reports the drop target.
      ;(document as Document & { elementsFromPoint: (x: number, y: number) => Element[] })
        .elementsFromPoint = () => [target]
      act(() => { handle.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 })) })
      act(() => { window.dispatchEvent(new MouseEvent('mouseup', { clientX: 0, clientY: 9 })) })
    }

    dragTo('sq', 'row1')            // main → aux section: must not reorder
    expect(reorder).not.toHaveBeenCalled()

    dragTo('sq', 'bp')              // within main section: allowed
    expect(reorder).toHaveBeenCalledWith('sq', 'bp', 'after')
  })
})
