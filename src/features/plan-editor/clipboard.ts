import type { ExerciseIndex } from './exerciseIndex'
import type { DayCol, ExerciseRow, IntensityMode, LoadMode, RowIntensity } from './types'
import { inferredWeightMode, isLegacyRpeRow, rowIntensity, rowWeightBoxes } from './intensityModel'

type ExerciseResolver = Pick<ExerciseIndex, 'resolve'>

function clipboardMode(raw: string): IntensityMode {
  const t = raw.trim().toLowerCase()
  if (t.includes('自重') || t.includes('body')) return 'bodyweight'
  if (t.includes('rpe')) return 'rpe'
  return 'kg'
}

export function serializeRowsForClipboard(rows: ExerciseRow[]): string {
  const lines = ['动作\t组\t次\t强度类型\t强度值\t重量模式\t重量\t备注']
  for (const row of rows) {
    if (isLegacyRpeRow(row)) {
      const perSetRpe = row.boxes.map((box) => (box.empty ? '' : box.val)).join('/')
      lines.push([row.name, String(row.boxes.length), row.reps, '旧逐组RPE', perSetRpe, '逐组', '', row.note].join('\t'))
      continue
    }
    const intensity = rowIntensity(row)
    const mode = row.mode === 'bodyweight' ? '自重' : intensity?.mode ?? '无'
    const intensityValue = intensity == null || intensity.mode === 'fixed_weight'
      ? ''
      : intensity.mode === 'weight_range' || intensity.mode === 'rpe_range'
        ? `${intensity.value}-${intensity.high}`
        : intensity.value
    const weightMode = row.mode === 'bodyweight' ? '自重' : inferredWeightMode(row) === 'per_set' ? '逐组' : '统一'
    const weights = row.mode === 'bodyweight'
      ? '每组自重'
      : rowWeightBoxes(row).map((box) => (box.empty ? '' : box.val)).join('/')
    lines.push([row.name, String(row.boxes.length), row.reps, mode, intensityValue, weightMode, weights, row.note].join('\t'))
  }
  return lines.join('\n')
}

export function serializeDayForClipboard(day: DayCol): string {
  return serializeRowsForClipboard(day.rows)
}

export function parseClipboardRows(text: string, exerciseIndex?: ExerciseResolver | null): ExerciseRow[] | null {
  const lines = text.replace(/\r/g, '').split('\n').map((line) => line.trimEnd()).filter((line) => line.trim() !== '')
  if (lines.length === 0) return null
  const headerCells = lines[0].split('\t')
  const first = headerCells[0]?.trim()
  const modernFormat = headerCells.includes('重量模式') && headerCells.includes('重量')
  if (first === '动作' || first?.toLowerCase() === 'exercise') lines.shift()

  const rows: ExerciseRow[] = []
  for (const [lineIndex, line] of lines.entries()) {
    const cells = line.split('\t')
    const name = (cells[0] ?? '').trim()
    if (!name) continue
    const modern = modernFormat
    const legacyPerSetRpe = modern && (cells[3] ?? '').replace(/\s/g, '').toLowerCase() === '旧逐组rpe'
    const legacyMode = clipboardMode(cells[3] ?? '')
    const mode: IntensityMode = legacyPerSetRpe ? 'rpe' : modern && legacyMode !== 'bodyweight' ? 'kg' : legacyMode
    const valueText = legacyPerSetRpe ? cells[4] ?? '' : modern ? cells[6] ?? '' : cells[4] ?? ''
    const values = mode === 'bodyweight'
      ? []
      : modern
        ? valueText.split('/').map((value) => value.trim())
        : valueText.split(/[\/,，、\s]+/).map((value) => value.trim()).filter(Boolean)
    const setCountRaw = parseInt(cells[1] ?? '', 10)
    const setCount = Math.max(0, Math.min(12, Number.isFinite(setCountRaw) ? setCountRaw : values.length))
    const count = setCount || (values.length === 1 && values[0] === '' ? 0 : values.length)
    const boxes = mode === 'bodyweight'
      ? Array.from({ length: count || 1 }, () => ({ val: '', empty: true }))
      : Array.from({ length: count }, (_, i) => ({ val: values[i] ?? '', empty: (values[i] ?? '') === '' }))
    const resolved = exerciseIndex?.resolve(name) ?? null
    const custom = resolved?.created_by_coach_id != null
    const loadMode = modern && ['pct', 'rpe', 'rir', 'weight_range', 'rpe_range', 'fixed_weight'].includes(cells[3] ?? '')
      ? cells[3] as LoadMode
      : null
    const intensityParts = (cells[4] ?? '').split(/[-–—~]/).map((value) => value.trim())
    const intensity: RowIntensity | null = loadMode == null
      ? null
      : { mode: loadMode, value: loadMode === 'fixed_weight' ? '' : intensityParts[0] ?? '', high: intensityParts[1] ?? '' }
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
      ...(modern && !legacyPerSetRpe ? { intensity, weightMode: cells[5] === '逐组' ? 'per_set' as const : 'uniform' as const } : {}),
      boxes,
      note: (cells[modern ? 7 : 5] ?? '').trim(),
    })
  }
  return rows.length > 0 ? rows : null
}
