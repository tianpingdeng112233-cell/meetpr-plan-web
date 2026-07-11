import { useMemo } from 'react'
import type { ExerciseIndex, ExerciseHit } from '../exerciseIndex'

interface Props {
  visible: boolean
  x: number
  y: number
  index: ExerciseIndex | null
  query: string
  onPick: (hit: ExerciseHit) => void
  onCreateCustom?: (name: string) => void
}

// Results-only dropdown: the query is typed directly in the name cell (no own
// search box). mousedown (not click) so picking fires before the input blurs.
export function ExercisePopover({ visible, x, y, index, query, onPick, onCreateCustom }: Props) {
  const hits = useMemo(() => (index ? index.search(query) : []), [index, query])
  if (!visible || !query.trim()) return null

  return (
    <div data-popover="" onMouseDown={(e) => e.preventDefault()} style={{
      position: 'absolute', zIndex: 60, width: 248, left: x, top: y,
      background: 'var(--surface-2)', border: '1px solid var(--border-strong)',
      borderRadius: 10, overflow: 'hidden', fontSize: 12, boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
    }}>
      <div style={{ maxHeight: 236, overflowY: 'auto' }}>
        {hits.map((h) => (
          <div key={h.id} className="popitem" onMouseDown={(e) => { e.preventDefault(); onPick(h) }}
            style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 11px', color: '#fff' }}>
            <span style={{ flex: 1 }}>{h.name}</span>
            {h.via && h.via !== h.name && <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--fg-tertiary)' }}>别名「{h.via}」</span>}
          </div>
        ))}
        {hits.length === 0 && <div style={{ padding: '8px 11px', color: 'var(--fg-tertiary)' }}>无匹配动作</div>}
      </div>
      {onCreateCustom && (
        <div className="popitem" onMouseDown={(e) => { e.preventDefault(); onCreateCustom(query.trim()) }}
          style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '8px 11px', color: 'var(--fg-secondary)', borderTop: '1px solid var(--border)' }}>
          <span style={{ color: '#fff' }}>＋</span> 创建自定义「{query.trim()}」
        </div>
      )}
    </div>
  )
}
