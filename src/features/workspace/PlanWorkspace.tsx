import { useCallback, useEffect, useRef, useState } from 'react'
import type { CoachBindRequest, CoachStudent, ExerciseResponse, PlanResponse, PlanWithChildren, StudentOnboardingProfile } from '../../api/types'
import {
  getCoachStudents, getStudentPlans, getPlan, publishPlan, createPlan, patchPlan, getStudentOnboarding,
  markImportedHistory, renameCoachStudent, deletePlan,
} from '../../api/plans'
import { listExercises, createCustomExercise } from '../../api/exercises'
import type { CreateCustomExerciseInput } from '../../api/exercises'
import { ApiException } from '../../api/client'
import { mapPlanToWeeks, type Catalog } from '../plan-editor/mapping'
import { displayExerciseName, ExerciseIndex } from '../plan-editor/exerciseIndex'
import { reconcilePlan, reconcileImportedPlan, resizeServerPlanWeeks } from '../plan-editor/reconcile'
import { PlanEditor } from '../plan-editor/PlanEditor'
import { buildWeeks as buildSampleWeeks } from '../plan-editor/sampleData'
import { SamplePreviewBanner } from './SamplePreviewBanner'
import type { Week } from '../plan-editor/types'
import { planEndISO, todayISO } from '../plan-editor/components/PlanCalendarControls'
import { BackfillHistoryDialog, CompletePlanDialog, DeletePlanDialog, NewPlanDialog } from './PlanDialogs'
import { getBindRequests, refreshCoachStudents } from '../../api/coach'
import { CoachRail, type CoachView } from './CoachRail'
import { StudentBoard } from './StatsViews'
import { VideosPage } from './VideosPage'
import { RequestsPage } from './RequestsPage'
import { CatalogPage } from '../catalog/CatalogPage'

interface Props { onLogout: () => void | Promise<void> }
type Loaded = { plan: PlanWithChildren; weeks: Week[]; weeksCount: number }
const LAST_PLAN_PREFIX = 'mpw.lastPlan.'

export function PlanWorkspace({ onLogout }: Props) {
  const [catalog, setCatalog] = useState<Catalog | null>(null)
  const [exerciseList, setExerciseList] = useState<ExerciseResponse[]>([])
  const [index, setIndex] = useState<ExerciseIndex | null>(null)
  const [students, setStudents] = useState<CoachStudent[]>([])
  const [studentId, setStudentId] = useState<string>('')
  const [onboarding, setOnboarding] = useState<StudentOnboardingProfile | null | undefined>(undefined)
  const [view, setView] = useState<CoachView>('editor')
  const [bindRequests, setBindRequests] = useState<CoachBindRequest[]>([])
  const [plans, setPlans] = useState<PlanResponse[]>([])
  const [planId, setPlanId] = useState<string>('')
  const [loaded, setLoaded] = useState<Loaded | null>(null)
  const [error, setError] = useState('')
  const [booting, setBooting] = useState(true)
  const [newPlanOpen, setNewPlanOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState('')
  const [completeOpen, setCompleteOpen] = useState(false)
  const [backfillOpen, setBackfillOpen] = useState(false)
  const [backfilling, setBackfilling] = useState(false)
  const [backfillError, setBackfillError] = useState('')
  const [completing, setCompleting] = useState(false)
  const [completeError, setCompleteError] = useState('')
  // Student and plan requests can resolve out of order when a coach switches
  // quickly. A single generation covers both levels so an old response can
  // never pair one student's label with another student's editable plan.
  const loadGeneration = useRef(0)

  const errText = (e: unknown, fb: string) => (e instanceof ApiException ? `${fb}（${e.code}）` : fb)
  const sortedPlans = (list: PlanResponse[]) => [...list].sort((a, b) => (
    new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
  ))

  const loadPlan = useCallback(async (id: string, cat: Catalog, generation = ++loadGeneration.current) => {
    try {
      const full = await getPlan(id)
      if (generation !== loadGeneration.current) return false
      // Set loaded + planId together (after the fetch) so the keyed PlanEditor
      // remounts once with the real weeks — not an empty mount on an early key change.
      setLoaded({ plan: full, weeks: mapPlanToWeeks(full, cat), weeksCount: full.plan_weeks })
      setPlanId(id)
      localStorage.setItem(`${LAST_PLAN_PREFIX}${full.trainee_id}`, id)
      return true
    } catch (e) {
      // A rejected request from a student/plan that is no longer selected is
      // just stale work, not an error for the current workspace.
      if (generation !== loadGeneration.current) return false
      throw e
    }
  }, [])

  const loadStudent = useCallback(async (id: string, cat: Catalog, exercises: ExerciseResponse[] = exerciseList) => {
    const generation = ++loadGeneration.current
    setStudentId(id); setOnboarding(undefined); setLoaded(null); setPlanId('')
    try {
      const [list, onboarding] = await Promise.all([
        getStudentPlans(id),
        getStudentOnboarding(id).catch(() => null),
      ])
      if (generation !== loadGeneration.current) return false
      setOnboarding(onboarding)
      setIndex(new ExerciseIndex(exercises, { deadliftStyle: onboarding?.deadlift_style }))
      const sorted = sortedPlans(list)
      setPlans(sorted)
      const remembered = localStorage.getItem(`${LAST_PLAN_PREFIX}${id}`)
      const initial = sorted.find((plan) => plan.id === remembered) ?? sorted[0]
      if (initial) return await loadPlan(initial.id, cat, generation)
      return true
    } catch (e) {
      if (generation !== loadGeneration.current) return false
      throw e
    }
  }, [exerciseList, loadPlan])

  // boot: catalog + roster + first student + first plan
  useEffect(() => {
    (async () => {
      try {
        const [ex, st, requests] = await Promise.all([listExercises(), getCoachStudents(), getBindRequests().catch(() => [])])
        const cat: Catalog = new Map(ex.map((e) => [e.id, { name: displayExerciseName(e.name), custom: e.created_by_coach_id != null }]))
        setExerciseList(ex); setCatalog(cat); setIndex(new ExerciseIndex(ex)); setStudents(st); setBindRequests(requests)
        if (st.length > 0) await loadStudent(st[0].id, cat, ex)
      } catch (e) {
        setError(errText(e, '无法连接后端'))
      } finally { setBooting(false) }
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    const id = window.setInterval(() => { void getBindRequests().then(setBindRequests).catch(() => undefined) }, 60_000)
    return () => window.clearInterval(id)
  }, [])

  const switchStudent = async (id: string) => {
    if (!catalog || id === studentId) return
    try {
      await loadStudent(id, catalog)
    } catch (e) {
      setError(errText(e, '切换学员失败'))
    }
  }
  const refreshStudentsAfterAccept = async () => {
    const next = await refreshCoachStudents()
    setStudents(next)
    if (!studentId && next[0] && catalog) await loadStudent(next[0].id, catalog)
  }
  const switchPlan = async (id: string) => {
    if (!catalog || id === planId) return
    try {
      await loadPlan(id, catalog)
    } catch (e) {
      setError(errText(e, '打开计划失败'))
    }
  }
  const newPlan = () => {
    if (!catalog || !studentId) return
    setNewPlanOpen(true)
  }
  const createNewPlan = async (name: string, weeks: number, startDate: string) => {
    if (!catalog || !studentId) throw new Error('PLAN_CONTEXT_MISSING')
    const generation = ++loadGeneration.current
    const targetStudentId = studentId
    try {
      const created = await createPlan({
        trainee_id: targetStudentId, name, start_date: startDate, end_date: planEndISO(startDate, weeks),
        plan_weeks: weeks, source: 'coach', kind: 'regular',
      })
      if (generation !== loadGeneration.current) return
      setPlans((prev) => [created, ...prev])
      await loadPlan(created.id, catalog, generation)
      setNewPlanOpen(false)
    } catch (e) {
      if (generation === loadGeneration.current) throw e
    }
  }

  const deleteCurrentPlan = async () => {
    if (!loaded || loaded.plan.status !== 'draft' || !catalog || deleting) return
    setDeleting(true)
    setDeleteError('')
    const deletedId = loaded.plan.id
    const generation = ++loadGeneration.current
    try {
      await deletePlan(deletedId)
      if (generation !== loadGeneration.current) return
      const remaining = sortedPlans(plans.filter((plan) => plan.id !== deletedId))
      setPlans(remaining)
      setDeleteOpen(false)
      if (remaining[0]) {
        await loadPlan(remaining[0].id, catalog, generation)
      } else {
        setLoaded(null)
        setPlanId('')
        localStorage.removeItem(`${LAST_PLAN_PREFIX}${studentId}`)
      }
    } catch (e) {
      if (generation === loadGeneration.current) setDeleteError(errText(e, '删除失败，请稍后重试'))
    } finally {
      if (generation === loadGeneration.current) setDeleting(false)
    }
  }

  const backfillHistory = async () => {
    if (!loaded || backfilling) return
    setBackfilling(true)
    setBackfillError('')
    try {
      const result = await markImportedHistory(loaded.plan.id)
      setBackfillOpen(false)
      window.alert(result.created_set_logs > 0
        ? `已补记 ${result.created_set_logs} 组历史记录（标「导」），学员数据面板即刻可见。`
        : '过去的训练日均已有记录，无需补记。')
    } catch (e) {
      setBackfillError(errText(e, '补记失败，请稍后重试'))
    } finally {
      setBackfilling(false)
    }
  }

  const markCurrentComplete = async () => {
    if (!loaded || loaded.plan.status !== 'published' || completing) return
    setCompleting(true)
    setCompleteError('')
    try {
      const updated = await patchPlan(loaded.plan.id, { status: 'completed' })
      setPlans((prev) => prev.map((plan) => plan.id === updated.id ? updated : plan))
      setLoaded((prev) => prev && prev.plan.id === updated.id
        ? { ...prev, plan: { ...prev.plan, ...updated } }
        : prev)
      setCompleteOpen(false)
    } catch (e) {
      setCompleteError(errText(e, '标记完成失败，请稍后重试'))
    } finally {
      setCompleting(false)
    }
  }

  const handleCreateExercise = async (input: CreateCustomExerciseInput) => {
    const exercise = await createCustomExercise(input)
    const custom = exercise.created_by_coach_id != null
    setExerciseList((prev) => (prev.some((item) => item.id === exercise.id) ? prev : [...prev, exercise]))
    setCatalog((prev) => {
      const next = new Map(prev ?? [])
      next.set(exercise.id, { name: displayExerciseName(exercise.name), custom })
      return next
    })
    setIndex((prev) => (prev ? prev.withAdded(exercise) : new ExerciseIndex([exercise])))
    return { id: exercise.id, name: exercise.name }
  }

  if (error) {
    return (
      <Centered>
        <div style={{ color: 'var(--brand-red)', marginBottom: 14 }}>{error}</div>
        <button onClick={onLogout} style={btn}>退出重登</button>
      </Centered>
    )
  }
  if (booting) return <Centered><span style={{ color: 'var(--fg-tertiary)' }}>加载中…</span></Centered>
  if (students.length === 0) {
    // No bound students yet — instead of a dead-end, drop the coach into the editor populated
    // with a read-only sample plan so the layout is visible, with a persistent banner that
    // marks it as a sample and surfaces the invite code (the real way to get a student).
    // Omitting students/plans/onSave/onPublish keeps the editor in disconnected sample mode:
    // switchers are static, save/import buttons hide, publish only toggles locally.
    const sampleWeeks = buildSampleWeeks()
    return (
      <div className="coach-shell"><CoachRail view={view} pending={bindRequests.length} onChange={setView} /><div className="coach-main">
        {view === 'editor' && <div style={{ position: 'relative', height: '100vh' }}><PlanEditor
          key="sample-preview"
          initialWeeks={sampleWeeks}
          weeksCount={sampleWeeks.length}
          studentName="示例学员"
          planName="示例计划"
          exerciseIndex={index}
          onLogout={onLogout}
        />
        <SamplePreviewBanner onRefresh={() => window.location.reload()} />
        </div>}
        {view === 'catalog' && <CatalogPage
          exerciseList={exerciseList}
          catalog={catalog}
          index={index}
          onCreateExercise={handleCreateExercise}
          onUseExercise={() => setView('editor')}
        />}
        {view === 'requests' && <RequestsPage requests={bindRequests} onRequestsChanged={setBindRequests} onAccepted={refreshStudentsAfterAccept} />}
        {(view === 'board' || view === 'videos') && <div className="empty-page">接受学员申请后即可查看{view === 'board' ? '学员看板' : '训练视频'}</div>}
      </div></div>
    )
  }

  const studentName = students.find((s) => s.id === studentId)?.display_name ?? ''
  const studentOpts = students.map((s) => ({ id: s.id, label: s.display_name, tag: s.status === 'in_evaluation' ? '评估期' : undefined }))
  // "M/D 起 · N 周" so same-named plans stay tellable-apart in the switcher.
  const fmtStart = (iso: string) => { const [, m, d] = iso.split('-'); return `${Number(m)}/${Number(d)}` }
  const statusTag = (status: PlanResponse['status']) => ({ draft: '草稿', published: '已发布', completed: '已完成', paused: '已暂停' })[status]
  const planOpts = plans.map((p) => ({
    id: p.id,
    label: p.name,
    sub: `${fmtStart(p.start_date)} 起 · ${p.plan_weeks} 周`,
    tag: statusTag(p.status),
  }))

  return (
    <div className="coach-shell"><CoachRail view={view} pending={bindRequests.length} onChange={setView} /><div className="coach-main">
    {view === 'editor' && <div style={{ position: 'relative', height: '100vh' }}>
      <PlanEditor
        key={planId || `empty-${studentId}`}
        initialWeeks={loaded?.weeks ?? []}
        weeksCount={loaded?.weeksCount ?? 0}
        studentName={studentName}
        studentId={studentId}
        onboardingProfile={onboarding}
        planName={loaded?.plan.name ?? '（暂无计划）'}
        planStartDate={loaded?.plan.start_date}
        planStatus={loaded?.plan.status}
        initialPublished={loaded?.plan.status === 'published'}
        onPublish={loaded ? async () => {
          const updated = await publishPlan(loaded.plan.id)
          // Reflect the now-live status in the parent-owned list + loaded plan, so the plan
          // switcher's「草稿/已发布」tag can't contradict the editor — no UI shows「草稿」for a
          // plan the student is already seeing. (publishPlan returns the updated plan.)
          setPlans((prev) => prev.map((p) => (p.id === updated.id ? updated : p)))
          setLoaded((prev) => (prev && prev.plan.id === updated.id ? { ...prev, plan: { ...prev.plan, ...updated } } : prev))
        } : undefined}
        onSave={loaded ? async (weeks, importStart, markPastAsAssumedComplete, onProgress) => {
          const reconcileOptions = {
            published: loaded.plan.status === 'published',
            catalog: catalog ?? undefined,
          }
          const result = importStart
            ? await reconcileImportedPlan(loaded.plan.id, weeks, importStart, onProgress, reconcileOptions)
            : await reconcilePlan(loaded.plan.id, weeks, onProgress, reconcileOptions)
          if (importStart && markPastAsAssumedComplete) {
            // The plan itself is already reconciled at this point. History
            // marking rides a backend endpoint that may not be deployed yet
            // (feat/043-plan-import-backend); failing the whole save here would
            // put the editor in a permanent retry loop over an optional extra.
            try {
              await markImportedHistory(loaded.plan.id)
            } catch {
              window.alert('计划已导入并保存，但过去训练的「推定完成」补记未成功。稍后重新导入同一份表格即可补上（已有真实打卡的天不会重复）。')
            }
          }
          if (result.planStartDate && result.planEndDate && result.planWeeks != null) {
            const calendar = {
              start_date: result.planStartDate,
              end_date: result.planEndDate,
              plan_weeks: result.planWeeks,
            }
            // The editor remains mounted after an import/date shift. Update the
            // parent-owned plan too, otherwise the next shift/undo would derive
            // from stale metadata even though the backend already accepted it.
            setPlans((prev) => prev.map((plan) => (
              plan.id === loaded.plan.id ? { ...plan, ...calendar } : plan
            )))
            setLoaded((prev) => (
              prev && prev.plan.id === loaded.plan.id
                ? { ...prev, plan: { ...prev.plan, ...calendar }, weeksCount: calendar.plan_weeks }
                : prev
            ))
          }
          return result
        } : undefined}
        onRename={loaded ? async (name) => {
          const updated = await patchPlan(loaded.plan.id, { name })
          // Keep the switcher list + the loaded plan in sync so the new name shows everywhere.
          setPlans((prev) => prev.map((p) => (p.id === updated.id ? updated : p)))
          setLoaded((prev) => (prev && prev.plan.id === updated.id ? { ...prev, plan: { ...prev.plan, ...updated } } : prev))
        } : undefined}
        onChangeStartDate={loaded ? async (startDate) => {
          if (loaded.plan.status !== 'draft') throw new Error('PLAN_NOT_DRAFT')
          const updated = await patchPlan(loaded.plan.id, { start_date: startDate })
          setPlans((prev) => prev.map((plan) => plan.id === updated.id ? updated : plan))
          setLoaded((prev) => prev && prev.plan.id === updated.id
            ? { ...prev, plan: { ...prev.plan, ...updated } }
            : prev)
        } : undefined}
        onChangePlanWeeks={loaded ? async (planWeeks) => {
          if (loaded.plan.status !== 'draft') throw new Error('PLAN_NOT_DRAFT')
          await resizeServerPlanWeeks(loaded.plan.id, planWeeks)
          setPlans((prev) => prev.map((plan) => plan.id === loaded.plan.id ? { ...plan, plan_weeks: planWeeks } : plan))
          setLoaded((prev) => prev && prev.plan.id === loaded.plan.id
            ? {
                ...prev,
                plan: {
                  ...prev.plan,
                  plan_weeks: planWeeks,
                  days: prev.plan.days.filter((day) => day.week_number <= planWeeks),
                },
                weeksCount: planWeeks,
              }
            : prev)
        } : undefined}
        onRenameStudent={studentId ? async (name) => {
          const updated = await renameCoachStudent(studentId, name)
          setStudents((prev) => prev.map((student) => (
            student.id === updated.id ? { ...student, display_name: updated.display_name } : student
          )))
        } : undefined}
        exerciseIndex={index}
        onCreateExercise={handleCreateExercise}
        students={studentOpts}
        currentStudentId={studentId}
        onSwitchStudent={switchStudent}
        plans={planOpts}
        currentPlanId={planId}
        onSwitchPlan={switchPlan}
        onNewPlan={newPlan}
        onDeleteCurrentDraft={loaded?.plan.status === 'draft' ? () => { setDeleteError(''); setDeleteOpen(true) } : undefined}
        onMarkComplete={loaded?.plan.status === 'published' ? () => { setCompleteError(''); setCompleteOpen(true) } : undefined}
        onBackfillHistory={loaded && loaded.plan.status !== 'draft' && loaded.plan.start_date < todayISO()
          ? () => { setBackfillError(''); setBackfillOpen(true) }
          : undefined}
        onLogout={onLogout}
      />
      {!loaded && (
        <div style={{ position: 'absolute', inset: '120px 0 0', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-start', paddingTop: 80, pointerEvents: 'none' }}>
          <div style={{ color: 'var(--fg-secondary)', marginBottom: 14 }}>{studentName} 暂无计划</div>
          <button onClick={newPlan} style={{ ...btn, pointerEvents: 'auto' }}>＋ 新建计划</button>
        </div>
      )}
      <BackfillHistoryDialog
        open={backfillOpen && !!loaded}
        name={loaded?.plan.name ?? ''}
        weeks={loaded?.plan.plan_weeks ?? 0}
        busy={backfilling}
        error={backfillError}
        onClose={() => { if (!backfilling) setBackfillOpen(false) }}
        onConfirm={() => { void backfillHistory() }}
      />
      <NewPlanDialog open={newPlanOpen} studentName={studentName} onClose={() => setNewPlanOpen(false)} onCreate={createNewPlan} />
      <DeletePlanDialog
        open={deleteOpen && loaded?.plan.status === 'draft'}
        name={loaded?.plan.name ?? ''}
        weeks={loaded?.plan.plan_weeks ?? 0}
        trainingDays={loaded?.plan.days.length ?? 0}
        deleting={deleting}
        error={deleteError}
        onClose={() => { if (!deleting) setDeleteOpen(false) }}
        onDelete={() => { void deleteCurrentPlan() }}
      />
      <CompletePlanDialog
        open={completeOpen && loaded?.plan.status === 'published'}
        name={loaded?.plan.name ?? ''}
        weeks={loaded?.plan.plan_weeks ?? 0}
        completing={completing}
        error={completeError}
        onClose={() => { if (!completing) setCompleteOpen(false) }}
        onComplete={() => { void markCurrentComplete() }}
      />
    </div>}
    {view === 'catalog' && <CatalogPage
      exerciseList={exerciseList}
      catalog={catalog}
      index={index}
      onCreateExercise={handleCreateExercise}
      onUseExercise={() => setView('editor')}
    />}
    {view === 'board' && <StudentBoard students={students} />}
    {view === 'videos' && <VideosPage students={students} studentId={studentId} onStudent={(id) => { void switchStudent(id) }} />}
    {view === 'requests' && <RequestsPage requests={bindRequests} onRequestsChanged={setBindRequests} onAccepted={refreshStudentsAfterAccept} />}
    </div></div>
  )
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ height: '100vh', background: 'var(--bg)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
      {children}
    </div>
  )
}
const btn: React.CSSProperties = {
  background: '#fff', color: '#000', border: 'none', borderRadius: 'var(--r-md)', padding: '9px 16px', fontWeight: 600, fontSize: 13, cursor: 'pointer',
}
