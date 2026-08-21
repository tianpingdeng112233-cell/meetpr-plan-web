import type { ReactNode } from 'react'
import { S } from '../../i18n/strings'

export interface ErrorStateProps {
  retry: () => void
  content?: string
  exclusion?: string
  title?: string
  body?: string
  roomy?: boolean
  secondaryAction?: () => void
  icon?: ReactNode
}

export function ErrorState({
  retry,
  content = S.states.defaultContent,
  exclusion = S.states.defaultExclusion,
  title,
  body,
  roomy = true,
  secondaryAction,
  icon,
}: ErrorStateProps) {
  const resolvedTitle = title ?? S.states.errorTitle(content)
  const resolvedBody = body ?? S.states.errorBody(exclusion)
  return (
    <div className={`state-card state-error${roomy ? ' roomy' : ''}`} role="alert" data-testid="error-state">
      <span className="state-icon state-error-icon" aria-hidden="true">{icon ?? (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
          <path d="M12 8v5" />
          <circle cx="12" cy="16.5" r="0.6" fill="currentColor" />
          <path d="M10.3 3.8 2.6 17a2 2 0 0 0 1.7 3h15.4a2 2 0 0 0 1.7-3L13.7 3.8a2 2 0 0 0-3.4 0Z" />
        </svg>
      )}</span>
      <strong>{resolvedTitle}</strong>
      <p>{resolvedBody}</p>
      <button type="button" className="state-primary-action" onClick={retry}>{S.states.retry}</button>
      {secondaryAction && (
        <span className="state-secondary-copy">
          {S.states.stillFailing}{' '}
          <button type="button" onClick={secondaryAction}>{S.states.signInAgain}</button>
        </span>
      )}
    </div>
  )
}
