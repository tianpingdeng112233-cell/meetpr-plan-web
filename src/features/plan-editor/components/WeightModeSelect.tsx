import { useEffect, useId, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { S } from '../../../i18n/strings'
import { freeWeightEnabled } from '../intensityModel'
import type { DisplayWeightMode } from '../types'

/** Native keyboard/change fallback, with a rich popup for the two-line option. */
export function WeightModeSelect({ value, disabled, title, onChange }: {
  value: DisplayWeightMode
  disabled: boolean
  title?: string
  onChange: (mode: DisplayWeightMode) => void
}) {
  const id = useId()
  const select = useRef<HTMLSelectElement>(null)
  const popup = useRef<HTMLDivElement>(null)
  const [position, setPosition] = useState<{ left: number; top: number } | null>(null)
  const options: { value: DisplayWeightMode; label: string; hint?: string }[] = [
    { value: 'fixed_weight', label: S.editor.fixedWeight },
    { value: 'per_set', label: S.editor.perSetWeight },
    { value: 'weight_range', label: S.editor.weightRange },
    { value: 'bodyweight', label: S.common.bodyweight },
    ...(freeWeightEnabled() ? [{ value: 'free_weight' as const, label: S.editor.freeWeight, hint: S.editor.freeWeightHint }] : []),
  ]
  useEffect(() => {
    if (!position) return
    popup.current?.querySelector<HTMLButtonElement>('[aria-selected="true"]')?.focus()
    const dismiss = (event: Event) => {
      const target = event.target
      if (!(target instanceof Node) || (!popup.current?.contains(target) && !select.current?.contains(target))) setPosition(null)
    }
    document.addEventListener('mousedown', dismiss)
    window.addEventListener('resize', dismiss)
    window.addEventListener('scroll', dismiss, true)
    return () => {
      document.removeEventListener('mousedown', dismiss)
      window.removeEventListener('resize', dismiss)
      window.removeEventListener('scroll', dismiss, true)
    }
  }, [position])
  const open = () => {
    if (disabled) return
    const rect = select.current!.getBoundingClientRect()
    setPosition({ left: Math.max(8, Math.min(rect.left, window.innerWidth - 248)), top: Math.max(8, Math.min(rect.bottom + 4, window.innerHeight - 208)) })
  }
  const close = () => { setPosition(null); select.current?.focus() }
  if (value === 'free_weight' && !freeWeightEnabled()) return <span>{S.editor.freeWeight}</span>
  return <>
    <select ref={select} aria-label={S.editor.weightMode} value={value} disabled={disabled} title={title}
      aria-expanded={position != null} aria-controls={position ? id : undefined}
      onMouseDown={event => { if (event.button === 0) { event.preventDefault(); event.stopPropagation(); open() } }}
      onClick={event => event.stopPropagation()}
      onKeyDown={event => {
        if (['Enter', ' ', 'ArrowDown', 'ArrowUp'].includes(event.key)) { event.preventDefault(); event.stopPropagation(); open() }
      }}
      onChange={event => onChange(event.currentTarget.value as DisplayWeightMode)}>
      {options.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
    </select>
    {position && createPortal(<div ref={popup} id={id} data-popover="" role="listbox" aria-label={S.editor.weightMode}
      style={{ position: 'fixed', ...position, zIndex: 1000, width: 240, padding: 4, background: 'var(--card-bg)', color: 'var(--txt)', border: '1px solid var(--bd)', borderRadius: 'var(--r-sm)', boxShadow: '0 4px 16px #0002' }}
      onClick={event => event.stopPropagation()}
      onKeyDown={event => {
        event.stopPropagation()
        const buttons = [...popup.current!.querySelectorAll<HTMLButtonElement>('[role="option"]')]
        const index = buttons.indexOf(document.activeElement as HTMLButtonElement)
        if (event.key === 'Escape') { event.preventDefault(); close() }
        else if (event.key === 'Tab') setPosition(null)
        else if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
          event.preventDefault()
          const next = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1
            : (index + (event.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length
          buttons[next].focus()
        }
      }}>
      {options.map(option => <button key={option.value} type="button" role="option" aria-selected={value === option.value}
        style={{ display: 'block', width: '100%', padding: '7px 10px', border: 0, borderRadius: 'var(--r-sm)', textAlign: 'left', fontSize: 12, color: 'inherit', background: value === option.value ? 'var(--tint)' : 'transparent' }}
        onClick={() => { onChange(option.value); close() }}>
        {option.label}
        {option.hint && <small style={{ display: 'block', marginTop: 3, fontSize: 10, color: 'var(--mut)' }}>{option.hint}</small>}
      </button>)}
    </div>, document.body)}
  </>
}
