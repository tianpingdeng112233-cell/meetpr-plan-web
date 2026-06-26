import { useEffect, useMemo, useRef, useState } from 'react'
import type { ExerciseIndex, ExerciseHit } from '../exerciseIndex'

interface Props {
  visible: boolean
  x: number
  y: number
  index: ExerciseIndex | null
  initialQuery: string
  onPick: (hit: ExerciseHit) => void
  onCreateCustom: (name: string) => void
}

export function ExercisePopover({ visible, x, y, index, initialQuery, onPick, onCreateCustom }: Props) {
  const [q, setQ] = useState(initialQuery)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (visible) { setQ(initialQuery); setTimeout(() => inputRef.current?.focus(), 0) }
  }, [visible, initialQuery])

  const hits = useMemo(() => (index ? index.search(q) : []), [index, q])
  if (!visible) return null

  return (
    <div data-popover="" onMouseDown={(e) => e.stopPropagation()} onClick={(e) => e.stopPropagation()} style={{
      position: 'absolute', zIndex: 60, width: 248, left: x, top: y,
      background: 'var(--surface-2)', border: '1px solid var(--border-strong)',
      borderRadius: 10, overflow: 'hidden', fontSize: 12,
    }}>
      <div style={{ padding: 8, borderBottom: '1px solid var(--border)' }}>
        <input
          ref={inputRef} value={q} onChange={(e) => setQ(e.target.value)}
          placeholder="搜索动作 / 别名…"
          style={{
            width: '100%', boxSizing: 'border-box', padding: '6px 8px', background: 'var(--surface-1)',
            border: '1px solid var(--border)', borderRadius: 6, color: '#fff', fontSize: 13, outline: 'none',
          }}
        />
      </div>
      <div style={{ maxHeight: 240, overflowY: 'auto' }}>
        {hits.map((h) => (
          <div key={h.id} className="popitem" onClick={() => onPick(h)}
            style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 11px', color: '#fff' }}>
            <span style={{ flex: 1 }}>{h.name}</span>
            {h.via && h.via !== h.name && <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--fg-tertiary)' }}>别名「{h.via}」</span>}
          </div>
        ))}
        {q.trim() && hits.length === 0 && (
          <div style={{ padding: '8px 11px', color: 'var(--fg-tertiary)' }}>无匹配动作</div>
        )}
      </div>
      {q.trim() && (
        <div className="popitem" onClick={() => onCreateCustom(q.trim())}
          style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '8px 11px', color: 'var(--fg-secondary)', borderTop: '1px solid var(--border)' }}>
          <span style={{ color: '#fff' }}>＋</span> 创建自定义「{q.trim()}」
        </div>
      )}
    </div>
  )
}
