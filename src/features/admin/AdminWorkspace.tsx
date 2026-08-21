import { useEffect, useMemo, useRef, useState } from 'react'
import {
  getAdminBindings,
  getAdminExerciseUsage,
  getAdminOverview,
  getAdminPlan,
  getAdminPlans,
  getAdminUser,
  getAdminUsers,
  type AdminBinding,
  type AdminBindingStatus,
  type AdminExerciseUsage,
  type AdminManagedRole,
  type AdminPlan,
  type AdminPlanExercise,
  type AdminPlanWithChildren,
  type AdminUser,
  type AdminUserDetailResponse,
} from '../../api/admin'
import type { PlanStatus } from '../../api/types'
import { fmt, resolveLocale, S } from '../../i18n/strings'
import { EmptyState, ErrorState, SkeletonRows, useDelayedLoading } from '../../components/states'

interface Props { onLogout: () => void }

type AdminPage = 'overview' | 'users' | 'userDetail' | 'bindings' | 'plans' | 'planDetail' | 'exercises'
type RootPage = 'overview' | 'users' | 'bindings' | 'plans' | 'exercises'
type ResourceState<T> = { data: T | null; loading: boolean; error: boolean; retry: () => void }
type BadgeSpec = { label: string; color: string; background: string; border: string; weight?: number }

export const ADMIN_WRITE_ENABLED = false

const pageTitle = (page: RootPage) => S.admin.page[page]

function useResource<T>(key: string | null, load: () => Promise<T>): ResourceState<T> {
  const loader = useRef(load)
  loader.current = load
  const [attempt, setAttempt] = useState(0)
  const [state, setState] = useState<Omit<ResourceState<T>, 'retry'>>({
    data: null, loading: false, error: false,
  })

  useEffect(() => {
    if (!key) return
    let cancelled = false
    setState({ data: null, loading: true, error: false })
    void loader.current().then(
      (data) => { if (!cancelled) setState({ data, loading: false, error: false }) },
      () => { if (!cancelled) setState({ data: null, loading: false, error: true }) },
    )
    return () => { cancelled = true }
  }, [key, attempt])

  const visibleSkeleton = useDelayedLoading(state.loading)
  return { ...state, loading: state.loading || visibleSkeleton, retry: () => setAttempt((value) => value + 1) }
}

function roleBadge(role: AdminManagedRole): BadgeSpec {
  if (role === 'admin') {
    // Mirrors the rail ADMIN chip treatment; not part of the 3-role design set.
    return { label: S.admin.role.admin, color: '#E5221E', background: 'rgba(229,34,30,0.12)', border: 'rgba(229,34,30,0.35)', weight: 700 }
  }
  if (role === 'coach') {
    return { label: S.admin.role.coach, color: '#E5221E', background: 'rgba(229,34,30,0.12)', border: 'rgba(229,34,30,0.32)' }
  }
  if (role === 'coached_student') {
    return { label: S.admin.role.coachedStudent, color: '#FFFFFF', background: '#1F1F1F', border: '#3A3A3A' }
  }
  return { label: S.admin.role.selfTrain, color: '#B5B5B5', background: 'transparent', border: '#3A3A3A' }
}

function bindBadge(status: AdminBindingStatus): BadgeSpec {
  if (status === 'accepted') {
    return { label: S.admin.binding.accepted, color: '#1FB358', background: 'rgba(31,179,88,0.14)', border: 'rgba(31,179,88,0.38)', weight: 600 }
  }
  if (status === 'pending') {
    return { label: S.admin.binding.pending, color: '#E0A810', background: 'rgba(224,168,16,0.12)', border: 'rgba(224,168,16,0.3)', weight: 500 }
  }
  const labels: Record<Exclude<AdminBindingStatus, 'accepted' | 'pending'>, string> = {
    rejected: S.admin.binding.rejected, expired: S.admin.binding.expired, cancelled: S.admin.binding.cancelled,
  }
  return { label: labels[status], color: '#737373', background: 'transparent', border: '#262626', weight: 400 }
}

function planBadge(status: PlanStatus): BadgeSpec {
  if (status === 'published') {
    return { label: S.admin.planStatus.published, color: '#1FB358', background: 'rgba(31,179,88,0.14)', border: 'rgba(31,179,88,0.38)' }
  }
  if (status === 'draft') {
    return { label: S.admin.planStatus.draft, color: '#B5B5B5', background: 'transparent', border: '#3A3A3A' }
  }
  if (status === 'paused') {
    return { label: S.admin.planStatus.paused, color: '#E0A810', background: 'rgba(224,168,16,0.12)', border: 'rgba(224,168,16,0.3)' }
  }
  return { label: S.admin.planStatus.completed, color: '#737373', background: '#161616', border: '#262626' }
}

function Badge({ spec }: { spec: BadgeSpec }) {
  return (
    <span
      className="inline-flex whitespace-nowrap rounded-[4px] border px-2 py-0.5 text-[11px] leading-[15px]"
      style={{ color: spec.color, background: spec.background, borderColor: spec.border, fontWeight: spec.weight }}
    >
      {spec.label}
    </span>
  )
}

type IconName = 'overview' | 'users' | 'bindings' | 'plans' | 'exercises' | 'logout' | 'back' | 'chevron' | 'search' | 'arrow' | 'lock'

function Icon({ name, size = 20 }: { name: IconName; size?: number }) {
  const common = { width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.75, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const }
  if (name === 'overview') return <svg {...common}><rect x="3" y="3" width="7" height="9" rx="1"/><rect x="14" y="3" width="7" height="5" rx="1"/><rect x="14" y="12" width="7" height="9" rx="1"/><rect x="3" y="16" width="7" height="5" rx="1"/></svg>
  if (name === 'users') return <svg {...common}><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/></svg>
  if (name === 'bindings') return <svg {...common}><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>
  if (name === 'plans') return <svg {...common}><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>
  if (name === 'exercises') return <svg {...common}><path d="M6.5 6.5 17.5 17.5M5 9l4-4M15 19l4-4M3.5 7.5l3-3M17.5 19.5l3-3"/></svg>
  if (name === 'logout') return <svg {...common}><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="m16 17 5-5-5-5M21 12H9"/></svg>
  if (name === 'back') return <svg {...common} strokeWidth="2"><path d="M19 12H5m7 7-7-7 7-7"/></svg>
  if (name === 'chevron') return <svg {...common} strokeWidth="2"><path d="m9 18 6-6-6-6"/></svg>
  if (name === 'search') return <svg {...common} strokeWidth="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
  if (name === 'arrow') return <svg {...common}><path d="M5 12h14m-7-7 7 7-7 7"/></svg>
  return <svg {...common} strokeWidth="2"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
}

function displayName(name: string | null, phone?: string): string {
  return name?.trim() || phone || S.admin.unnamed
}

function dateOnly(value: string | null | undefined): string {
  if (!value) return '—'
  const iso = value.slice(0, 10)
  if (resolveLocale() === 'zh') return iso
  const [year, month, day] = iso.split('-').map(Number)
  return fmt.monthDay(new Date(year, month - 1, day), () => iso)
}

function FilterChips<T extends string>({ options, value, onChange }: { options: Array<[T, string]>; value: T; onChange: (value: T) => void }) {
  return (
    <div className="flex gap-0.5 rounded-[6px] border border-border p-0.5">
      {options.map(([key, label]) => (
        <button
          type="button"
          key={key}
          onClick={() => onChange(key)}
          className={`whitespace-nowrap rounded-[4px] px-3 py-[5px] text-[12.5px] ${value === key ? 'bg-s3 font-semibold text-white' : 'bg-transparent font-normal text-fg-tertiary hover:text-white'}`}
        >{label}</button>
      ))}
    </div>
  )
}

function SearchBox({ value, onChange, placeholder }: { value: string; onChange: (value: string) => void; placeholder: string }) {
  return (
    <label className="relative block max-w-[320px] flex-1">
      <span className="absolute left-2.5 top-[11px] text-fg-tertiary"><Icon name="search" size={14}/></span>
      <input value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} className="h-9 w-full box-border rounded-md border border-border bg-s1 py-0 pl-8 pr-3 text-[13px] text-white outline-none placeholder:text-fg-tertiary focus:border-white" />
    </label>
  )
}

function Card({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <div className={`overflow-hidden rounded-lg border border-border bg-s1 ${className}`}>{children}</div>
}

function CardHeader({ title, aside }: { title: string; aside?: React.ReactNode }) {
  return <div className="flex items-baseline justify-between border-b border-border px-4 py-3.5"><span className="text-[15px] font-semibold">{title}</span>{aside}</div>
}

interface PlanContext {
  id: string
  name: string
  coachName: string | null
  studentName: string | null
  status: PlanStatus
  weeks: number
  startDate: string | null
  endDate: string | null
}

function planContext(plan: AdminPlan): PlanContext {
  return { id: plan.id, name: plan.name, coachName: plan.coachName, studentName: plan.studentName, status: plan.status, weeks: plan.weeks, startDate: plan.startDate, endDate: plan.endDate }
}

function OverviewPage({ state, openUser, openPlan, navigate }: {
  state: ResourceState<Awaited<ReturnType<typeof getAdminOverview>>>
  openUser: (id: string, label: string) => void
  openPlan: (id: string, context: PlanContext) => void
  navigate: (page: RootPage) => void
}) {
  if (state.error && !state.loading) return <div className="max-w-[1400px] rounded-lg border border-border bg-s1"><ErrorState retry={state.retry}/></div>
  const stats = state.data?.stats
  const statCards = [
    [S.admin.overview.coaches, stats?.coaches, S.admin.overview.coachesHint],
    [S.admin.overview.students, stats ? stats.coachedStudents + stats.selfTrainStudents : undefined, stats ? S.admin.overview.studentsHint(stats.coachedStudents, stats.selfTrainStudents) : ' '],
    [S.admin.overview.bindings, stats?.activeBonds, S.admin.overview.bindingsHint],
    [S.admin.overview.plans, stats?.publishedPlans, S.admin.overview.plansHint],
  ] as const
  return (
    <div className="flex max-w-[1400px] flex-col gap-6" data-testid="admin-overview">
      <div className="grid grid-cols-4 gap-3 max-[1000px]:grid-cols-2">
        {statCards.map(([label, value, sub]) => <div key={label} className="rounded-lg border border-border bg-s1 p-4"><div className="font-mono text-[10.5px] font-medium uppercase tracking-[0.08em] text-fg-tertiary">{label}</div><div className="mt-2.5 font-sans text-4xl font-extrabold leading-[1.1] tracking-[-0.02em] tabular-nums">{value ?? '—'}</div><div className="mt-1.5 text-xs text-fg-secondary">{sub}</div></div>)}
      </div>
      <div className="grid grid-cols-2 items-start gap-3 max-[900px]:grid-cols-1">
        <Card>
          <CardHeader title={S.admin.overview.recentUsers} aside={<button type="button" onClick={() => navigate('users')} className="text-xs text-fg-tertiary hover:text-white">{S.admin.viewAll}</button>}/>
          {state.loading ? <SkeletonRows count={3}/> : state.data?.recentUsers.length ? state.data.recentUsers.slice(0, 10).map((user) => {
            const name = displayName(user.displayName)
            return <button type="button" key={user.id} onClick={() => openUser(user.id, name)} className="grid h-12 w-full grid-cols-[1fr_auto_auto_16px] items-center gap-3 border-b border-[#1A1A1A] px-4 text-left hover:bg-s2"><span className="truncate font-medium">{name}</span><Badge spec={roleBadge(user.role)}/><span className="font-mono text-xs text-fg-tertiary tabular-nums">{dateOnly(user.createdAt)}</span><span className="text-fg-tertiary"><Icon name="chevron" size={14}/></span></button>
          }) : <EmptyState text={S.admin.overview.noUsers}/>}
        </Card>
        <Card>
          <CardHeader title={S.admin.overview.recentPlans} aside={<button type="button" onClick={() => navigate('plans')} className="text-xs text-fg-tertiary hover:text-white">{S.admin.viewAll}</button>}/>
          {state.loading ? <SkeletonRows count={3}/> : state.data?.recentPlans.length ? state.data.recentPlans.slice(0, 10).map((plan) => {
            const context: PlanContext = { id: plan.id, name: plan.name, coachName: plan.coachName, studentName: plan.studentName, status: 'published', weeks: 0, startDate: null, endDate: null }
            return <button type="button" key={plan.id} onClick={() => openPlan(plan.id, context)} className="grid h-12 w-full grid-cols-[auto_1fr_auto_16px] items-center gap-3 border-b border-[#1A1A1A] px-4 text-left hover:bg-s2"><span className="whitespace-nowrap text-[12.5px] text-fg-secondary">{plan.coachId ? displayName(plan.coachName) : S.admin.template} → {displayName(plan.studentName)}</span><span className="truncate font-medium">{plan.name}</span><span className="font-mono text-xs text-fg-tertiary tabular-nums">{dateOnly(plan.publishedAt)}</span><span className="text-fg-tertiary"><Icon name="chevron" size={14}/></span></button>
          }) : <EmptyState text={S.admin.overview.noPlans}/>}
        </Card>
      </div>
    </div>
  )
}

type RoleFilter = 'all' | AdminManagedRole

function userRelation(user: AdminUser): string {
  if (user.role === 'admin') return '—'
  if (user.role === 'coach') return S.admin.users.coachStudents(user.relation && 'studentCount' in user.relation ? user.relation.studentCount : 0)
  if (user.role === 'self_train_student') return S.admin.role.selfTrain
  return user.relation && 'coachId' in user.relation ? S.admin.users.coachRelation(displayName(user.relation.coachName)) : S.admin.users.unbound
}

function UsersPage({ state, openUser }: { state: ResourceState<Awaited<ReturnType<typeof getAdminUsers>>>; openUser: (id: string, label: string) => void }) {
  const [filter, setFilter] = useState<RoleFilter>('all')
  const [search, setSearch] = useState('')
  const [descending, setDescending] = useState(true)
  const users = useMemo(() => {
    const query = search.trim().toLocaleLowerCase()
    const phoneQuery = query.replace(/\s/g, '')
    return [...(state.data?.users ?? [])].filter((user) => (
      (filter === 'all' || user.role === filter)
      && (!query || displayName(user.displayName, user.phone).toLocaleLowerCase().includes(query) || user.phone.replace(/\s/g, '').includes(phoneQuery))
    )).sort((a, b) => descending ? b.createdAt.localeCompare(a.createdAt) : a.createdAt.localeCompare(b.createdAt))
  }, [descending, filter, search, state.data])
  const filtered = filter !== 'all' || search.trim() !== ''
  return (
    <div className="flex max-w-[1400px] flex-col gap-4" data-testid="admin-users">
      <div className="flex flex-wrap items-center gap-3"><FilterChips options={[["all", S.common.all], ['coach', S.admin.role.coach], ['coached_student', S.admin.role.coachedStudent], ['self_train_student', S.admin.role.selfTrain]]} value={filter} onChange={setFilter}/><SearchBox value={search} onChange={setSearch} placeholder={S.admin.users.search}/><span className="text-xs text-fg-tertiary tabular-nums">{state.data ? S.admin.users.count(users.length) : ''}</span></div>
      <Card className="overflow-x-auto">
        <div className="min-w-[850px]">
          <div className="grid h-10 grid-cols-[minmax(120px,1.1fr)_130px_160px_140px_minmax(150px,1.3fr)_24px] items-center gap-3 border-b border-border px-4 font-mono text-[10.5px] uppercase tracking-[0.08em] text-fg-tertiary"><span>{S.admin.users.name}</span><span>{S.admin.users.role}</span><span>{S.admin.users.phone}</span><button type="button" onClick={() => setDescending((value) => !value)} className="flex items-center gap-1 text-left hover:text-white">{S.admin.users.registeredAt} <span className="text-[9px]">{descending ? '▼' : '▲'}</span></button><span>{S.admin.users.keyRelation}</span><span/></div>
          {state.loading ? <SkeletonRows/> : state.error ? <ErrorState retry={state.retry}/> : users.length === 0 ? <EmptyState text={filtered ? S.admin.users.noMatch : S.admin.overview.noUsers} clear={filtered ? () => { setFilter('all'); setSearch('') } : undefined}/> : <>
            {users.map((user) => { const name = displayName(user.displayName, user.phone); return <button type="button" key={user.id} onClick={() => openUser(user.id, name)} className="grid h-12 w-full grid-cols-[minmax(120px,1.1fr)_130px_160px_140px_minmax(150px,1.3fr)_24px] items-center gap-3 border-b border-[#1A1A1A] px-4 text-left hover:bg-s2"><span className="truncate font-medium">{name}</span><span><Badge spec={roleBadge(user.role)}/></span><span className="font-mono text-[12.5px] text-fg-secondary tabular-nums">{user.phone}</span><span className="font-mono text-[12.5px] text-fg-tertiary tabular-nums">{dateOnly(user.createdAt)}</span><span className="truncate text-[12.5px] text-fg-secondary">{userRelation(user)}</span><span className="text-fg-tertiary"><Icon name="chevron" size={14}/></span></button> })}
            <div className="px-4 py-2.5 text-[11.5px] text-fg-tertiary tabular-nums">{S.admin.users.rowsHint(users.length)}</div>
          </>}
        </div>
      </Card>
    </div>
  )
}

function DangerCard({ detail, onToast }: { detail: AdminUserDetailResponse; onToast: (text: string) => void }) {
  const [modal, setModal] = useState<'deactivate' | 'unbind' | null>(null)
  const [typed, setTyped] = useState('')
  const target = displayName(detail.user.displayName, detail.user.phone)
  const unlocked = modal !== 'deactivate' || typed.trim() === target
  return <>
    <div className="rounded-lg border border-[rgba(229,34,30,0.35)] bg-s1 p-4"><div className="mb-1.5 font-mono text-[10.5px] uppercase tracking-[0.08em] text-brand">{S.admin.danger.title}</div><div className="mb-3.5 text-xs text-fg-tertiary">{S.admin.danger.hint}</div><div className="flex items-center justify-between"><div><div className="text-[13px] font-medium">{S.admin.danger.deactivateAccount}</div><div className="mt-0.5 text-[11.5px] text-fg-tertiary">{S.admin.danger.deactivateHint}</div></div><button type="button" onClick={() => { setTyped(''); setModal('deactivate') }} className="rounded-md border border-[rgba(229,34,30,0.45)] px-3.5 py-1.5 text-[12.5px] font-medium text-brand hover:bg-brand-soft">{S.admin.danger.deactivate}</button></div><div className="my-2 h-px bg-[#1A1A1A]"/><div className="flex items-center justify-between"><div><div className="text-[13px] font-medium">{S.admin.danger.unbindRelation}</div><div className="mt-0.5 text-[11.5px] text-fg-tertiary">{S.admin.danger.unbindHint}</div></div><button type="button" onClick={() => setModal('unbind')} className="rounded-md border border-[rgba(229,34,30,0.45)] px-3.5 py-1.5 text-[12.5px] font-medium text-brand hover:bg-brand-soft">{S.admin.danger.unbind}</button></div></div>
    {modal && <div role="presentation" onMouseDown={() => setModal(null)} className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(0,0,0,0.72)]"><div role="dialog" aria-modal="true" onMouseDown={(event) => event.stopPropagation()} className="w-[420px] max-w-[calc(100vw-48px)] rounded-xl border border-border-strong bg-s2 p-6"><div className="font-mono text-[10.5px] uppercase tracking-[0.1em] text-brand">{S.admin.danger.confirmTitle}</div><div className="mt-2.5 text-lg font-bold">{modal === 'deactivate' ? S.admin.danger.deactivateTitle(target) : S.admin.danger.unbindTitle(target)}</div><div className="mt-2 text-[13px] leading-6 text-fg-secondary">{modal === 'deactivate' ? S.admin.danger.deactivateBody : S.admin.danger.unbindBody}</div><div className="mt-3 rounded-md border border-[rgba(229,34,30,0.3)] bg-brand-soft px-3 py-2.5 text-[12.5px] leading-5">{S.admin.danger.impact}</div>{modal === 'deactivate' && <label className="mt-3.5 block text-xs text-fg-tertiary">{S.admin.danger.typeToConfirm} <span className="font-mono text-white">{target}</span> {S.admin.danger.confirmSuffix}<input value={typed} onChange={(event) => setTyped(event.target.value)} placeholder={target} className="mt-1.5 h-[38px] w-full box-border rounded-md border border-border bg-s1 px-3 text-[13px] text-white outline-none focus:border-white"/></label>}<div className="mt-5 flex justify-end gap-2"><button type="button" onClick={() => setModal(null)} className="rounded-md border border-border-strong px-4 py-2 text-[13px] hover:bg-s3">{S.common.cancel}</button><button type="button" disabled={!unlocked} onClick={() => { setModal(null); onToast(modal === 'deactivate' ? S.admin.danger.deactivated(target) : S.admin.danger.unbound(target)) }} className="rounded-md bg-brand px-4 py-2 text-[13px] font-semibold text-white disabled:opacity-[0.35]">{modal === 'deactivate' ? S.admin.danger.deactivateAccount : S.admin.danger.confirmUnbind}</button></div></div></div>}
  </>
}

function UserDetailPage({ state, openUser, openPlan, onToast }: {
  state: ResourceState<AdminUserDetailResponse>
  openUser: (id: string, label: string) => void
  openPlan: (id: string, context: PlanContext) => void
  onToast: (text: string) => void
}) {
  if (state.loading) return <div className="max-w-[1100px] rounded-lg border border-border bg-s1"><SkeletonRows count={6}/></div>
  if (state.error || !state.data) return <div className="max-w-[1100px] rounded-lg border border-border bg-s1"><ErrorState retry={state.retry}/></div>
  const detail = state.data
  const user = detail.user
  const name = displayName(user.displayName, user.phone)
  const relationTitle = user.role === 'coach' ? S.admin.users.assignedStudents : user.role === 'admin' ? S.admin.users.bindingRelation : S.admin.users.assignedCoach
  const relationEmpty = user.role === 'admin' ? S.admin.users.adminNoRelation : user.role === 'self_train_student' ? S.admin.users.selfNoCoach : user.role === 'coach' ? S.admin.users.noStudents : S.admin.users.noCoach
  return <div className="flex max-w-[1100px] flex-col gap-4" data-testid="admin-user-detail">
    <div className="flex items-center gap-3.5"><div className="flex h-12 w-12 items-center justify-center rounded-pill bg-s3 text-lg font-bold">{name.slice(0, 1)}</div><div><div className="flex items-center gap-2.5"><span className="text-[22px] font-bold">{name}</span><Badge spec={roleBadge(user.role)}/></div><div className="mt-1 font-mono text-xs text-fg-tertiary tabular-nums">{user.phone} · {S.admin.users.registeredOn(dateOnly(user.createdAt))}</div></div></div>
    <div className="grid grid-cols-[340px_1fr] items-start gap-3 max-[800px]:grid-cols-1"><div className="flex flex-col gap-3"><Card className="p-4"><div className="mb-3 font-mono text-[10.5px] uppercase tracking-[0.08em] text-fg-tertiary">{S.admin.users.basicInfo}</div>{[[S.admin.users.name, name], [S.admin.users.role, roleBadge(user.role).label], [S.admin.users.phone, user.phone], [S.admin.users.registeredAt, dateOnly(user.createdAt)]].map(([key, value]) => <div key={key} className="flex items-center justify-between border-b border-[#1A1A1A] py-2"><span className="text-[12.5px] text-fg-tertiary">{key}</span><span className="font-mono text-[13px] tabular-nums">{value}</span></div>)}</Card>{ADMIN_WRITE_ENABLED && <DangerCard detail={detail} onToast={onToast}/>}</div>
      <div className="flex flex-col gap-3"><Card><CardHeader title={relationTitle} aside={<span className="text-xs text-fg-tertiary tabular-nums">{detail.relations.length ? (user.role === 'coach' ? S.admin.users.people(detail.relations.length) : S.admin.users.persons(detail.relations.length)) : ''}</span>}/>{detail.relations.length === 0 ? <EmptyState text={relationEmpty}/> : detail.relations.map((relation) => { const relationName = displayName(relation.displayName); return <button type="button" key={relation.userId} onClick={() => openUser(relation.userId, relationName)} className="grid h-[46px] w-full grid-cols-[1fr_auto_auto_16px] items-center gap-3 border-b border-[#1A1A1A] px-4 text-left hover:bg-s2"><span className="font-medium">{relationName}</span><Badge spec={bindBadge('accepted')}/><span className="font-mono text-xs text-fg-tertiary">{S.admin.users.boundOn(dateOnly(relation.bondAcceptedAt))}</span><span className="text-fg-tertiary"><Icon name="chevron" size={14}/></span></button> })}</Card>
        <Card><CardHeader title={S.admin.users.relatedPlans} aside={<span className="text-xs text-fg-tertiary tabular-nums">{S.admin.users.planCount(detail.plans.length)}</span>}/>{detail.plans.length === 0 ? <EmptyState text={S.admin.users.noRelatedPlans}/> : detail.plans.map((plan) => { const context: PlanContext = { id: plan.id, name: plan.name, coachName: plan.coachName, studentName: plan.studentName, status: plan.status, weeks: plan.weeks, startDate: null, endDate: null }; return <button type="button" key={plan.id} onClick={() => openPlan(plan.id, context)} className="grid h-[46px] w-full grid-cols-[1fr_auto_auto_auto_16px] items-center gap-3 border-b border-[#1A1A1A] px-4 text-left hover:bg-s2"><span className="truncate font-medium">{plan.name}</span><Badge spec={planBadge(plan.status)}/><span className="whitespace-nowrap text-xs text-fg-secondary">{S.common.countWeeks(plan.weeks)}</span><span className="font-mono text-xs text-fg-tertiary">{dateOnly(plan.createdAt)}</span><span className="text-fg-tertiary"><Icon name="chevron" size={14}/></span></button> })}</Card></div>
    </div>
  </div>
}

type BindingFilter = 'all' | AdminBindingStatus

function BindingsPage({ state, openUser }: { state: ResourceState<Awaited<ReturnType<typeof getAdminBindings>>>; openUser: (id: string, label: string) => void }) {
  const [filter, setFilter] = useState<BindingFilter>('all')
  const [search, setSearch] = useState('')
  const rows = useMemo(() => { const query = search.trim().toLocaleLowerCase(); return [...(state.data?.bindings ?? [])].filter((binding) => (filter === 'all' || binding.status === filter) && (!query || displayName(binding.coachName).toLocaleLowerCase().includes(query) || displayName(binding.studentName).toLocaleLowerCase().includes(query))).sort((a, b) => b.submittedAt.localeCompare(a.submittedAt)) }, [filter, search, state.data])
  const filtered = filter !== 'all' || search.trim() !== ''
  return <div className="flex max-w-[1200px] flex-col gap-4" data-testid="admin-bindings"><div className="flex flex-wrap items-center gap-3"><FilterChips options={[["all", S.common.all], ['accepted', S.admin.binding.accepted], ['pending', S.admin.binding.pending], ['rejected', S.admin.binding.rejected], ['expired', S.admin.binding.expired], ['cancelled', S.admin.binding.cancelled]]} value={filter} onChange={setFilter}/><SearchBox value={search} onChange={setSearch} placeholder={S.admin.bindings.search}/><span className="text-xs text-fg-tertiary tabular-nums">{state.data ? S.admin.bindings.count(rows.length) : ''}</span></div><Card className="overflow-x-auto"><div className="min-w-[820px]"><div className="grid h-10 grid-cols-[minmax(120px,1fr)_20px_minmax(120px,1fr)_120px_140px_140px] items-center gap-3 border-b border-border px-4 font-mono text-[10.5px] uppercase tracking-[0.08em] text-fg-tertiary"><span>{S.admin.bindings.coach}</span><span/><span>{S.admin.bindings.student}</span><span>{S.admin.bindings.status}</span><span>{S.admin.bindings.submittedAt}</span><span>{S.admin.bindings.respondedAt}</span></div>{state.loading ? <SkeletonRows/> : state.error ? <ErrorState retry={state.retry}/> : rows.length === 0 ? <EmptyState text={filtered ? S.admin.bindings.noMatch : S.admin.bindings.empty} clear={filtered ? () => { setFilter('all'); setSearch('') } : undefined}/> : <>{rows.map((binding: AdminBinding) => <div key={binding.id} className="grid h-12 grid-cols-[minmax(120px,1fr)_20px_minmax(120px,1fr)_120px_140px_140px] items-center gap-3 border-b border-[#1A1A1A] px-4" style={{ opacity: binding.status === 'accepted' || binding.status === 'pending' ? 1 : 0.55 }}><button type="button" onClick={() => openUser(binding.coachId, displayName(binding.coachName))} className="truncate text-left font-medium hover:text-brand">{displayName(binding.coachName)}</button><span className="text-fg-tertiary"><Icon name="arrow" size={14}/></span><button type="button" onClick={() => openUser(binding.studentId, displayName(binding.studentName))} className="truncate text-left font-medium hover:text-brand">{displayName(binding.studentName)}</button><span><Badge spec={bindBadge(binding.status)}/></span><span className="font-mono text-[12.5px] text-fg-tertiary tabular-nums">{dateOnly(binding.submittedAt)}</span><span className="font-mono text-[12.5px] text-fg-tertiary tabular-nums">{dateOnly(binding.respondedAt)}</span></div>)}<div className="px-4 py-2.5 text-[11.5px] text-fg-tertiary">{S.admin.bindings.rowsHint(rows.length)}</div></>}</div></Card></div>
}

type PlanFilter = 'all' | PlanStatus

function PlansPage({ state, openPlan }: { state: ResourceState<Awaited<ReturnType<typeof getAdminPlans>>>; openPlan: (id: string, context: PlanContext) => void }) {
  const [filter, setFilter] = useState<PlanFilter>('all')
  const [coach, setCoach] = useState('all')
  const plans = state.data?.plans ?? []
  const coaches = useMemo(() => [...new Map(plans.filter((plan) => plan.coachId).map((plan) => [plan.coachId as string, displayName(plan.coachName)])).entries()], [plans])
  const rows = plans.filter((plan) => (filter === 'all' || plan.status === filter) && (coach === 'all' || (coach === 'template' ? !plan.coachId : plan.coachId === coach)))
  const filtered = filter !== 'all' || coach !== 'all'
  return <div className="flex max-w-[1400px] flex-col gap-4" data-testid="admin-plans"><div className="flex flex-wrap items-center gap-3"><FilterChips options={[["all", S.common.all], ['published', S.admin.planStatus.published], ['draft', S.admin.planStatus.draft], ['completed', S.admin.planStatus.completed], ['paused', S.admin.planStatus.paused]]} value={filter} onChange={setFilter}/><select value={coach} onChange={(event) => setCoach(event.target.value)} className="h-9 cursor-pointer rounded-md border border-border bg-s1 px-3 text-[13px] text-white outline-none"><option value="all">{S.admin.plans.allCoaches}</option>{coaches.map(([id, name]) => <option key={id} value={id}>{name}</option>)}<option value="template">{S.admin.plans.selfTemplate}</option></select><span className="text-xs text-fg-tertiary tabular-nums">{state.data ? S.admin.plans.count(rows.length) : ''}</span></div><Card className="overflow-x-auto"><div className="min-w-[930px]"><div className="grid h-10 grid-cols-[minmax(170px,1.4fr)_110px_110px_100px_90px_180px_24px] items-center gap-3 border-b border-border px-4 font-mono text-[10.5px] uppercase tracking-[0.08em] text-fg-tertiary"><span>{S.admin.plans.name}</span><span>{S.admin.plans.coach}</span><span>{S.admin.plans.student}</span><span>{S.admin.plans.status}</span><span>{S.admin.plans.cycle}</span><span>{S.admin.plans.dates}</span><span/></div>{state.loading ? <SkeletonRows/> : state.error ? <ErrorState retry={state.retry}/> : rows.length === 0 ? <EmptyState text={filtered ? S.admin.plans.noMatch : S.admin.plans.empty} clear={filtered ? () => { setFilter('all'); setCoach('all') } : undefined}/> : <>{rows.map((plan) => <button type="button" key={plan.id} onClick={() => openPlan(plan.id, planContext(plan))} className="grid h-12 w-full grid-cols-[minmax(170px,1.4fr)_110px_110px_100px_90px_180px_24px] items-center gap-3 border-b border-[#1A1A1A] px-4 text-left hover:bg-s2"><span className="truncate font-medium">{plan.name}</span><span className="truncate text-[12.5px] text-fg-secondary">{plan.coachId ? displayName(plan.coachName) : S.admin.plans.templateDash}</span><span className="truncate text-[12.5px] text-fg-secondary">{displayName(plan.studentName)}</span><span><Badge spec={planBadge(plan.status)}/></span><span className="text-[12.5px] text-fg-secondary">{S.common.countWeeks(plan.weeks)}</span><span className="font-mono text-xs text-fg-tertiary tabular-nums">{plan.startDate ? `${dateOnly(plan.startDate)} → ${dateOnly(plan.endDate)}` : S.admin.unscheduled}</span><span className="text-fg-tertiary"><Icon name="chevron" size={14}/></span></button>)}<div className="px-4 py-2.5 text-[11.5px] text-fg-tertiary">{S.admin.plans.rowsHint(rows.length)}</div></>}</div></Card></div>
}

const exerciseTypeLabel = (type: string): string => S.common.exerciseType[type as keyof typeof S.common.exerciseType] ?? type

function ExerciseUsagePage({ state }: { state: ResourceState<Awaited<ReturnType<typeof getAdminExerciseUsage>>> }) {
  const [search, setSearch] = useState('')
  const rows = useMemo(() => {
    const query = search.trim().toLowerCase()
    return (state.data?.exercises ?? [])
      .map((exercise, sourceIndex) => ({ exercise, sourceIndex }))
      .filter(({ exercise }) => !query
        || exercise.name.toLowerCase().includes(query)
        || (exercise.name_en?.toLowerCase().includes(query) ?? false)
        || exerciseTypeLabel(exercise.exercise_type).toLowerCase().includes(query))
      .sort((a, b) => b.exercise.plan_count - a.exercise.plan_count || a.sourceIndex - b.sourceIndex)
      .map(({ exercise }) => exercise)
  }, [search, state.data])
  return (
    <div className="flex max-w-[1200px] flex-col gap-4" data-testid="admin-exercises">
      <div className="flex flex-wrap items-center gap-3">
        <SearchBox value={search} onChange={setSearch} placeholder={S.admin.exercises.search}/>
        <span className="text-xs text-fg-tertiary tabular-nums">{state.data ? S.admin.exercises.count(rows.length) : ''}</span>
      </div>
      <Card className="overflow-x-auto">
        <div className="min-w-[720px]">
          <div className="grid h-10 grid-cols-[minmax(220px,1fr)_160px_150px_150px] items-center gap-3 border-b border-border px-4 font-mono text-[10.5px] uppercase tracking-[0.08em] text-fg-tertiary">
            <span>{S.admin.exercises.name}</span><span>{S.admin.exercises.type}</span><span>{S.admin.exercises.planUses}</span><span>{S.admin.exercises.coachUses}</span>
          </div>
          {state.loading ? <SkeletonRows/> : state.error ? <ErrorState retry={state.retry}/> : rows.length === 0
            ? <EmptyState text={search.trim() ? S.admin.exercises.noMatch : S.admin.exercises.empty} clear={search.trim() ? () => setSearch('') : undefined}/>
            : <>{rows.map((exercise: AdminExerciseUsage) => (
              <div key={exercise.exercise_id} className="grid h-12 grid-cols-[minmax(220px,1fr)_160px_150px_150px] items-center gap-3 border-b border-[#1A1A1A] px-4">
                <span className="truncate font-medium">{fmt.exerciseName(exercise)}</span>
                <span className="text-[12.5px] text-fg-secondary">{exerciseTypeLabel(exercise.exercise_type)}</span>
                <span className="font-mono text-[12.5px] tabular-nums">{exercise.plan_count}</span>
                <span className="font-mono text-[12.5px] text-fg-secondary tabular-nums">{exercise.coach_count}</span>
              </div>
            ))}<div className="px-4 py-2.5 text-[11.5px] text-fg-tertiary">{S.admin.exercises.rowsHint(rows.length)}</div></>}
        </div>
      </Card>
    </div>
  )
}

interface MatrixCell { text: string; tag: string; tagColor: string }
interface MatrixExercise { key: string; name: string; main: boolean; cells: Array<MatrixCell | null> }
interface MatrixDay { dayOfWeek: number; exercises: MatrixExercise[] }

function conciseNumber(value: string): string {
  const number = Number(value)
  return Number.isFinite(number) ? String(number) : value
}

function exercisePrescription(exercise: AdminPlanExercise): string {
  const sets = [...exercise.sets].sort((a, b) => a.set_number - b.set_number)
  if (sets.length === 0) return '—'
  const first = sets[0]
  const reps = first.target_reps_max ? `${first.target_reps}–${first.target_reps_max}` : String(first.target_reps)
  const same = sets.every((set) => set.target_reps === first.target_reps && set.target_reps_max === first.target_reps_max && set.intensity_mode === first.intensity_mode && set.target_value === first.target_value)
  if (same) return `${sets.length}×${reps} ${first.intensity_mode === 'rpe' ? `@RPE ${conciseNumber(first.target_value)}` : `${conciseNumber(first.target_value)}kg`}`
  return sets.map((set) => set.intensity_mode === 'rpe' ? `RPE ${conciseNumber(set.target_value)}` : `${conciseNumber(set.target_value)}kg`).join(' / ')
}

function buildMatrix(plan: AdminPlanWithChildren): MatrixDay[] {
  const activeDows = [...new Set(plan.days.filter((day) => day.exercises.length > 0).map((day) => day.day_of_week))].sort((a, b) => a - b)
  return activeDows.map((dayOfWeek) => {
    const days = plan.days.filter((day) => day.day_of_week === dayOfWeek)
    const slots = new Map<string, { name: string; sortOrder: number; main: boolean }>()
    days.forEach((day) => day.exercises.forEach((exercise) => {
      const key = `${exercise.sort_order}:${exercise.exercise_id}`
      if (!slots.has(key)) slots.set(key, {
        name: fmt.exerciseName({ name: exercise.exercise_name, name_en: exercise.name_en }),
        sortOrder: exercise.sort_order,
        main: exercise.is_main_lift,
      })
    }))
    const rows = [...slots.entries()].sort((a, b) => a[1].sortOrder - b[1].sortOrder).map(([key, slot]) => {
      let previous = ''
      const cells = Array.from({ length: plan.plan_weeks }, (_, index): MatrixCell | null => {
        const day = days.find((item) => item.week_number === index + 1)
        const exercise = day?.exercises.find((item) => `${item.sort_order}:${item.exercise_id}` === key)
        if (!exercise) { previous = ''; return null }
        const text = exercisePrescription(exercise)
        const sameAsLastWeek = index > 0 && previous === text
        const tag = index === 0 ? S.admin.detail.baseline : sameAsLastWeek ? S.admin.detail.sameAsLastWeek : S.admin.detail.coachEntered
        previous = text
        return { text, tag, tagColor: index === 0 ? '#1FB358' : sameAsLastWeek ? '#565656' : '#B5B5B5' }
      })
      return { key, name: slot.name, main: slot.main, cells }
    })
    return { dayOfWeek, exercises: rows }
  })
}

function PlanDetailPage({ state, context }: { state: ResourceState<AdminPlanWithChildren>; context: PlanContext | null }) {
  if (state.loading) return <div className="max-w-[1400px] rounded-lg border border-border bg-s1"><SkeletonRows count={7}/></div>
  if (state.error || !state.data) return <div className="max-w-[1400px] rounded-lg border border-border bg-s1"><ErrorState retry={state.retry}/></div>
  const plan = state.data
  const matrix = buildMatrix(plan)
  const columnTemplate = `220px repeat(${plan.plan_weeks}, minmax(150px, 1fr))`
  const minWidth = Math.max(420, 220 + plan.plan_weeks * 170)
  // Template plans have no coach_id; a bound coach with an unset profile name
  // must read as 未设置姓名, never as a template and never as a raw UUID.
  const coach = plan.coach_id ? displayName(context?.coachName ?? null) : S.admin.template
  const student = displayName(context?.studentName ?? null)
  return <div className="flex max-w-[1400px] flex-col gap-4" data-testid="admin-plan-detail"><div className="flex items-center gap-2.5 rounded-md border border-border-strong bg-s1 px-3.5 py-2.5 text-fg-secondary"><Icon name="lock" size={14}/><span className="font-mono text-[11px] tracking-[0.08em]">READ-ONLY //</span><span className="text-[12.5px]">{S.admin.detail.readOnly}</span></div><div className="flex flex-wrap items-baseline gap-3"><span className="text-[22px] font-bold">{plan.name}</span><Badge spec={planBadge(plan.status)}/><span className="text-[13px] text-fg-secondary">{coach} → {student}</span><span className="font-mono text-xs text-fg-tertiary tabular-nums">{plan.start_date ? `${dateOnly(plan.start_date)} → ${dateOnly(plan.end_date)}` : S.admin.unscheduled} · {S.common.countWeeks(plan.plan_weeks)}</span></div><Card className="overflow-x-auto"><div style={{ minWidth }}><div className="grid border-b border-border" style={{ gridTemplateColumns: columnTemplate }}><div className="px-4 py-3 font-mono text-[10.5px] uppercase tracking-[0.08em] text-fg-tertiary">{S.admin.detail.action}</div>{Array.from({ length: plan.plan_weeks }, (_, index) => <div key={index} className="border-l border-[#1A1A1A] px-4 py-3"><span className="font-mono text-[11px] font-bold tracking-[0.08em] text-brand">WEEK {index + 1}</span><span className="ml-1.5 text-[11px] text-fg-tertiary">{index === 0 ? (plan.plan_weeks === 1 ? S.admin.detail.singleWeek : S.admin.detail.baselineEntered) : S.admin.detail.plannedValue}</span></div>)}</div>{matrix.length === 0 ? <EmptyState text={S.admin.detail.empty}/> : matrix.map((day, dayIndex) => <div key={day.dayOfWeek}><div className="border-b border-[#1A1A1A] bg-[#0A0A0A] px-4 py-2.5 text-[12.5px] font-bold text-fg-secondary">{S.common.weekdaysMondayFirst[day.dayOfWeek - 1]} · DAY {dayIndex + 1}</div>{day.exercises.map((exercise) => <div key={exercise.key} className="grid border-b border-[#1A1A1A]" style={{ gridTemplateColumns: columnTemplate }}><div className="flex items-center gap-2 px-4 py-2.5"><span className={`text-[13px] ${exercise.main ? 'font-semibold' : 'font-normal'}`}>{exercise.name}</span>{exercise.main && <span className="rounded-[3px] border border-border px-[5px] py-px font-mono text-[9.5px] tracking-[0.06em] text-fg-tertiary">{S.common.mainLift}</span>}</div>{exercise.cells.map((cell, index) => <div key={index} className="border-l border-[#1A1A1A] px-4 py-2.5">{cell ? <><div className="whitespace-nowrap font-mono text-[13px] tabular-nums">{cell.text}</div><div className="mt-0.5 text-[10.5px]" style={{ color: cell.tagColor }}>{cell.tag}</div></> : <div className="font-mono text-[13px] text-fg-tertiary">—</div>}</div>)}</div>)}</div>)}</div></Card></div>
}

function AdminRail({ page, navigate, onLogout }: { page: AdminPage; navigate: (page: RootPage) => void; onLogout: () => void }) {
  const tabs: Array<{ page: RootPage; label: string; icon: IconName }> = [
    { page: 'overview', label: S.admin.page.overview, icon: 'overview' }, { page: 'users', label: S.admin.page.users, icon: 'users' }, { page: 'bindings', label: S.admin.page.bindings, icon: 'bindings' }, { page: 'plans', label: S.admin.page.plans, icon: 'plans' }, { page: 'exercises', label: S.admin.page.exercises, icon: 'exercises' },
  ]
  const activeRoot: RootPage = page === 'userDetail' ? 'users' : page === 'planDetail' ? 'plans' : page
  return <nav className="flex w-[92px] flex-none flex-col items-center border-r border-border bg-black pb-3 pt-4"><div className="flex h-10 w-10 items-center justify-center rounded-md border border-border-strong text-lg font-black tracking-[-0.02em]">M</div><div className="mt-2 rounded-[4px] border border-[rgba(229,34,30,0.35)] bg-brand-soft px-2 py-[3px] font-mono text-[9px] font-bold tracking-[0.12em] text-brand">ADMIN</div><div className="mt-6 flex w-full flex-col gap-0.5">{tabs.map((tab) => { const active = activeRoot === tab.page; return <button type="button" key={tab.page} onClick={() => navigate(tab.page)} className={`relative flex flex-col items-center gap-[5px] py-3 pb-2.5 text-[11px] font-medium ${active ? 'bg-s1 text-white' : 'text-fg-tertiary hover:text-white'}`}><span className={`absolute bottom-2 left-0 top-2 w-0.5 ${active ? 'bg-brand' : 'bg-transparent'}`}/><Icon name={tab.icon}/><span>{tab.label}</span></button> })}</div><div className="flex-1"/><div className="h-px w-[60px] bg-border"/><div className="mt-2.5 flex h-8 w-8 items-center justify-center rounded-pill bg-s3 text-[13px] font-bold">{S.admin.detail.founderInitial}</div><div className="mt-1 text-[10px] text-fg-tertiary">{S.admin.detail.founder}</div><button type="button" title={S.common.signOut} aria-label={S.common.signOut} onClick={onLogout} className="mt-2 flex h-8 w-8 items-center justify-center rounded-md text-fg-tertiary hover:bg-s2 hover:text-white"><Icon name="logout" size={16}/></button></nav>
}

export function AdminWorkspace({ onLogout }: Props) {
  const [page, setPage] = useState<AdminPage>('overview')
  const [backPage, setBackPage] = useState<RootPage>('overview')
  const [userId, setUserId] = useState<string | null>(null)
  const [userLabel, setUserLabel] = useState('')
  const [planId, setPlanId] = useState<string | null>(null)
  const [selectedPlan, setSelectedPlan] = useState<PlanContext | null>(null)
  const [toast, setToast] = useState('')

  const overview = useResource(page === 'overview' ? 'overview' : null, getAdminOverview)
  const users = useResource(page === 'users' ? 'users' : null, getAdminUsers)
  const userDetail = useResource(page === 'userDetail' && userId ? `user:${userId}` : null, () => getAdminUser(userId as string))
  const bindings = useResource(page === 'bindings' ? 'bindings' : null, getAdminBindings)
  const plans = useResource(page === 'plans' ? 'plans' : null, getAdminPlans)
  const exercises = useResource(page === 'exercises' ? 'exercises' : null, getAdminExerciseUsage)
  const detail = useResource(page === 'planDetail' && planId ? `plan:${planId}` : null, async () => {
    // Exercise names ride along in the admin payload; a failure here must land
    // in the error state with retry, never silently degrade to bare IDs.
    return getAdminPlan(planId as string)
  })

  const navigate = (next: RootPage) => { setPage(next); setUserId(null); setPlanId(null) }
  const rememberBack = (): RootPage => page === 'userDetail' || page === 'planDetail' ? backPage : page
  const openUser = (id: string, label: string) => { setBackPage(rememberBack()); setUserId(id); setUserLabel(label); setPage('userDetail') }
  const openPlan = (id: string, context: PlanContext) => { setBackPage(rememberBack()); setPlanId(id); setSelectedPlan(context); setPage('planDetail') }
  const goBack = () => { setPage(backPage); setUserId(null); setPlanId(null) }
  const showToast = (text: string) => { setToast(text); window.setTimeout(() => setToast(''), 2600) }
  const active = page === 'overview' ? overview : page === 'users' ? users : page === 'userDetail' ? userDetail : page === 'bindings' ? bindings : page === 'plans' ? plans : page === 'exercises' ? exercises : detail
  const detailPage = page === 'userDetail' || page === 'planDetail'
  const leaf = page === 'userDetail' ? (userDetail.data ? displayName(userDetail.data.user.displayName, userDetail.data.user.phone) : userLabel) : page === 'planDetail' ? (detail.data?.name ?? selectedPlan?.name ?? '') : pageTitle(page)

  return <div className="flex h-screen overflow-hidden bg-bg font-sans text-sm leading-[1.4] text-white" data-testid="admin-workspace"><AdminRail page={page} navigate={navigate} onLogout={onLogout}/><div className="relative flex min-w-0 flex-1 flex-col">{active.loading && <div className="absolute left-0 right-0 top-0 z-30 h-0.5 overflow-hidden"><div className="admin-loadbar absolute top-0 h-0.5 w-[30%] bg-brand"/></div>}<header className="flex h-14 flex-none items-center gap-3 border-b border-border px-6"><span className="text-base font-black tracking-[-0.01em]">MeetPR</span><span className="font-mono text-[11px] font-medium tracking-[0.08em] text-brand">ADMIN /</span>{detailPage && <><button type="button" onClick={goBack} className="-ml-1 flex items-center gap-1.5 rounded-[6px] px-2 py-1 text-[13px] text-fg-secondary hover:bg-s2 hover:text-white"><Icon name="back" size={15}/>{pageTitle(page === 'userDetail' ? 'users' : 'plans')}</button><span className="text-[13px] text-fg-tertiary">/</span></>}<span className="text-sm font-semibold">{leaf}</span><div className="flex-1"/></header><main className="min-w-0 flex-1 overflow-y-auto p-6">{page === 'overview' && <OverviewPage state={overview} openUser={openUser} openPlan={openPlan} navigate={navigate}/>} {page === 'users' && <UsersPage state={users} openUser={openUser}/>} {page === 'userDetail' && <UserDetailPage state={userDetail} openUser={openUser} openPlan={openPlan} onToast={showToast}/>} {page === 'bindings' && <BindingsPage state={bindings} openUser={openUser}/>} {page === 'plans' && <PlansPage state={plans} openPlan={openPlan}/>} {page === 'exercises' && <ExerciseUsagePage state={exercises}/>} {page === 'planDetail' && <PlanDetailPage state={detail} context={selectedPlan}/>}</main></div>{toast && <div className="fixed bottom-6 left-1/2 z-[60] -translate-x-1/2 rounded-md border border-border-strong bg-s2 px-[18px] py-2.5 text-[13px]">{toast}</div>}</div>
}
