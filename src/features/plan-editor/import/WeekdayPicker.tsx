import { S } from '../../../i18n/strings'
import { orderedWeekdays } from '../../workspace/blockPlanSettings'

/** Shared by manual creation and imports that only specify Day1–DayN. */
export function WeekdayPicker({ days, first, disabled = false, onDaysChange, onFirstChange }: {
  days: number[]
  first: number
  disabled?: boolean
  onDaysChange: (days: number[]) => void
  onFirstChange: (day: number) => void
}) {
  const ordered = orderedWeekdays(days, first)
  return <>
      <fieldset disabled={disabled}><legend>{S.block.trainingDays}</legend><div className="block-training-days">
        {S.common.weekdaysMondayFirst.map((label, day) => <button key={day} type="button" data-training-weekday={day}
          aria-pressed={days.includes(day)} className={day === first && days.includes(day) ? 'first' : ''}
          onClick={() => {
            const next = days.includes(day) ? days.filter(value => value !== day) : [...days, day]
            onDaysChange(next)
            if (next.length && !next.includes(first)) onFirstChange(next[0])
          }}>{label}<small>{days.includes(day) ? `D${ordered.indexOf(day) + 1}` : '—'}</small></button>)}
      </div></fieldset>
      <fieldset disabled={disabled}><legend>{S.block.firstDay}</legend><div className="block-first-days">
        {[...days].sort((a,b) => a-b).map(day => <button key={day} type="button" data-d1={day} aria-pressed={day === first} onClick={() => onFirstChange(day)}>{S.common.weekdaysMondayFirst[day]}</button>)}
      </div></fieldset>
  </>
}
