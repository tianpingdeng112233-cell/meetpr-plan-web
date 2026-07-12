import type { CSSProperties } from 'react'
import { addDays, DOW_LABELS, isoDate } from '../mapping'

export function todayISO(): string {
  return isoDate(new Date())
}

export function weekdayIndex(iso: string): number {
  const day = addDays(iso, 0).getDay()
  return (day + 6) % 7
}

export function nearestWeekdayISO(target: number, from = todayISO()): string {
  const offset = (target - weekdayIndex(from) + 7) % 7
  return isoDate(addDays(from, offset))
}

export function planEndISO(startDate: string, weeks: number): string {
  return isoDate(addDays(startDate, weeks * 7 - 1))
}

export function mmdd(iso: string): string {
  const [, month, day] = iso.split('-')
  return `${month}-${day}`
}

const chip: CSSProperties = {
  minWidth: 42,
  height: 32,
  padding: '0 10px',
  borderRadius: 'var(--r-md)',
  border: '1px solid var(--border-strong)',
  background: 'var(--surface-1)',
  color: 'var(--fg-secondary)',
  fontFamily: 'var(--font-sans)',
  fontSize: 12,
  fontWeight: 600,
  cursor: 'pointer',
}

const dateInput: CSSProperties = {
  height: 38,
  boxSizing: 'border-box',
  borderRadius: 'var(--r-md)',
  border: '1px solid var(--border-strong)',
  background: 'var(--surface-1)',
  color: 'var(--fg-primary)',
  padding: '0 11px',
  font: 'inherit',
  colorScheme: 'dark',
  outline: 'none',
}

export function WeekdayDateSelector({ value, onChange, compact = false, disabled = false, dateLabel }: {
  value: string
  onChange: (value: string) => void
  compact?: boolean
  disabled?: boolean
  dateLabel?: string
}) {
  const selected = weekdayIndex(value)
  return (
    <div style={{ display: 'grid', gap: 'var(--sp-md)' }}>
      <div style={{ display: 'flex', gap: 'var(--sp-sm)', flexWrap: 'wrap' }}>
        {DOW_LABELS.map((day, index) => (
          <button
            key={day}
            type="button"
            disabled={disabled}
            aria-pressed={selected === index}
            onClick={() => onChange(nearestWeekdayISO(index))}
            style={{
              ...chip,
              minWidth: compact ? 34 : chip.minWidth,
              padding: compact ? '0 8px' : chip.padding,
              borderColor: selected === index ? 'var(--brand-red)' : 'var(--border-strong)',
              boxShadow: selected === index ? 'inset 0 0 0 1px var(--brand-red)' : undefined,
              color: selected === index ? 'var(--fg-primary)' : 'var(--fg-secondary)',
              opacity: disabled ? 0.45 : 1,
              cursor: disabled ? 'default' : 'pointer',
            }}
          >
            {compact ? day.slice(1) : day}
          </button>
        ))}
      </div>
      {dateLabel && <span style={calendarFieldLabel}>{dateLabel}</span>}
      <input
        type="date"
        value={value}
        disabled={disabled}
        aria-label="开始日期"
        onChange={(event) => { if (event.target.value) onChange(event.target.value) }}
        style={{ ...dateInput, opacity: disabled ? 0.45 : 1 }}
      />
    </div>
  )
}

export const calendarFieldLabel: CSSProperties = {
  color: 'var(--fg-tertiary)',
  fontSize: 12,
  fontWeight: 600,
}

export const calendarInputStyle = dateInput
