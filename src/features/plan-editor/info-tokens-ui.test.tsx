import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { describe, expect, it, vi } from 'vitest'
import { DayColumn } from './components/DayColumn'
import type { ExerciseRow } from './types'

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

function row(): ExerciseRow {
  return {
    id: 'squat',
    serverRowId: null,
    serverSortOrder: null,
    hasLogs: false,
    conflictMessage: null,
    exerciseId: 'squat',
    name: '竞技深蹲',
    ku: true,
    custom: false,
    isMain: true,
    aux: false,
    reps: '3',
    mode: 'kg',
    boxes: [{ val: '150', empty: false }],
    note: '',
  }
}

describe('exercise information token structure', () => {
  it('renders separate nowrap token spans inside one wrapping container', () => {
    const host = document.createElement('div')
    const root = createRoot(host)
    const noop = vi.fn()
    act(() => root.render(
      <DayColumn
        day={{ dow: 0, dowLabel: '周一', dateLabel: '7/27', rest: false, rows: [row()] }}
        colW={{ name: 92, sets: 26, reps: 26, int: 110, note: 36 }}
        selected={false}
        infoTokens={() => ['1RM 175', 'e1RM 175', '上周 5 × 3 @150']}
        onSelect={noop}
        onResizeStart={noop}
        onNameFocus={noop}
        onNameChange={noop}
        onNameBlur={noop}
        onAddRow={noop}
        onEditRow={noop}
        onDeleteRow={noop}
      />,
    ))

    const container = host.querySelector<HTMLElement>('[data-exercise-info-tokens]')!
    const tokens = [...container.querySelectorAll<HTMLElement>('[data-exercise-info-token]')]
    expect(tokens.map((token) => token.textContent)).toEqual([
      '1RM 175',
      'e1RM 175',
      '上周 5 × 3 @150',
    ])
    expect(tokens).toHaveLength(3)
    expect(tokens.every((token) => token.classList.contains('exercise-info-token'))).toBe(true)

    act(() => root.unmount())
  })
})
