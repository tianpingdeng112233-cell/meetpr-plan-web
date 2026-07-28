import type { ExerciseIndex, ExerciseHit } from '../exerciseIndex'

interface Props {
  visible: boolean
  x: number
  y: number
  index: ExerciseIndex | null
  query: string
  activeIndex: number
  onActiveIndexChange: (index: number) => void
  onPick: (hit: ExerciseHit) => void
  onCreateCustom?: (name: string) => void
}

// Results-only dropdown: the query is typed directly in the name cell (no own
// search box). mousedown (not click) so picking fires before the input blurs.
export function ExercisePopover({ visible, x, y, index, query, activeIndex, onActiveIndexChange, onPick, onCreateCustom }: Props) {
  // ExerciseIndex.bump mutates session usage in place. Re-run the tiny catalog
  // scan on render so reopening the same query reflects the new ordering too.
  const hits = index ? index.search(query) : []
  if (!visible || !query.trim()) return null

  return (
    <div data-popover="" onMouseDown={(e) => e.preventDefault()} style={{
      position: 'absolute', zIndex: 60, width: 248, left: x, top: y,
      background: 'var(--card-bg)', border: '1px solid var(--bd)',
      borderRadius: 'var(--r-sm)', overflow: 'hidden', fontSize: 12, boxShadow: 'var(--elev-modal)',
    }}>
      <div style={{ maxHeight: 236, overflowY: 'auto' }}>
        {hits.map((h, hitIndex) => (
          <div key={h.id} className="popitem" role="option" aria-selected={activeIndex === hitIndex}
            data-active={activeIndex === hitIndex ? 'true' : undefined}
            onMouseEnter={() => onActiveIndexChange(hitIndex)}
            onMouseDown={(e) => { e.preventDefault(); onPick(h) }}
            style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 11px', color: 'var(--txt)', background: activeIndex === hitIndex ? 'var(--ink-soft)' : undefined }}>
            <span style={{ flex: 1 }}>{h.name}</span>
            {h.via && h.via !== h.name && <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--mut)' }}>别名「{h.via}」</span>}
          </div>
        ))}
        {hits.length === 0 && <div style={{ padding: '8px 11px', color: 'var(--mut)' }}>无匹配动作</div>}
      </div>
      {onCreateCustom && (
        <div className="popitem" role="option" aria-selected={activeIndex === hits.length}
          data-active={activeIndex === hits.length ? 'true' : undefined}
          onMouseEnter={() => onActiveIndexChange(hits.length)}
          onMouseDown={(e) => { e.preventDefault(); onCreateCustom(query.trim()) }}
          style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '8px 11px', color: 'var(--sec)', borderTop: '1px solid var(--line)', background: activeIndex === hits.length ? 'var(--tint)' : undefined }}>
          <span style={{ color: 'var(--ink)' }}>＋</span> 创建自定义「{query.trim()}」
        </div>
      )}
    </div>
  )
}
