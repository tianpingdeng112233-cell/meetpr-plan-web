export type AnnotationTool = 'freehand' | 'line'

export interface AnnotationPoint {
  x: number
  y: number
}

export interface AnnotationStroke {
  tool: AnnotationTool
  points: AnnotationPoint[]
}

export interface DisplayRect {
  left: number
  top: number
  width: number
  height: number
}

const clamp = (value: number, minimum: number, maximum: number) =>
  Math.max(minimum, Math.min(maximum, value))

export function displayPointToFrame(
  clientPoint: AnnotationPoint,
  display: DisplayRect,
  frameWidth: number,
  frameHeight: number,
): AnnotationPoint | null {
  if (display.width <= 0 || display.height <= 0 || frameWidth <= 0 || frameHeight <= 0) return null
  return {
    x: clamp((clientPoint.x - display.left) / display.width, 0, 1) * frameWidth,
    y: clamp((clientPoint.y - display.top) / display.height, 0, 1) * frameHeight,
  }
}

export const annotationLineWidth = (frameWidth: number) => Math.max(4, frameWidth / 240)

export function beginStroke(tool: AnnotationTool, point: AnnotationPoint): AnnotationStroke {
  return { tool, points: [point] }
}

export function moveStroke(stroke: AnnotationStroke, point: AnnotationPoint): AnnotationStroke {
  return stroke.tool === 'line'
    ? { ...stroke, points: [stroke.points[0] ?? point, point] }
    : { ...stroke, points: [...stroke.points, point] }
}

export function commitStroke(
  strokes: readonly AnnotationStroke[],
  stroke: AnnotationStroke | null,
): AnnotationStroke[] {
  if (!stroke || stroke.points.length === 0) return [...strokes]
  return [...strokes, stroke]
}

export const undoStroke = (strokes: readonly AnnotationStroke[]) => strokes.slice(0, -1)
export const clearStrokes = (): AnnotationStroke[] => []

export function drawAnnotationStrokes(
  context: CanvasRenderingContext2D,
  strokes: readonly AnnotationStroke[],
  lineWidth: number,
) {
  context.save()
  context.strokeStyle = '#F59E0B'
  context.lineWidth = lineWidth
  context.lineCap = 'round'
  context.lineJoin = 'round'
  for (const stroke of strokes) {
    const first = stroke.points[0]
    if (!first) continue
    context.beginPath()
    context.moveTo(first.x, first.y)
    if (stroke.points.length === 1) context.lineTo(first.x + 0.01, first.y + 0.01)
    else for (const point of stroke.points.slice(1)) context.lineTo(point.x, point.y)
    context.stroke()
  }
  context.restore()
}
