export type CoachView = 'editor' | 'board' | 'videos' | 'requests'

const tabs: { id: CoachView; icon: string; label: string }[] = [
  { id: 'editor', icon: '▤', label: '计划编写' },
  { id: 'board', icon: '▦', label: '学员看板' },
  { id: 'videos', icon: '▶', label: '训练视频' },
  { id: 'requests', icon: '⊕', label: '学员申请' },
]

export function CoachRail({ view, pending, onChange }: { view: CoachView; pending: number; onChange: (view: CoachView) => void }) {
  return <nav className="coach-rail" aria-label="教练工作区">
    <div className="coach-rail-logo">M</div>
    {tabs.map((tab) => <button key={tab.id} type="button" className={`coach-rail-tab${view === tab.id ? ' active' : ''}`} onClick={() => onChange(tab.id)}>
      <span className="coach-rail-icon">{tab.icon}</span><span>{tab.label}</span>
      {tab.id === 'requests' && pending > 0 && <span className="coach-rail-badge">{pending > 99 ? '99+' : pending}</span>}
    </button>)}
  </nav>
}
