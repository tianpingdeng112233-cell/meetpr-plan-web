import { JTS_PHASE_LABELS, type JtsPhaseSelection } from '../jtsVolumeBands'

export function JtsPhaseSelector({ value, onChange }: {
  value: JtsPhaseSelection
  onChange: (phase: JtsPhaseSelection) => void
}) {
  return (
    <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: 'var(--fg-tertiary)', whiteSpace: 'nowrap' }}>
      <span>相位</span>
      <select
        aria-label="JTS 容量提示相位"
        value={value}
        onChange={(event) => onChange(event.target.value as JtsPhaseSelection)}
        title="仅控制 JTS MEV-MRV 周容量软提示，不参与保存或发布校验"
        style={{
          height: 26, padding: '0 22px 0 8px', border: '1px solid var(--border)', borderRadius: 'var(--r-md)',
          color: value === 'off' ? 'var(--fg-tertiary)' : 'var(--fg-secondary)', background: 'var(--surface-1)',
          font: '600 11px var(--font-sans)', cursor: 'pointer', outline: 'none',
        }}
      >
        {(Object.keys(JTS_PHASE_LABELS) as JtsPhaseSelection[]).map((phase) => (
          <option key={phase} value={phase}>{JTS_PHASE_LABELS[phase]}</option>
        ))}
      </select>
    </label>
  )
}
