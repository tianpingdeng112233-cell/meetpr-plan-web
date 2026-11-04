import { useEffect, useMemo, useState } from 'react'
import type { CoachStudent } from '../../api/types'
import { localDate } from './serviceTerm'
import { S, resolveLocale } from '../../i18n/strings'
import { buildStudentRail, previouslyEnded, type StudentRailRow } from './studentRailModel'
import { usePersistentCollapse } from './usePersistentCollapse'

export function StudentRail({ students, currentStudentId, onSelect }: {
  students: readonly CoachStudent[]
  currentStudentId: string
  onSelect: (id: string) => void | Promise<void>
}) {
  const [query, setQuery] = useState('')
  const [collapsed, toggle] = usePersistentCollapse('meetpr:student-rail:collapsed')
  const [endedCollapsed, toggleEnded, setEndedCollapsed] = usePersistentCollapse('meetpr:student-rail:ended-collapsed', true)
  const locale = resolveLocale()
  const today = localDate()
  const { active, ended } = useMemo(() => buildStudentRail(students, query), [students, query, locale, today])
  const selectedEndedId = students.find(student => student.id === currentStudentId && student.bond_status === 'ended')?.id
  useEffect(() => {
    if (selectedEndedId) setEndedCollapsed(false)
  }, [selectedEndedId, setEndedCollapsed])
  const searching = !!query.trim()
  const labels = S.workspace.studentRail
  const row = (item: StudentRailRow) => <button type="button" key={item.student.id}
    className={`student-rail-row${item.student.bond_status === 'ended' ? ' ended' : ''}${item.serviceTerm ? ' has-service-term' : ''}`}
    aria-current={item.student.id === currentStudentId ? 'true' : undefined} onClick={() => void onSelect(item.student.id)}>
    <span className="student-rail-name"><b>{item.displayName}</b>{item.status && item.subtitle && <small>{item.subtitle}</small>}{item.serviceTerm && <span className={`service-term-capsule ${item.serviceTerm.tone}`}>{item.serviceTerm.shortLabel}</span>}</span>
    {item.status ? <>
      <small className={`student-rail-status ${item.status.key}`}>{item.status.key === 'completed' ? labels.completed(item.status.time) : labels[item.status.key]}</small>
      {item.pendingVideoCount > 0 && <span className="student-rail-video-count">{item.pendingVideoCount}</span>}
    </> : <small>{labels.unboundAt(previouslyEnded({ previously_ended_at: item.endedAt }) ?? '—')}</small>}
  </button>
  return <aside className={`student-rail${collapsed ? ' collapsed' : ''}`} aria-label={S.common.student}>
    <header><b>{!collapsed && labels.title(students.filter(student => student.bond_status !== 'ended').length)}</b>
      <button type="button" aria-label={collapsed ? labels.expand : labels.collapse} aria-expanded={!collapsed} onClick={toggle}>{collapsed ? '→' : '←'}</button>
    </header>
    {!collapsed && <>
      <input type="search" aria-label={labels.search} placeholder={labels.search} value={query} onChange={event => setQuery(event.target.value)} />
      <div className="student-rail-list">
        {searching ? active.length > 0 && <><h3>{labels.activeCount(active.length)}</h3>{active.map(row)}</>
          : (['completed', 'scheduled', 'rest'] as const).map(key => {
            const group = active.filter(item => item.status?.key === key)
            return group.length > 0 && <section key={key}><h3>{labels[`${key}Group`]}</h3>{group.map(row)}</section>
          })}
        {searching && ended.length > 0 && <><h3>{labels.endedCount(ended.length)}</h3>{ended.map(row)}</>}
        {active.length === 0 && ended.length === 0 && <div className="student-rail-empty"><b>{labels.empty}</b><small>{labels.emptyHint}</small></div>}
      </div>
      {!searching && <div className="student-rail-ended">
        <button type="button" className="student-rail-ended-toggle" aria-expanded={!endedCollapsed} onClick={toggleEnded}>{endedCollapsed ? '▸' : '▾'} {labels.endedCount(ended.length)}</button>
        {!endedCollapsed && <div>{ended.map(row)}</div>}
      </div>}
    </>}
  </aside>
}
