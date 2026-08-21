import type { CSSProperties } from 'react'

export interface SkeletonCardProps {
  height: CSSProperties['height']
  className?: string
}

export function SkeletonCard({ height, className = '' }: SkeletonCardProps) {
  return (
    <div
      className={`state-skeleton state-skeleton-card ${className}`.trim()}
      style={{ height }}
      aria-hidden="true"
      data-testid="skeleton-card"
    >
      <i />
      <span />
      <span />
    </div>
  )
}
