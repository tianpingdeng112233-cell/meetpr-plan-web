import type { ExerciseIndex } from './exerciseIndex'
import type { DayCol, ExerciseRow, IntensityMode, LoadMode, RowIntensity } from './types'
import {
  displayedRowIntensity,
  displayedWeightMode,
  inferredIntensityMode,
  isSingleValueIntensity,
  rowIntensity,
  rowIntensityBoxes,
  rowPctAnchor,
  rowWeightBoxes,
} from './intensityModel'
import { STABLE_ZH } from '../../i18n/stable-zh'

type ExerciseResolver = Pick<ExerciseIndex, 'resolve'>

function clipboardMode(raw: string): IntensityMode {
  const t = raw.trim().toLowerCase()
  if (t.includes(STABLE_ZH.clipboard.bodyweight) || t.includes('body')) return 'bodyweight'
  if (t.includes('rpe')) return 'rpe'
  return 'kg'
}

export function serializeRowsForClipboard(rows: ExerciseRow[]): string {
  const lines: string[] = [STABLE_ZH.clipboard.header]
  for (const row of rows) {
    const intensity = displayedRowIntensity(row)
    const mode = row.mode === 'bodyweight' ? STABLE_ZH.clipboard.bodyweight : intensity?.mode ?? STABLE_ZH.clipboard.none
    const intensityValue = intensity == null
      ? ''
      : isSingleValueIntensity(intensity)
        ? (inferredIntensityMode(row) === 'uniform'
          ? rowIntensityBoxes(row)[0]?.val ?? ''
          : rowIntensityBoxes(row).map((box) => box.empty ? '' : box.val).join('/'))
        : intensity.mode === 'rpe_range'
        ? `${intensity.value}-${intensity.high}`
        : intensity.value
    const displayWeightMode = displayedWeightMode(row)
    const weightMode = displayWeightMode === 'bodyweight' ? STABLE_ZH.clipboard.bodyweight
      : displayWeightMode === 'per_set' ? STABLE_ZH.clipboard.perSetWeight
        : displayWeightMode === 'weight_range' ? STABLE_ZH.clipboard.weightRange
          : STABLE_ZH.clipboard.fixedWeight
    const wireIntensity = rowIntensity(row)
    const weights = displayWeightMode === 'bodyweight' ? STABLE_ZH.clipboard.everySetBodyweight
      : displayWeightMode === 'weight_range' && wireIntensity?.mode === 'weight_range'
        ? `${wireIntensity.value}-${wireIntensity.high}`
        : rowWeightBoxes(row).map((box) => (box.empty ? '' : box.val)).join('/')
    const pctAnchor = intensity?.mode === 'pct'
      ? rowPctAnchor(row) === 'top_set' ? STABLE_ZH.clipboard.topSet : rowPctAnchor(row) === 'e1rm' ? 'e1RM' : '1RM'
      : ''
    lines.push([row.name, String(row.boxes.length), row.reps, mode, intensityValue, weightMode, weights, row.note, pctAnchor].join('\t'))
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
  const modernFormat = headerCells.includes(STABLE_ZH.clipboard.weightMode) && headerCells.includes(STABLE_ZH.clipboard.weight)
  const pctAnchorIndex = headerCells.indexOf(STABLE_ZH.clipboard.pctAnchor)
  if (first === STABLE_ZH.clipboard.exercise || first?.toLowerCase() === 'exercise') lines.shift()

  const rows: ExerciseRow[] = []
  for (const [lineIndex, line] of lines.entries()) {
    const cells = line.split('\t')
    const name = (cells[0] ?? '').trim()
    if (!name) continue
    const modern = modernFormat
    const legacyPerSetRpe = modern && (cells[3] ?? '').replace(/\s/g, '').toLowerCase() === STABLE_ZH.clipboard.legacyPerSetRpe
    const legacyMode = clipboardMode(cells[3] ?? '')
    const mode: IntensityMode = modern && legacyMode !== 'bodyweight' ? 'kg' : legacyMode
    const weightModeText = modern ? (cells[5] ?? '').trim() : ''
    const weightRangeMode = weightModeText === STABLE_ZH.clipboard.weightRange || weightModeText === 'weight_range'
    const weightText = modern ? cells[6] ?? '' : legacyMode === 'kg' ? cells[4] ?? '' : ''
    const weightValues = mode === 'bodyweight' || weightRangeMode
      ? []
      : modern
        ? weightText.split('/').map((value) => value.trim())
        : weightText.split(/[\/,，、\s]+/).map((value) => value.trim()).filter(Boolean)
    const intensityText = weightRangeMode ? weightText
      : modern ? cells[4] ?? ''
        : legacyMode === 'rpe' ? cells[4] ?? '' : ''
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
    const loadMode = weightRangeMode ? 'weight_range'
      : ['pct', 'rpe', 'rir', 'weight_range', 'rpe_range', 'fixed_weight'].includes(rawLoadMode)
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
    const pctAnchorText = pctAnchorIndex >= 0 ? (cells[pctAnchorIndex] ?? '').trim().toLowerCase() : ''
    const pctAnchor = loadMode === 'pct'
      ? pctAnchorText === 'e1rm' ? 'e1rm' as const
        : pctAnchorText === STABLE_ZH.clipboard.topSet || pctAnchorText === 'top_set' ? 'top_set' as const
          : 'one_rm' as const
      : undefined
    rows.push({
      id: `paste-${lineIndex}-${Date.now()}-${Math.round(performance.now())}`,
      serverRowId: null,
      serverSortOrder: null,
      hasLogs: false,
      conflictMessage: null,
      exerciseId: resolved?.id ?? null,
      name: resolved?.name ?? name,
      ...(resolved?.name_en ? { nameEn: resolved.name_en } : {}),
      ku: resolved ? !custom : false,
      custom: resolved ? custom : false,
      isMain: resolved ? resolved.is_competition_lift || resolved.main_lift_family != null : false,
      aux: boxes.length === 0,
      reps: (cells[2] ?? '').trim() || '—',
      mode,
      ...(mode !== 'bodyweight' ? {
        intensity,
        ...(pctAnchor ? { pctAnchor } : {}),
        ...(singleValue ? { intensityMode, intensityBoxes } : {}),
        weightMode: modern && !legacyPerSetRpe && (weightModeText === STABLE_ZH.clipboard.perSet || weightModeText === STABLE_ZH.clipboard.perSetWeight)
          ? 'per_set' as const
          : 'uniform' as const,
      } : {}),
      boxes,
      note: (cells[modern ? 7 : 5] ?? '').trim(),
    })
  }
  return rows.length > 0 ? rows : null
}
