import { useEffect, useState } from 'react'
import type { AuthUser, CoachStudent, PlanResponse, PlanWithChildren } from '../../api/types'
import { getCoachStudents, getStudentPlans, getPlan, publishPlan, createPlan } from '../../api/plans'
import { listExercises } from '../../api/exercises'
import { ApiException } from '../../api/client'
import { mapPlanToWeeks, type Catalog } from '../plan-editor/mapping'
import { PlanEditor } from '../plan-editor/PlanEditor'
import type { Week } from '../plan-editor/types'

interface Props { user: AuthUser; onLogout: () => void }

type Loaded = { plan: PlanWithChildren; weeks: Week[]; studentName: string }

function fmtDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function PlanWorkspace({ user, onLogout }: Props) {
  const [catalog, setCatalog] = useState<Catalog | null>(null)
  const [students, setStudents] = useState<CoachStudent[] | null>(null)
  const [student, setStudent] = useState<CoachStudent | null>(null)
  const [plans, setPlans] = useState<PlanResponse[] | null>(null)
  const [loaded, setLoaded] = useState<Loaded | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    Promise.all([listExercises(), getCoachStudents()])
      .then(([ex, st]) => {
        const cat: Catalog = new Map(ex.map((e) => [e.id, { name: e.name, custom: e.created_by_coach_id != null }]))
        setCatalog(cat); setStudents(st)
      })
      .catch((e) => setError(e instanceof ApiException ? `加载失败（${e.code}）` : '无法连接后端'))
  }, [])

  const openStudent = async (s: CoachStudent) => {
    setStudent(s); setPlans(null); setError('')
    try { setPlans(await getStudentPlans(s.id)) }
    catch (e) { setError(e instanceof ApiException ? `读取计划失败（${e.code}）` : '读取计划失败') }
  }

  const openPlan = async (p: PlanResponse) => {
    if (!catalog || !student) return
    setBusy(true); setError('')
    try {
      const full = await getPlan(p.id)
      setLoaded({ plan: full, weeks: mapPlanToWeeks(full, catalog), studentName: student.display_name })
    } catch (e) {
      setError(e instanceof ApiException ? `打开计划失败（${e.code}）` : '打开计划失败')
    } finally { setBusy(false) }
  }

  const newPlan = async () => {
    if (!student) return
    setBusy(true); setError('')
    try {
      const weeks = 12
      const start = new Date()
      const end = new Date(); end.setDate(end.getDate() + weeks * 7 - 1)
      const created = await createPlan({
        trainee_id: student.id, name: '新计划', start_date: fmtDate(start), end_date: fmtDate(end),
        plan_weeks: weeks, source: 'coach', kind: 'regular',
      })
      await openPlan(created)
    } catch (e) {
      setError(e instanceof ApiException ? `新建失败（${e.code}）` : '新建失败'); setBusy(false)
    }
  }

  // ---- editor view ----
  if (loaded) {
    return (
      <div style={{ position: 'relative', height: '100vh' }}>
        <PlanEditor
          key={loaded.plan.id}
          initialWeeks={loaded.weeks}
          weeksCount={loaded.plan.plan_weeks}
          studentName={loaded.studentName}
          planName={loaded.plan.name}
          initialPublished={loaded.plan.status === 'published'}
          onPublish={async () => { await publishPlan(loaded.plan.id) }}
        />
        <button onClick={() => setLoaded(null)} style={backBtn}>← 返回</button>
      </div>
    )
  }

  // ---- picker view ----
  return (
    <div style={{ height: '100vh', background: 'var(--bg)', color: '#fff', display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, height: 48, padding: '0 16px', background: '#000', borderBottom: '1px solid var(--border)' }}>
        <span style={{ fontWeight: 900, fontSize: 15 }}>MeetPR</span>
        <span className="t-mono-label" style={{ color: 'var(--fg-tertiary)' }}>COACH / 计划编写</span>
        <span style={{ flex: 1 }} />
        <span style={{ color: 'var(--fg-tertiary)', fontSize: 12 }}>{user.phone}</span>
        <span onClick={onLogout} style={{ cursor: 'pointer', color: 'var(--fg-secondary)', fontSize: 12, padding: '4px 8px' }}>退出</span>
      </div>

      <div style={{ flex: 1, overflow: 'auto', padding: 24, maxWidth: 760, margin: '0 auto', width: '100%', boxSizing: 'border-box' }}>
        {error && <div style={{ color: 'var(--brand-red)', marginBottom: 16 }}>{error}</div>}

        {!student && (
          <>
            <h2 style={{ fontSize: 18, margin: '4px 0 16px' }}>选择学员</h2>
            {!students && <div style={{ color: 'var(--fg-tertiary)' }}>加载中…</div>}
            {students?.length === 0 && <div style={{ color: 'var(--fg-tertiary)' }}>暂无绑定学员</div>}
            <div style={{ display: 'grid', gap: 8 }}>
              {students?.map((s) => (
                <div key={s.id} onClick={() => openStudent(s)} style={rowCard}>
                  <span style={{ fontWeight: 600 }}>{s.display_name}</span>
                  {s.status === 'in_evaluation' && <span style={{ marginLeft: 10, fontSize: 11, color: 'var(--amber)' }}>评估期</span>}
                  <span style={{ flex: 1 }} />
                  <span style={{ color: 'var(--fg-tertiary)' }}>›</span>
                </div>
              ))}
            </div>
          </>
        )}

        {student && (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '4px 0 16px' }}>
              <span onClick={() => { setStudent(null); setPlans(null) }} style={{ cursor: 'pointer', color: 'var(--fg-secondary)' }}>←</span>
              <h2 style={{ fontSize: 18, margin: 0 }}>{student.display_name} · 计划</h2>
              <span style={{ flex: 1 }} />
              <button onClick={newPlan} disabled={busy} style={primaryBtn}>＋ 新建计划</button>
            </div>
            {!plans && <div style={{ color: 'var(--fg-tertiary)' }}>加载中…</div>}
            {plans?.length === 0 && <div style={{ color: 'var(--fg-tertiary)' }}>该学员暂无计划，点「新建计划」开始</div>}
            <div style={{ display: 'grid', gap: 8 }}>
              {plans?.map((p) => (
                <div key={p.id} onClick={() => openPlan(p)} style={rowCard}>
                  <span style={{ fontWeight: 600 }}>{p.name}</span>
                  <span style={{ marginLeft: 10, fontSize: 11, color: p.status === 'published' ? 'var(--green)' : 'var(--fg-tertiary)' }}>
                    {p.status === 'published' ? '已发布' : p.status === 'draft' ? '草稿' : p.status}
                  </span>
                  <span style={{ flex: 1 }} />
                  <span style={{ color: 'var(--fg-tertiary)', fontSize: 12 }}>{p.plan_weeks} 周 · {p.start_date}</span>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  )
}

const rowCard: React.CSSProperties = {
  display: 'flex', alignItems: 'center', padding: '14px 16px', background: 'var(--surface-1)',
  border: '1px solid var(--border)', borderRadius: 'var(--r-md)', cursor: 'pointer',
}
const primaryBtn: React.CSSProperties = {
  background: '#fff', color: '#000', border: 'none', borderRadius: 'var(--r-md)', padding: '8px 14px', fontWeight: 600, fontSize: 13, cursor: 'pointer',
}
const backBtn: React.CSSProperties = {
  position: 'absolute', left: 12, bottom: 12, zIndex: 70, background: 'var(--surface-2)', color: '#fff',
  border: '1px solid var(--border-strong)', borderRadius: 'var(--r-md)', padding: '7px 12px', fontSize: 12, cursor: 'pointer',
}
