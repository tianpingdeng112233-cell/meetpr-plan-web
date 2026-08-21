export interface SkeletonRowsProps {
  count?: number
  className?: string
}

export function SkeletonRows({ count = 4, className = '' }: SkeletonRowsProps) {
  const rowCount = Math.max(3, Math.min(8, Math.round(count)))
  return (
    <div className={`state-skeleton state-skeleton-rows ${className}`.trim()} aria-hidden="true" data-testid="skeleton-rows">
      {Array.from({ length: rowCount }, (_, index) => (
        <span className="state-skeleton-row" key={index}>
          <i />
          <b style={{ width: `${38 + (index % 3) * 7}%` }} />
          <em style={{ width: `${14 + (index % 3) * 5}%` }} />
        </span>
      ))}
    </div>
  )
}
