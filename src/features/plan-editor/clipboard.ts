import type { ExerciseIndex } from './exerciseIndex'
import type { DayCol, ExerciseRow, IntensityMode, LoadMode, RowIntensity } from './types'
import {
  inferredIntensityMode,
  inferredWeightMode,
  isSingleValueIntensity,
  rowIntensity,
  rowIntensityBoxes,
  rowWeightBoxes,
} from './intensityModel'

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
    const intensity = rowIntensity(row)
    const mode = row.mode === 'bodyweight' ? '自重' : intensity?.mode ?? '无'
    const intensityValue = intensity == null || intensity.mode === 'fixed_weight'
      ? ''
      : isSingleValueIntensity(intensity)
        ? (inferredIntensityMode(row) === 'uniform'
          ? rowIntensityBoxes(row)[0]?.val ?? ''
          : rowIntensityBoxes(row).map((box) => box.empty ? '' : box.val).join('/'))
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
    const mode: IntensityMode = modern && legacyMode !== 'bodyweight' ? 'kg' : legacyMode
    const weightText = modern ? cells[6] ?? '' : legacyMode === 'kg' ? cells[4] ?? '' : ''
    const weightValues = mode === 'bodyweight'
      ? []
      : modern
        ? weightText.split('/').map((value) => value.trim())
        : weightText.split(/[\/,，、\s]+/).map((value) => value.trim()).filter(Boolean)
    const intensityText = modern ? cells[4] ?? '' : legacyMode === 'rpe' ? cells[4] ?? '' : ''
    const intensityValues = intensityText.split('/').map((value) => value.trim())
    const setCountRaw = parseInt(cells[1] ?? '', 10)
    const inferredCount = Math.max(weightValues.length, intensityValues.length)
    const setCount = Math.max(0, Math.min(12, Number.isFinite(setCountRaw) ? setCountRaw : inferredCount))
    const count = setCount || (inferredCount === 1 && weightValues[0] === '' && intensityValues[0] === '' ? 0 : inferredCount)
    const boxes = mode === 'bodyweight'
      ? Array.from({ length: count || 1 }, () => ({ val: '', empty: true }))
      : Array.from({ length: count }, (_, i) => ({ val: weightValues[i] ?? '', empty: (weightValues[i] ?? '') === '' }))
    const resolved = exerciseIndex?.resolve(name) ?? null
    const custom = resolved?.created_by_coach_id != null
    const rawLoadMode = legacyPerSetRpe ? 'rpe' : modern ? cells[3] ?? '' : legacyMode === 'rpe' ? 'rpe' : ''
    const loadMode = ['pct', 'rpe', 'rir', 'weight_range', 'rpe_range', 'fixed_weight'].includes(rawLoadMode)
      ? rawLoadMode as LoadMode
      : null
    const intensityParts = intensityText.split(/[-–—~]/).map((value) => value.trim())
    const intensity: RowIntensity | null = loadMode == null
      ? null
      : {
        mode: loadMode,
        value: loadMode === 'fixed_weight' ? ''
          : loadMode === 'pct' || loadMode === 'rpe' || loadMode === 'rir'
            ? intensityValues[0] ?? ''
            : intensityParts[0] ?? '',
        high: intensityParts[1] ?? '',
      }
    const singleValue = loadMode === 'pct' || loadMode === 'rpe' || loadMode === 'rir'
    const intensityMode = singleValue && (legacyPerSetRpe || intensityText.includes('/')) ? 'per_set' as const : 'uniform' as const
    const intensityBoxes = singleValue
      ? Array.from({ length: count }, (_, index) => {
        const value = intensityMode === 'uniform' ? intensityValues[0] ?? '' : intensityValues[index] ?? ''
        return { val: value, empty: value === '' }
      })
      : undefined
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
      target: null,
      aux: boxes.length === 0,
      reps: (cells[2] ?? '').trim() || '—',
      mode,
      ...(mode !== 'bodyweight' ? {
        intensity,
        ...(singleValue ? { intensityMode, intensityBoxes } : {}),
        weightMode: modern && !legacyPerSetRpe && cells[5] === '逐组' ? 'per_set' as const : 'uniform' as const,
      } : {}),
      boxes,
      note: (cells[modern ? 7 : 5] ?? '').trim(),
    })
  }
  return rows.length > 0 ? rows : null
}
