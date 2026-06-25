interface Props {
  visible: boolean
  x: number
  y: number
  onPick: (name: string) => void
}

// Static suggestion list for now; wired to the real catalog (GET /exercises) later.
const SUGGESTIONS: { name: string; tag: string; tagColor: string }[] = [
  { name: '低杆深蹲', tag: '✓ 库', tagColor: 'var(--green)' },
  { name: '高杆深蹲', tag: '✓ 库', tagColor: 'var(--green)' },
  { name: '暂停深蹲', tag: '✓ 库', tagColor: 'var(--green)' },
  { name: '安全杆深蹲', tag: '含备注', tagColor: 'var(--fg-tertiary)' },
]

export function ExercisePopover({ visible, x, y, onPick }: Props) {
  if (!visible) return null
  return (
    <div data-popover="" style={{
      position: 'absolute', zIndex: 60, width: 212, left: x, top: y,
      background: 'var(--surface-2)', border: '1px solid var(--border-strong)',
      borderRadius: 10, overflow: 'hidden', fontSize: 12,
    }}>
      <div style={{ padding: '7px 11px', borderBottom: '1px solid var(--border)', fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: '.08em', color: 'var(--fg-tertiary)', textTransform: 'uppercase' }}>
        动作库 · 联想匹配
      </div>
      {SUGGESTIONS.map((s) => (
        <div key={s.name} className="popitem" onClick={(e) => { e.stopPropagation(); onPick(s.name) }}
          style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '7px 11px', color: '#fff' }}>
          <span>{s.name}</span>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: s.tagColor, letterSpacing: '.04em' }}>{s.tag}</span>
        </div>
      ))}
      <div className="popitem" onClick={(e) => e.stopPropagation()} style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '8px 11px', color: 'var(--fg-secondary)', borderTop: '1px solid var(--border)' }}>
        <span style={{ color: '#fff' }}>＋</span> 创建自定义动作
      </div>
      <div style={{ padding: '6px 11px', background: 'var(--surface-1)', fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--fg-tertiary)', letterSpacing: '.04em' }}>
        ↑↓ 选择 · ↵ 确认 · esc 取消
      </div>
    </div>
  )
}
