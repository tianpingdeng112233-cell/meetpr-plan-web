import { S } from '../../../i18n/strings'
import { STABLE_ZH } from '../../../i18n/stable-zh'
import { KG_MAX_EXCLUSIVE, PCT_MAX, PCT_MIN, REPS_MAX, REPS_MIN, RIR_MAX, RIR_MIN, RPE_MAX, RPE_MIN } from '../inputGuard'
import { validTextFix, type TextFix, type TextFixes, type TextGroup } from './groupedFixes'

export function GroupedTextFixes({ groups, fixes, onFix }: {
  groups: TextGroup[]; fixes: TextFixes; onFix: (key: string, fix: TextFix) => void
}) {
  if (!groups.length) return null
  return <section className="import-text-groups" aria-label={S.sheetImport.groupedTexts}>
    <b>{S.sheetImport.groupedTexts}</b>
    {groups.map(group => {
      const fix = fixes[group.key]
      const label = S.sheetImport.textGroup(S.sheetImport.groupFields[group.field], group.text, group.count)
      const failure = fix?.field === 'reps' && fix.value === STABLE_ZH.failureReps
      const kind = fix?.field === 'intensity' ? fix.kind : 'rpe'
      const value = fix?.value ?? ''
      return <div key={group.key} role="group" aria-label={label} data-unparsed-field={group.field}>
        <div className="import-group-label"><span>{label}</span>{validTextFix(fix) && <small>{S.sheetImport.fixed}</small>}</div>
        <div className="import-group-controls">
          {group.field === 'intensity' && <select aria-label={S.sheetImport.groupFields.intensity} value={kind ?? ''}
            onChange={e => onFix(group.key, { field: 'intensity', kind: e.target.value as 'rpe' | 'rir' | 'pct', value })}>
            <option value="" disabled>{S.sheetImport.noIntensity}</option>
            <option value="rpe">RPE</option><option value="rir">RIR</option><option value="pct">{S.sheetImport.unreadableTracks.pct}</option>
          </select>}
          <label>{S.sheetImport.groupFields[group.field]}{group.field === 'weight' ? ' (kg)' : ''}
            <input type="number" value={failure ? '' : value} disabled={failure}
              min={group.field === 'reps' ? REPS_MIN : group.field === 'weight' ? 0.01 : kind === 'pct' ? PCT_MIN : kind === 'rir' ? RIR_MIN : RPE_MIN}
              max={group.field === 'reps' ? REPS_MAX : group.field === 'weight' ? KG_MAX_EXCLUSIVE - 0.01 : kind === 'pct' ? PCT_MAX : kind === 'rir' ? RIR_MAX : RPE_MAX}
              step={group.field === 'reps' || kind === 'rir' && group.field === 'intensity' ? 1 : group.field === 'weight' ? 0.01 : 0.5}
              onChange={e => onFix(group.key, group.field === 'intensity'
                ? { field: 'intensity', kind: kind ?? 'rpe', value: e.target.value }
                : { field: group.field, value: e.target.value })} />
          </label>
          {group.field === 'reps' ? <button type="button" aria-pressed={failure} onClick={() => onFix(group.key, { field: 'reps', value: failure ? '' : STABLE_ZH.failureReps })}>{S.editor.failureReps}</button>
            : group.field === 'intensity' ? <button type="button" aria-pressed={fix?.field === 'intensity' && fix.kind === null} onClick={() => onFix(group.key, { field: 'intensity', kind: null, value: '' })}>{S.sheetImport.noIntensity}</button>
              : <button type="button" aria-pressed={fix?.field === 'weight' && fix.value === null} onClick={() => onFix(group.key, { field: 'weight', value: null })}>{S.sheetImport.noWeight}</button>}
        </div>
      </div>
    })}
  </section>
}
