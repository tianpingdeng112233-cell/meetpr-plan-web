import { describe, expect, it } from 'vitest'
import {
  annotationLineWidth,
  beginStroke,
  clearStrokes,
  commitStroke,
  displayPointToFrame,
  moveStroke,
  undoStroke,
} from './annotationDrawing'

describe('annotation drawing model', () => {
  it('maps and clamps displayed coordinates into native frame coordinates', () => {
    expect(displayPointToFrame(
      { x: 60, y: 120 },
      { left: 10, top: 20, width: 100, height: 200 },
      1080,
      1920,
    )).toEqual({ x: 540, y: 960 })
    expect(displayPointToFrame(
      { x: -50, y: 999 },
      { left: 10, top: 20, width: 100, height: 200 },
      1080,
      1920,
    )).toEqual({ x: 0, y: 1920 })
  })

  it('keeps freehand points but only the endpoints of a line', () => {
    const start = { x: 1, y: 2 }
    const freehand = moveStroke(moveStroke(beginStroke('freehand', start), { x: 3, y: 4 }), { x: 5, y: 6 })
    const line = moveStroke(moveStroke(beginStroke('line', start), { x: 3, y: 4 }), { x: 5, y: 6 })
    expect(freehand.points).toEqual([start, { x: 3, y: 4 }, { x: 5, y: 6 }])
    expect(line.points).toEqual([start, { x: 5, y: 6 }])
  })

  it('commits, undoes, and clears the immutable stroke stack', () => {
    const first = beginStroke('freehand', { x: 1, y: 1 })
    const second = beginStroke('line', { x: 2, y: 2 })
    const committed = commitStroke(commitStroke([], first), second)
    expect(committed).toEqual([first, second])
    expect(undoStroke(committed)).toEqual([first])
    expect(clearStrokes()).toEqual([])
    expect(annotationLineWidth(720)).toBe(4)
    expect(annotationLineWidth(1920)).toBe(8)
  })
})
