import type { ExerciseIndex } from './exerciseIndex'
import type { DayCol, ExerciseRow, IntensityMode } from './types'

type ExerciseResolver = Pick<ExerciseIndex, 'resolve'>

function clipboardMode(raw: string): IntensityMode {
  const t = raw.trim().toLowerCase()
  if (t.includes('自重') || t.includes('body')) return 'bodyweight'
  if (t.includes('rpe')) return 'rpe'
  return 'kg'
}

export function serializeRowsForClipboard(rows: ExerciseRow[]): string {
  const lines = ['动作\t组\t次\t强度类型\t强度\t备注']
  for (const row of rows) {
    const mode = row.mode === 'bodyweight' ? '自重' : row.mode.toUpperCase()
    const values = row.mode === 'bodyweight'
      ? '每组自重'
      : row.boxes.map((box) => (box.empty ? '' : box.val)).join('/')
    lines.push([row.name, String(row.boxes.length), row.reps, mode, values, row.note].join('\t'))
  }
  return lines.join('\n')
}

export function serializeDayForClipboard(day: DayCol): string {
  return serializeRowsForClipboard(day.rows)
}

export function parseClipboardRows(text: string, exerciseIndex?: ExerciseResolver | null): ExerciseRow[] | null {
  const lines = text.replace(/\r/g, '').split('\n').map((line) => line.trimEnd()).filter((line) => line.trim() !== '')
  if (lines.length === 0) return null
  const first = lines[0].split('\t')[0]?.trim()
  if (first === '动作' || first?.toLowerCase() === 'exercise') lines.shift()

  const rows: ExerciseRow[] = []
  for (const [lineIndex, line] of lines.entries()) {
    const cells = line.split('\t')
    const name = (cells[0] ?? '').trim()
    if (!name) continue
    const mode = clipboardMode(cells[3] ?? '')
    const valueText = cells[4] ?? ''
    const values = mode === 'bodyweight'
      ? []
      : valueText.split(/[\/,，、\s]+/).map((value) => value.trim()).filter(Boolean)
    const setCountRaw = parseInt(cells[1] ?? '', 10)
    const setCount = Math.max(0, Math.min(12, Number.isFinite(setCountRaw) ? setCountRaw : values.length))
    const count = setCount || values.length
    const boxes = mode === 'bodyweight'
      ? Array.from({ length: count || 1 }, () => ({ val: '', empty: true }))
      : Array.from({ length: count }, (_, i) => ({ val: values[i] ?? '', empty: (values[i] ?? '') === '' }))
    const resolved = exerciseIndex?.resolve(name) ?? null
    const custom = resolved?.created_by_coach_id != null
    rows.push({
      id: `paste-${lineIndex}-${Date.now()}-${Math.round(performance.now())}`,
      serverRowId: null,
      serverSortOrder: null,
      hasLogs: false,
      conflictMessage: null,
      exerciseId: resolved?.id ?? null,
      name: resolved?.name ?? name,
      ku: resolved ? !custom : false,
      custom: resolved ? custom : false,
      isMain: resolved ? resolved.is_competition_lift || resolved.main_lift_family != null : false,
      aux: boxes.length === 0,
      reps: (cells[2] ?? '').trim() || '—',
      mode,
      boxes,
      note: (cells[5] ?? '').trim(),
    })
  }
  return rows.length > 0 ? rows : null
}
