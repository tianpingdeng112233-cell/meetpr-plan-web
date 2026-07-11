import { useCallback, useEffect, useRef, useState } from 'react'
import type { CoachStudent, ExerciseResponse, PlanResponse } from '../../api/types'
import {
  getCoachStudents, getStudentPlans, getPlan, publishPlan, createPlan, patchPlan, getStudentOnboarding,
  markImportedHistory, renameCoachStudent,
} from '../../api/plans'
import { listExercises, createCustomExercise } from '../../api/exercises'
import { ApiException } from '../../api/client'
import { mapPlanToWeeks, type Catalog } from '../plan-editor/mapping'
import { displayExerciseName, ExerciseIndex } from '../plan-editor/exerciseIndex'
import { reconcilePlan, reconcileImportedPlan } from '../plan-editor/reconcile'
import { PlanEditor } from '../plan-editor/PlanEditor'
import { buildWeeks as buildSampleWeeks } from '../plan-editor/sampleData'
import { SamplePreviewBanner } from './SamplePreviewBanner'
import type { Week } from '../plan-editor/types'

interface Props { onLogout: () => void | Promise<void> }
type Loaded = { plan: PlanResponse; weeks: Week[]; weeksCount: number }
const LAST_PLAN_PREFIX = 'mpw.lastPlan.'

function fmtDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function PlanWorkspace({ onLogout }: Props) {
  const [catalog, setCatalog] = useState<Catalog | null>(null)
  const [exerciseList, setExerciseList] = useState<ExerciseResponse[]>([])
  const [index, setIndex] = useState<ExerciseIndex | null>(null)
  const [students, setStudents] = useState<CoachStudent[]>([])
  const [studentId, setStudentId] = useState<string>('')
  const [plans, setPlans] = useState<PlanResponse[]>([])
  const [planId, setPlanId] = useState<string>('')
  const [loaded, setLoaded] = useState<Loaded | null>(null)
  const [error, setError] = useState('')
  const [booting, setBooting] = useState(true)
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
    setStudentId(id); setLoaded(null); setPlanId('')
    try {
      const [list, onboarding] = await Promise.all([
        getStudentPlans(id),
        getStudentOnboarding(id).catch(() => null),
      ])
      if (generation !== loadGeneration.current) return false
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
        const [ex, st] = await Promise.all([listExercises(), getCoachStudents()])
        const cat: Catalog = new Map(ex.map((e) => [e.id, { name: displayExerciseName(e.name), custom: e.created_by_coach_id != null }]))
        setExerciseList(ex); setCatalog(cat); setIndex(new ExerciseIndex(ex)); setStudents(st)
        if (st.length > 0) await loadStudent(st[0].id, cat, ex)
      } catch (e) {
        setError(errText(e, '无法连接后端'))
      } finally { setBooting(false) }
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const switchStudent = async (id: string) => {
    if (!catalog || id === studentId) return
    try {
      await loadStudent(id, catalog)
    } catch (e) {
      setError(errText(e, '切换学员失败'))
    }
  }
  const switchPlan = async (id: string) => {
    if (!catalog || id === planId) return
    try {
      await loadPlan(id, catalog)
    } catch (e) {
      setError(errText(e, '打开计划失败'))
    }
  }
  const newPlan = async () => {
    if (!catalog || !studentId) return
    const generation = ++loadGeneration.current
    const targetStudentId = studentId
    try {
      const weeks = 12
      const start = new Date(); const end = new Date(); end.setDate(end.getDate() + weeks * 7 - 1)
      const created = await createPlan({
        trainee_id: targetStudentId, name: '新计划', start_date: fmtDate(start), end_date: fmtDate(end),
        plan_weeks: weeks, source: 'coach', kind: 'regular',
      })
      if (generation !== loadGeneration.current) return
      setPlans((prev) => [created, ...prev])
      await loadPlan(created.id, catalog, generation)
    } catch (e) {
      if (generation === loadGeneration.current) setError(errText(e, '新建失败'))
    }
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
      <div style={{ position: 'relative', height: '100vh' }}>
        <PlanEditor
          key="sample-preview"
          initialWeeks={sampleWeeks}
          weeksCount={sampleWeeks.length}
          studentName="示例学员"
          planName="示例计划"
          exerciseIndex={index}
          onLogout={onLogout}
        />
        <SamplePreviewBanner onRefresh={() => window.location.reload()} />
      </div>
    )
  }

  const studentName = students.find((s) => s.id === studentId)?.display_name ?? ''
  const studentOpts = students.map((s) => ({ id: s.id, label: s.display_name, tag: s.status === 'in_evaluation' ? '评估期' : undefined }))
  // "M/D 起 · N 周" so same-named plans stay tellable-apart in the switcher.
  const fmtStart = (iso: string) => { const [, m, d] = iso.split('-'); return `${Number(m)}/${Number(d)}` }
  const planOpts = plans.map((p) => ({
    id: p.id,
    label: p.name,
    sub: `${fmtStart(p.start_date)} 起 · ${p.plan_weeks} 周`,
    tag: p.status === 'published' ? '已发布' : '草稿',
  }))

  return (
    <div style={{ position: 'relative', height: '100vh' }}>
      <PlanEditor
        key={planId || `empty-${studentId}`}
        initialWeeks={loaded?.weeks ?? []}
        weeksCount={loaded?.weeksCount ?? 0}
        studentName={studentName}
        planName={loaded?.plan.name ?? '（暂无计划）'}
        planStartDate={loaded?.plan.start_date}
        initialPublished={loaded?.plan.status === 'published'}
        onPublish={loaded ? async () => {
          const updated = await publishPlan(loaded.plan.id)
          // Reflect the now-live status in the parent-owned list + loaded plan, so the plan
          // switcher's「草稿/已发布」tag can't contradict the editor — no UI shows「草稿」for a
          // plan the student is already seeing. (publishPlan returns the updated plan.)
          setPlans((prev) => prev.map((p) => (p.id === updated.id ? updated : p)))
          setLoaded((prev) => (prev && prev.plan.id === updated.id ? { ...prev, plan: updated } : prev))
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
              window.alert('计划已导入并保存，但过去训练的「推定完成」补记未成功（后端暂不支持）。补记功能上线后重新导入即可补上。')
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
          setLoaded((prev) => (prev && prev.plan.id === updated.id ? { ...prev, plan: updated } : prev))
        } : undefined}
        onRenameStudent={studentId ? async (name) => {
          const updated = await renameCoachStudent(studentId, name)
          setStudents((prev) => prev.map((student) => (
            student.id === updated.id ? { ...student, display_name: updated.display_name } : student
          )))
        } : undefined}
        exerciseIndex={index}
        onCreateExercise={async (input) => {
          const e = await createCustomExercise(input)
          const custom = e.created_by_coach_id != null
          setExerciseList((prev) => (prev.some((item) => item.id === e.id) ? prev : [...prev, e]))
          setCatalog((prev) => {
            const next = new Map(prev ?? [])
            next.set(e.id, { name: displayExerciseName(e.name), custom })
            return next
          })
          setIndex((prev) => (prev ? prev.withAdded(e) : new ExerciseIndex([e])))
          return { id: e.id, name: e.name }
        }}
        students={studentOpts}
        currentStudentId={studentId}
        onSwitchStudent={switchStudent}
        plans={planOpts}
        currentPlanId={planId}
        onSwitchPlan={switchPlan}
        onNewPlan={newPlan}
        onLogout={onLogout}
      />
      {!loaded && (
        <div style={{ position: 'absolute', inset: '120px 0 0', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-start', paddingTop: 80, pointerEvents: 'none' }}>
          <div style={{ color: 'var(--fg-secondary)', marginBottom: 14 }}>{studentName} 暂无计划</div>
          <button onClick={newPlan} style={{ ...btn, pointerEvents: 'auto' }}>＋ 新建计划</button>
        </div>
      )}
    </div>
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
