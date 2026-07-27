import { useEffect, useMemo, useState } from 'react'
import type {
  AuthUser,
  CoachStudent,
  ExerciseResponse,
  ExerciseStatsDetail,
  StudentOnboardingProfile,
} from '../../api/types'
import { getExerciseStats } from '../../api/coach'
import { kg, shortDate } from './WorkspaceCommon'

export type CoachView = 'board' | 'editor' | 'messages' | 'catalog' | 'videos' | 'requests'

type Badge = { count: number; tone: 'danger' | 'muted' }

const NAV_ITEMS: { id: CoachView; label: string }[] = [
  { id: 'board', label: '总览' },
  { id: 'editor', label: '计划编排' },
  { id: 'messages', label: '消息' },
  { id: 'catalog', label: '动作库' },
  { id: 'videos', label: '训练视频' },
  { id: 'requests', label: '学员申请' },
]

// Only shortcuts that actually work today may appear here; the full keyboard
// layer (⌘K, J/K, Tab-grid…) lands on a later card and fills these back in.
const VIEW_SHORTCUTS: Record<CoachView, string> = {
  board: '',
  editor: '⌘C 复制 · ⌘V 粘贴 · ⌘Z 撤销',
  messages: '↵ 发送',
  catalog: '',
  videos: '⌘↵ 发送反馈',
  requests: '',
}

const VIEW_CRUMBS: Record<CoachView, string> = {
  board: '总览',
  editor: '计划编排',
  messages: '消息',
  catalog: '动作库',
  videos: '训练视频',
  requests: '学员申请',
}

export interface CoachShellProps {
  children: React.ReactNode
  view: CoachView
  onChange: (view: CoachView) => void
  me: AuthUser
  students: CoachStudent[]
  studentId: string
  onboarding: StudentOnboardingProfile | null | undefined
  exercises: ExerciseResponse[]
  pendingStudents: CoachStudent[] | null
  unreadCount: number
  requestCount: number
  videoCount: number | null
  onPickPending: (studentId: string) => void
  lastSyncedAt: Date | null
}

export function CoachShell({
  children,
  view,
  onChange,
  me,
  students,
  studentId,
  onboarding,
  exercises,
  pendingStudents,
  unreadCount,
  requestCount,
  videoCount,
  onPickPending,
  lastSyncedAt,
}: CoachShellProps) {
  const selectedStudent = students.find((student) => student.id === studentId) ?? null
  const pendingRows = pendingStudents ?? []
  const pendingCount = pendingStudents?.length
  const exerciseCount = exercises.length
  const badges = useMemo<Partial<Record<CoachView, Badge>>>(() => ({
    messages: { count: unreadCount, tone: 'danger' },
    requests: { count: requestCount, tone: 'danger' },
    catalog: { count: exerciseCount, tone: 'muted' },
    ...(videoCount == null ? {} : { videos: { count: videoCount, tone: 'muted' as const } }),
  }), [exerciseCount, requestCount, unreadCount, videoCount])
  const [toast, setToast] = useState('')

  useEffect(() => {
    let timer = 0
    const onToast = (event: Event) => {
      const message = (event as CustomEvent<string>).detail
      if (!message) return
      window.clearTimeout(timer)
      setToast(message)
      timer = window.setTimeout(() => setToast(''), 2200)
    }
    window.addEventListener('meetpr:toast', onToast)
    return () => {
      window.clearTimeout(timer)
      window.removeEventListener('meetpr:toast', onToast)
    }
  }, [])

  return (
    <div className="coach-shell">
      <CoachTopBar view={view} me={me} />
      <div className="coach-shell-body">
        <CoachNavigation
          view={view}
          badges={badges}
          pendingStudents={pendingRows}
          pendingCount={pendingCount}
          onChange={onChange}
          onPickPending={onPickPending}
          lastSyncedAt={lastSyncedAt}
        />
        <main className="coach-main">{children}</main>
        {view !== 'messages' && (
          <StudentContextPanel
            student={selectedStudent}
            onboarding={onboarding}
            exercises={exercises}
          />
        )}
      </div>
      <footer className="coach-statusbar">
        <span>待排 {pendingCount ?? '—'}</span>
        <span>未读 {unreadCount}</span>
        <span className="coach-statusbar-shortcuts">{VIEW_SHORTCUTS[view]}</span>
      </footer>
      {toast && <div className="coach-toast" role="status">{toast}</div>}
    </div>
  )
}

function CoachTopBar({ view, me }: { view: CoachView; me: AuthUser }) {
  // Login has no display name today; switch to GET /me when the backend exposes it.
  const coachName = me.display_name?.trim() || '教'
  return (
    <header className="coach-topbar">
      <span className="coach-mark">M</span>
      <span className="coach-breadcrumb">COACH / {VIEW_CRUMBS[view]}</span>
      <button className="coach-search-shell" type="button" aria-label="打开命令面板" disabled>
        <span className="coach-search-icon" aria-hidden="true" />
        <span>跳转学员、动作、计划…</span>
        <kbd>⌘K</kbd>
      </button>
      <span className="coach-avatar" title={coachName}>{coachName.slice(0, 1)}</span>
    </header>
  )
}

function CoachNavigation({
  view,
  badges,
  pendingStudents,
  pendingCount,
  onChange,
  onPickPending,
  lastSyncedAt,
}: {
  view: CoachView
  badges: Partial<Record<CoachView, Badge>>
  pendingStudents: CoachStudent[]
  pendingCount: number | undefined
  onChange: (view: CoachView) => void
  onPickPending: (studentId: string) => void
  lastSyncedAt: Date | null
}) {
  const week = weekRange(new Date())
  return (
    <nav className="coach-navigation" aria-label="教练工作区">
      <span className="coach-nav-heading">工作区</span>
      {NAV_ITEMS.map((item) => {
        const badge = badges[item.id]
        return (
          <button
            key={item.id}
            type="button"
            aria-current={view === item.id ? 'page' : undefined}
            className={`coach-nav-item${view === item.id ? ' active' : ''}`}
            onClick={() => onChange(item.id)}
          >
            <span>{item.label}</span>
            {badge && badge.count > 0 && (
              <span className={`coach-nav-badge ${badge.tone}`}>{badge.count}</span>
            )}
          </button>
        )
      })}
      <span className="coach-nav-heading coach-queue-heading">待排队列 · {pendingCount ?? '—'}</span>
      {pendingStudents.slice(0, 4).map((student) => (
        <button
          key={student.id}
          type="button"
          className="coach-queue-item"
          onClick={() => onPickPending(student.id)}
        >
          {student.display_name}
        </button>
      ))}
      <span className="coach-nav-footer">
        本周 {week}
        <br />
        已同步 {lastSyncedAt ? formatTime(lastSyncedAt) : '—'}
      </span>
    </nav>
  )
}

function StudentContextPanel({
  student,
  onboarding,
  exercises,
}: {
  student: CoachStudent | null
  onboarding: StudentOnboardingProfile | null | undefined
  exercises: ExerciseResponse[]
}) {
  const squat = useMemo(() => (
    exercises.find((exercise) => exercise.main_lift_family === 'squat' && exercise.is_competition_lift)
    ?? exercises.find((exercise) => exercise.main_lift_family === 'squat')
    ?? null
  ), [exercises])
  const [detail, setDetail] = useState<ExerciseStatsDetail | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    let alive = true
    setDetail(null)
    setLoading(false)
    if (!student || !squat) return () => { alive = false }
    setLoading(true)
    void getExerciseStats(student.id, squat.id)
      .then((next) => { if (alive) setDetail(next) })
      .catch(() => { if (alive) setDetail(null) })
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [squat, student])

  const latestSession = detail?.recent_sessions[0]
  const latestTopWeight = latestSession?.sets.reduce<number | null>((best, set) => {
    const value = Number(set.weight_kg)
    if (!Number.isFinite(value)) return best
    return best == null || value > best ? value : best
  }, null) ?? null
  const e1rm = detail?.e1rm ? Number(detail.e1rm.value) : null
  const topPercent = latestTopWeight != null && e1rm && Number.isFinite(e1rm)
    ? Math.round(latestTopWeight / e1rm * 100)
    : null
  const meta = onboardingMeta(onboarding)

  return (
    <aside className="coach-context" aria-label="学员上下文">
      <div className="coach-context-sticky">
        <div className="coach-context-student">
          <span className="coach-student-initial">{student?.display_name.slice(0, 1) || '—'}</span>
          <span>
            <b>{student?.display_name || '暂无学员'}</b>
            <small>{meta}</small>
          </span>
        </div>
        <div className="coach-context-tabs" role="tablist" aria-label="上下文">
          <button type="button" role="tab" aria-selected="true">动作</button>
          <button type="button" role="tab" aria-selected="false" disabled>消息</button>
          <button type="button" role="tab" aria-selected="false" disabled>汇总</button>
        </div>
      </div>
      <div className="coach-context-content">
        <div className="coach-metric-strip">
          <ContextMetric label="e1RM · 后端滚动值" value={detail?.e1rm ? kg(detail.e1rm.value) : '—'} />
          <ContextMetric label="登记 1RM" value={kg(detail?.one_rm_reference)} />
          <ContextMetric
            label="最近顶组占比"
            value={topPercent == null ? '—' : `${topPercent}%`}
            tone={topPercent == null ? undefined : topPercent >= 95 ? 'bad' : topPercent >= 90 ? 'warn' : 'ok'}
          />
        </div>
        <div className="coach-context-exercise">
          <span>{squat?.name || '深蹲主项'}</span>
          {latestSession && <small>{latestSession.sets.length} 组</small>}
        </div>
        <span className="coach-context-label">
          最近训练历史{loading ? ' · 加载中' : detail ? ` · ${detail.recent_sessions.length} 次` : ''}
        </span>
        {!student && <div className="coach-context-empty">接受学员申请后显示训练上下文</div>}
        {student && !loading && detail?.recent_sessions.length === 0 && (
          <div className="coach-context-empty">暂无深蹲训练记录</div>
        )}
        {detail?.recent_sessions.slice(0, 4).map((session) => (
          <section className="coach-history-card" key={session.date}>
            <header>
              <b>{shortDate(session.date)}</b>
              <span>{session.sets.length} 组</span>
            </header>
            {session.sets.map((set) => (
              <div className="coach-history-set" key={set.set_index}>
                <span>{set.set_index}</span>
                <b>{kg(set.weight_kg)}kg × {set.reps}</b>
                <span>{set.rpe ? `RPE ${Number(set.rpe)}` : '—'}</span>
                <span className={set.failed ? 'bad' : set.completed ? 'ok' : ''}>
                  {set.failed ? '力竭' : set.completed ? '✓' : '—'}
                </span>
              </div>
            ))}
          </section>
        ))}
      </div>
    </aside>
  )
}

function ContextMetric({ label, value, tone }: { label: string; value: string; tone?: 'ok' | 'warn' | 'bad' }) {
  return (
    <span>
      <b className={tone}>{value}</b>
      <small>{label}</small>
    </span>
  )
}

function onboardingMeta(profile: StudentOnboardingProfile | null | undefined): string {
  if (profile === undefined) return '资料加载中…'
  if (!profile) return '暂无 onboarding 资料'
  const weightClass = profile.target_weight_class?.trim()
  const classLabel = weightClass
    ? (weightClass.endsWith('级') ? weightClass : `${weightClass} 级`)
    : null
  const weight = profile.weight_kg ? `${kg(profile.weight_kg)}kg` : null
  const training = profile.training_years != null ? `${profile.training_years} 年训练` : null
  return [classLabel, weight, training].filter(Boolean).join(' · ') || '资料待补充'
}

function weekRange(date: Date): string {
  const monday = new Date(date)
  const day = monday.getDay() || 7
  monday.setDate(monday.getDate() - day + 1)
  const sunday = new Date(monday)
  sunday.setDate(monday.getDate() + 6)
  return `${formatMonthDay(monday)} — ${formatMonthDay(sunday)}`
}

function formatMonthDay(date: Date): string {
  return `${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

function formatTime(date: Date): string {
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
}
