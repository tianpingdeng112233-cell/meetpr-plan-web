import { S } from '../../i18n/strings'

export interface InlineFailProps {
  retry: () => void
  label?: string
  className?: string
}

export function InlineFail({ retry, label = S.states.inlineFail, className = '' }: InlineFailProps) {
  return (
    <button
      type="button"
      className={`state-inline-fail ${className}`.trim()}
      onClick={(event) => {
        event.stopPropagation()
        retry()
      }}
      aria-label={`${label} · ${S.states.retry}`}
    >
      <span aria-hidden="true">↻</span>{label}
    </button>
  )
}
