export type CoachView = 'editor' | 'catalog' | 'board' | 'videos' | 'requests' | 'messages'

const tabs: { id: CoachView; icon: string; label: string }[] = [
  { id: 'editor', icon: '▤', label: '计划编写' },
  { id: 'catalog', icon: '▧', label: '动作库' },
  { id: 'board', icon: '▦', label: '学员看板' },
  { id: 'videos', icon: '▶', label: '训练视频' },
  { id: 'requests', icon: '⊕', label: '学员申请' },
  { id: 'messages', icon: '✉', label: '消息' },
]

export function CoachRail({ view, badges, onChange }: {
  view: CoachView
  badges?: Partial<Record<CoachView, number>>
  onChange: (view: CoachView) => void
}) {
  return <nav className="coach-rail" aria-label="教练工作区">
    <div className="coach-rail-logo">M</div>
    {tabs.map((tab) => {
      const count = badges?.[tab.id] ?? 0
      return <button key={tab.id} type="button" className={`coach-rail-tab${view === tab.id ? ' active' : ''}`} onClick={() => onChange(tab.id)}>
        <span className="coach-rail-icon">{tab.icon}</span><span>{tab.label}</span>
        {count > 0 && <span className="coach-rail-badge">{count > 99 ? '99+' : count}</span>}
      </button>
    })}
  </nav>
}
