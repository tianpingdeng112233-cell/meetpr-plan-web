import { S } from '../../i18n/strings'
import { addServiceMonths } from './serviceTerm'

export function ServiceTermDateInput({ value, base, onChange, optional = false, disabled = false }: {
  value: string
  base: string
  onChange: (value: string) => void
  optional?: boolean
  disabled?: boolean
}) {
  const copy = S.workspace.serviceTerm
  return <>
    <label className="service-term-date">{optional ? copy.optional : copy.label}
      <input type="date" value={value} required={!optional} disabled={disabled} onChange={event => onChange(event.target.value)} />
    </label>
    <div className="service-term-shortcuts">
      <button type="button" disabled={disabled} onClick={() => onChange(addServiceMonths(base, 1))}>{copy.addMonth}</button>
      <button type="button" disabled={disabled} onClick={() => onChange(addServiceMonths(base, 3))}>{copy.addThreeMonths}</button>
    </div>
  </>
}
