import { useCallback, useEffect, useState } from 'react'
import type { CoachStudent, PlanResponse } from '../../api/types'
import { getCoachStudents, getStudentPlans, getPlan, publishPlan, createPlan } from '../../api/plans'
import { listExercises, createCustomExercise } from '../../api/exercises'
import { ApiException } from '../../api/client'
import { mapPlanToWeeks, type Catalog } from '../plan-editor/mapping'
import { ExerciseIndex } from '../plan-editor/exerciseIndex'
import { reconcilePlan, reconcileImportedPlan } from '../plan-editor/reconcile'
import { PlanEditor } from '../plan-editor/PlanEditor'
import type { Week } from '../plan-editor/types'

interface Props { onLogout: () => void }
type Loaded = { plan: PlanResponse; weeks: Week[]; weeksCount: number }

function fmtDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function PlanWorkspace({ onLogout }: Props) {
  const [catalog, setCatalog] = useState<Catalog | null>(null)
  const [index, setIndex] = useState<ExerciseIndex | null>(null)
  const [students, setStudents] = useState<CoachStudent[]>([])
  const [studentId, setStudentId] = useState<string>('')
  const [plans, setPlans] = useState<PlanResponse[]>([])
  const [planId, setPlanId] = useState<string>('')
  const [loaded, setLoaded] = useState<Loaded | null>(null)
  const [error, setError] = useState('')
  const [booting, setBooting] = useState(true)

  const errText = (e: unknown, fb: string) => (e instanceof ApiException ? `${fb}（${e.code}）` : fb)

  const loadPlan = useCallback(async (id: string, cat: Catalog) => {
    const full = await getPlan(id)
    // Set loaded + planId together (after the fetch) so the keyed PlanEditor
    // remounts once with the real weeks — not an empty mount on an early key change.
    setLoaded({ plan: full, weeks: mapPlanToWeeks(full, cat), weeksCount: full.plan_weeks })
    setPlanId(id)
  }, [])

  const loadStudent = useCallback(async (id: string, cat: Catalog) => {
    setStudentId(id); setLoaded(null); setPlanId('')
    const list = await getStudentPlans(id)
    setPlans(list)
    if (list.length > 0) await loadPlan(list[0].id, cat)
  }, [loadPlan])

  // boot: catalog + roster + first student + first plan
  useEffect(() => {
    (async () => {
      try {
        const [ex, st] = await Promise.all([listExercises(), getCoachStudents()])
        const cat: Catalog = new Map(ex.map((e) => [e.id, { name: e.name, custom: e.created_by_coach_id != null }]))
        setCatalog(cat); setIndex(new ExerciseIndex(ex)); setStudents(st)
        if (st.length > 0) await loadStudent(st[0].id, cat)
      } catch (e) {
        setError(errText(e, '无法连接后端'))
      } finally { setBooting(false) }
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const switchStudent = (id: string) => {
    if (!catalog || id === studentId) return
    loadStudent(id, catalog).catch((e) => setError(errText(e, '切换学员失败')))
  }
  const switchPlan = (id: string) => {
    if (!catalog || id === planId) return
    loadPlan(id, catalog).catch((e) => setError(errText(e, '打开计划失败')))
  }
  const newPlan = async () => {
    if (!catalog || !studentId) return
    try {
      const weeks = 12
      const start = new Date(); const end = new Date(); end.setDate(end.getDate() + weeks * 7 - 1)
      const created = await createPlan({
        trainee_id: studentId, name: '新计划', start_date: fmtDate(start), end_date: fmtDate(end),
        plan_weeks: weeks, source: 'coach', kind: 'regular',
      })
      setPlans((prev) => [created, ...prev])
      await loadPlan(created.id, catalog)
    } catch (e) { setError(errText(e, '新建失败')) }
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
    return (
      <Centered>
        <div style={{ color: 'var(--fg-secondary)', marginBottom: 8 }}>该教练账号暂无绑定学员</div>
        <button onClick={onLogout} style={btn}>退出</button>
      </Centered>
    )
  }

  const studentName = students.find((s) => s.id === studentId)?.display_name ?? ''
  const studentOpts = students.map((s) => ({ id: s.id, label: s.display_name, tag: s.status === 'in_evaluation' ? '评估期' : undefined }))
  const planOpts = plans.map((p) => ({ id: p.id, label: p.name, tag: p.status === 'published' ? '已发布' : '草稿' }))

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
        onSave={loaded ? async (weeks, importStart) => {
          if (importStart) await reconcileImportedPlan(loaded.plan.id, weeks, importStart)
          else await reconcilePlan(loaded.plan.id, weeks)
        } : undefined}
        exerciseIndex={index}
        onCreateExercise={async (name) => {
          const e = await createCustomExercise(name)
          index?.add(e)
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
