import type { ReactNode } from 'react'
import { S } from '../../i18n/strings'

export interface EmptyStateProps {
  title?: string
  text?: string
  body?: string
  actionLabel?: string
  onAction?: () => void
  clear?: () => void
  icon?: ReactNode
}

export function EmptyState({ title, text, body, actionLabel, onAction, clear, icon }: EmptyStateProps) {
  const action = onAction ?? clear
  const label = actionLabel ?? (clear ? S.states.clearFilters : undefined)
  return (
    <div className="state-card state-empty" data-testid="empty-state">
      <span className="state-icon state-empty-icon" aria-hidden="true">{icon ?? (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="8" r="3.2" />
          <path d="M5.5 20a6.5 6.5 0 0 1 13 0" />
        </svg>
      )}</span>
      <strong>{title ?? text}</strong>
      {body && <p>{body}</p>}
      {action && label && <button type="button" className="state-link-action" onClick={action}>{label}</button>}
    </div>
  )
}
