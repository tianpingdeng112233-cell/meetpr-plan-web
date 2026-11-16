import { useGlobalKeyboardHandler } from '../../workspace/globalKeyboard'
import type { DayCol, ExerciseRow, Week } from '../types'
import { planDayKey, orderRowsForDisplay } from '../selectionModel'
import { useState, type ComponentProps } from 'react'
import { S } from '../../../i18n/strings'
import type { PlanEditorProps } from '../PlanEditor'
import { inferTrainingColumns } from '../blockGridModel'
import { loadBlockExtraWeekdays, loadBlockWeekdays } from '../../workspace/blockPlanSettings'
import { BlockGrid } from './BlockGrid'
import { CycleHeading } from './CycleHeading'

export function PreviousCycle({ cycle, coachId, layout, onLayout, rowTier, comparisonRows, active, onCopy, showActuals, actualsForRow, studentAddedByDay, exerciseName }: {
  active: boolean; onCopy: (rows: ExerciseRow[], day?: DayCol) => void
  cycle: NonNullable<PlanEditorProps['previousCycle']>; coachId?: string
} & Pick<ComponentProps<typeof BlockGrid>, 'layout' | 'onLayout' | 'rowTier' | 'comparisonRows' | 'showActuals' | 'actualsForRow' | 'studentAddedByDay' | 'exerciseName'>) {
  const { plan, weeks } = cycle
  const preference = `meetpr:previous-cycle-collapsed:${coachId ?? 'local'}`
  const [collapsed, setCollapsed] = useState(() => { try { return localStorage.getItem(preference) === 'true' } catch { return false } })
  const [shown, setShown] = useState(2)
  const collapse = (next: boolean) => {
    setCollapsed(next); setShown(2); setSelection(null)
    try { localStorage.setItem(preference, String(next)) } catch { /* Session preference still works. */ }
  }
  const visible = weeks?.slice(-shown) ?? []
  const all = shown >= plan.plan_weeks
  const [selection, setSelection] = useState<{ week: Week; day: DayCol; rows: string[]; anchor?: string } | null>(null)
  useGlobalKeyboardHandler(({ event, editable }) => {
    if (!active || editable) return false
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'c' && selection) {
      event.preventDefault()
      const rows = orderRowsForDisplay(selection.day.rows, rowTier)
      onCopy(selection.rows.length ? rows.filter(row => selection.rows.includes(row.id)) : rows,
        selection.rows.length ? undefined : selection.day)
      return true
    }
    if (event.key === 'Escape') setSelection(null)
    // Previous content is a copy source only. No current-block keyboard mutations.
    if (((event.metaKey || event.ctrlKey) && ['v', 'x', 'z', 'd', 's'].includes(event.key.toLowerCase())) || ['Delete', 'Backspace'].includes(event.key)) event.preventDefault()
    return true
  }, 1)
  const weekdays = loadBlockWeekdays(plan.id) ?? inferTrainingColumns(weeks ?? [], plan.start_date).map(column => column.weekday)
  return <section data-previous-cycle="" className="previous-cycle" style={layout === 'by-day' ? { width: collapsed ? 380 : 84 + Math.min(shown, plan.plan_weeks) * 215 } : undefined} aria-label={S.block.previousCycle}>
    <header className="cycle-bar">
      <CycleHeading previous name={plan.name} start={plan.start_date} count={plan.plan_weeks} status={plan.status} collapsed={collapsed} />
      <div className="cycle-actions">
        {!collapsed && <>
          <span className="cycle-range">{S.block.cycleRange(Math.max(1, plan.plan_weeks - shown + 1), plan.plan_weeks, Math.min(shown, plan.plan_weeks))}</span>
          {!all && <><button onClick={() => setShown(count => count + 1)}>{layout === 'by-day' ? '←' : '↑'} {S.block.cycleEarlier}</button><button onClick={() => setShown(plan.plan_weeks)}>{S.block.cycleExpandAll}</button></>}
        </>}
        <button aria-expanded={!collapsed} onClick={() => collapse(!collapsed)}>{collapsed ? S.block.cycleExpand : S.block.cycleCollapse}</button>
      </div>
    </header>
    {!collapsed && !weeks && <div className="cycle-message" role={cycle.failed ? 'alert' : 'status'}>
      {cycle.failed ? <>{S.block.cycleLoadFailed} <button onClick={cycle.onRetry}>{S.common.retry}</button></> : S.common.loadingEllipsis}
    </div>}
    {!collapsed && weeks && <BlockGrid showActuals={showActuals} actualsForRow={actualsForRow} studentAddedByDay={studentAddedByDay} exerciseName={exerciseName} comparisonRows={comparisonRows} weeks={visible} startDate={plan.start_date} weekdays={weekdays} extraWeekdays={loadBlockExtraWeekdays(plan.id)}
      showRestDays={cycle.restDaysEnabled} layout={layout} onLayout={onLayout} readOnly editing={null}
      selectedDays={new Set(active && selection ? [planDayKey({ wnum: selection.week.num, dow: selection.day.dow })] : [])} selectedRows={new Set(active ? selection?.rows : [])} rowTier={rowTier} renderDay={() => null} renderCapacity={() => null}
      onOpen={(week, day) => setSelection({ week, day, rows: [] })} onClose={() => {}}
      onSelectRow={(week, day, rowId, modifiers) => {
        const sameDay = selection?.week.num === week.num && selection.day.dow === day.dow
        const rows = sameDay && modifiers.toggle ? selection.rows.includes(rowId) ? selection.rows.filter(id => id !== rowId) : [...selection.rows, rowId] : [rowId]
        if (sameDay && modifiers.range && selection.anchor) {
          const ordered = orderRowsForDisplay(day.rows, rowTier).map(row => row.id)
          const from = ordered.indexOf(selection.anchor), to = ordered.indexOf(rowId)
          setSelection({ week, day, rows: ordered.slice(Math.min(from, to), Math.max(from, to) + 1), anchor: selection.anchor })
        } else setSelection({ week, day, rows, anchor: rowId })
      }}
      onSelectRectangle={(days, rows) => {
        const week = weeks.find(week => week.num === days[0]?.wnum)
        const day = week?.days.find(day => day.dow === days[0]?.dow)
        if (week && day) setSelection({ week, day, rows })
      }}
      onRowDragState={() => {}} onReorderRow={() => {}} onInsert={() => {}} onFill={() => {}} onWeekday={() => {}}
      onContext={event => event.preventDefault()} />}
  </section>
}
