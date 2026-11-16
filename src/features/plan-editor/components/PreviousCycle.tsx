import { useState } from 'react'
import { S } from '../../../i18n/strings'
import { PlanEditor, type PlanEditorProps } from '../PlanEditor'
import { CycleHeading } from './CycleHeading'

export function PreviousCycle({ cycle, coachId, editorProps, presentation }: {
  cycle: NonNullable<PlanEditorProps['previousCycle']>; coachId?: string
  editorProps: Pick<PlanEditorProps, 'studentName' | 'studentId' | 'student' | 'exerciseIndex' | 'onCreateExercise' | 'suspended' | 'videos' | 'exerciseStatsOverview' | 'onboardingProfile' | 'onLeaveGuardChange' | 'renderCommunication' | 'communicationOpen' | 'onCommunicationOpenChange' | 'onAnnotationPrepared' | 'onStudentChanged' | 'onVideoViewed' | 'onRefreshVideos' | 'onOpenVideos'>
  presentation: Omit<NonNullable<PlanEditorProps['embedded']>, 'shown' | 'collapsed' | 'header'>
}) {
  const { plan, weeks } = cycle
  const preference = `meetpr:previous-cycle-collapsed:${coachId ?? 'local'}`
  const [collapsed, setCollapsed] = useState(() => { try { return localStorage.getItem(preference) === 'true' } catch { return false } })
  const [shown, setShown] = useState(2)
  const collapse = (next: boolean) => {
    setCollapsed(next); setShown(2)
    try { localStorage.setItem(preference, String(next)) } catch { /* Session preference still works. */ }
  }
  const all = shown >= plan.plan_weeks
  const header: NonNullable<PlanEditorProps['embedded']>['header'] = ({ dirty, saving, readOnly, update, shiftNotice }) => <header className="cycle-bar">
    <CycleHeading previous readOnly={readOnly} name={plan.name} start={plan.start_date} count={plan.plan_weeks} status={plan.status} collapsed={collapsed} />
    {dirty && <span className="cycle-dirty">{S.block.cycleDirty}</span>}
    <div className="cycle-actions">
      {dirty ? <button className="primary" disabled={saving || readOnly} onClick={update}>{S.block.cycleUpdate}</button> : !collapsed && <>
        <span className="cycle-range">{S.block.cycleRange(Math.max(1, plan.plan_weeks - shown + 1), plan.plan_weeks, Math.min(shown, plan.plan_weeks))}</span>
        {!all && <><button onClick={() => setShown(count => count + 1)}>{presentation.layout === 'by-day' ? '←' : '↑'} {S.block.cycleEarlier}</button><button onClick={() => setShown(plan.plan_weeks)}>{S.block.cycleExpandAll}</button></>}
      </>}
      <button aria-expanded={!collapsed} onClick={() => collapse(!collapsed)}>{collapsed ? S.block.cycleExpand : S.block.cycleCollapse}</button>
    </div>
    {shiftNotice}
  </header>
  return <section data-previous-cycle="" className="previous-cycle" style={presentation.layout === 'by-day' ? { width: collapsed ? 380 : 84 + Math.min(shown, plan.plan_weeks) * 215 } : undefined} aria-label={S.block.previousCycle}>
    {weeks ? <PlanEditor {...editorProps} coachId={coachId} currentPlanId={plan.id} initialWeeks={weeks} weeksCount={plan.plan_weeks}
      planName={plan.name} planStartDate={plan.start_date} planStatus={plan.status} initialPublished={plan.status === 'published'}
      totalShiftDays={plan.total_shift_days} latestShift={plan.latest_shift}
      restDaysEnabled={cycle.restDaysEnabled} onSave={cycle.onSave} onPlanRefreshed={cycle.onPlanRefreshed}
      onPendingRevisionSavedAtChange={cycle.onPendingRevisionSavedAtChange}
      embedded={{ ...presentation, pendingRevisionSavedAt: plan.pending_revision_saved_at, shown, collapsed, header }} /> : <>
      {header({ dirty: false, saving: false, readOnly: plan.status !== 'published', update: () => {} })}
      {!collapsed && <div className="cycle-message" role={cycle.failed ? 'alert' : 'status'}>
        {cycle.failed ? <>{S.block.cycleLoadFailed} <button onClick={cycle.onRetry}>{S.common.retry}</button></> : S.common.loadingEllipsis}
      </div>}
    </>}
  </section>
}
