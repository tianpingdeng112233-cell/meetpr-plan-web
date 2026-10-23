import { CustomExercisesPage } from './CustomExercisesPage'
import { useResource, type ResourceState } from './useAdminResource'
import { ApplicationsPage, applicationDevice } from './ApplicationsPage'
import { getCoachApplications, type CoachApplication } from '../../api/onboarding'
import { normalizeTraditionalInput } from '../../i18n/stable-zh'
import { useEffect, useMemo, useState } from 'react'
import {
  getAdminBindings,
  getAdminExerciseUsage,
  getAdminOverview,
  getAdminUser,
  getAdminUsers,
  type AdminBindingStatus,
  type AdminExerciseUsage,
  type AdminManagedRole,
  type AdminUser,
  type AdminUserDetailResponse,
} from '../../api/admin'
import { fmt, resolveLocale, S } from '../../i18n/strings'
import { EmptyState, ErrorState, SkeletonRows } from '../../components/states'

interface Props { onLogout: () => void }

type AdminPage = 'applications' | 'overview' | 'users' | 'userDetail' | 'exercises'
type RootPage = 'applications' | 'overview' | 'users' | 'exercises'
type BadgeSpec = { label: string; color: string; background: string; border: string; weight?: number }

export const ADMIN_WRITE_ENABLED = false

const pageTitle = (page: RootPage) => S.admin.page[page]

function roleBadge(role: AdminManagedRole): BadgeSpec {
  if (role === 'admin') {
    // Mirrors the rail ADMIN chip treatment; not part of the 3-role design set.
    return { label: S.admin.role.admin, color: '#A81E17', background: '#FFFFFF', border: '#E0B4B0', weight: 700 }
  }
  if (role === 'coach') {
    return { label: S.admin.role.coach, color: '#FFFFFF', background: '#111827', border: '#111827' }
  }
  if (role === 'coached_student') {
    return { label: S.admin.role.coachedStudent, color: '#111827', background: '#EEF0F3', border: '#D1D5DB' }
  }
  return { label: S.admin.role.selfTrain, color: '#4B5563', background: 'transparent', border: '#D1D5DB' }
}

function bindBadge(status: AdminBindingStatus): BadgeSpec {
  if (status === 'accepted') {
    return { label: S.admin.binding.accepted, color: '#10715A', background: '#E7F1EE', border: '#B7D4CC', weight: 600 }
  }
  if (status === 'pending') {
    return { label: S.admin.binding.pending, color: '#A15C00', background: '#FEF3C7', border: '#F2D9A6', weight: 500 }
  }
  const labels: Record<Exclude<AdminBindingStatus, 'accepted' | 'pending'>, string> = {
    rejected: S.admin.binding.rejected, expired: S.admin.binding.expired, cancelled: S.admin.binding.cancelled,
  }
  return { label: labels[status], color: '#5C6371', background: 'transparent', border: '#E5E7EB', weight: 400 }
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

type IconName = 'applications' | 'overview' | 'users' | 'exercises' | 'logout' | 'back' | 'chevron' | 'search'

function Icon({ name, size = 20 }: { name: IconName; size?: number }) {
  const common = { width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.75, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, 'aria-hidden': true as const }
  if (name === 'overview') return <svg {...common}><rect x="3" y="3" width="7" height="9" rx="1"/><rect x="14" y="3" width="7" height="5" rx="1"/><rect x="14" y="12" width="7" height="9" rx="1"/><rect x="3" y="16" width="7" height="5" rx="1"/></svg>
  if (name === 'users') return <svg {...common}><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/></svg>
  if (name === 'applications') return <svg {...common}><path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><path d="M14 3v6h6M9 14l2 2 4-4"/></svg>
  if (name === 'exercises') return <svg {...common}><path d="M6.5 6.5 17.5 17.5M5 9l4-4M15 19l4-4M3.5 7.5l3-3M17.5 19.5l3-3"/></svg>
  if (name === 'logout') return <svg {...common}><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="m16 17 5-5-5-5M21 12H9"/></svg>
  if (name === 'back') return <svg {...common} strokeWidth="2"><path d="M19 12H5m7 7-7-7 7-7"/></svg>
  if (name === 'chevron') return <svg {...common} strokeWidth="2"><path d="m9 18 6-6-6-6"/></svg>
  if (name === 'search') return <svg {...common} strokeWidth="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
  return null
}

function displayName(name: string | null, phone?: string | null): string {
  return name?.trim() || phone || S.admin.unnamed
}

function dateOnly(value: string | null | undefined): string {
  if (!value) return '—'
  const iso = value.slice(0, 10)
  if (resolveLocale() !== 'en') return iso
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
          className={`whitespace-nowrap rounded-[4px] px-3 py-[5px] text-[12.5px] ${value === key ? 'bg-[#111827] font-semibold text-[#FFFFFF]' : 'bg-transparent font-normal text-fg-tertiary hover:text-fg'}`}
        >{label}</button>
      ))}
    </div>
  )
}

function SearchBox({ value, onChange, placeholder }: { value: string; onChange: (value: string) => void; placeholder: string }) {
  return (
    <label className="relative block max-w-[320px] flex-1">
      <span className="absolute left-2.5 top-[11px] text-fg-tertiary"><Icon name="search" size={14}/></span>
      <input value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} className="h-9 w-full box-border rounded-md border border-border bg-s1 py-0 pl-8 pr-3 text-[13px] text-fg outline-none placeholder:text-fg-tertiary focus:border-[#111827]" />
    </label>
  )
}

function PageHeader({ title, subtitle, loading, refresh }: { title: string; subtitle: string; loading: boolean; refresh: () => void }) {
  return <header className="flex flex-wrap items-end justify-between gap-4"><div><h1 className="text-[26px] font-bold tracking-[-0.01em]">{title}</h1><p className="mt-1 text-[13px] text-fg-tertiary">{subtitle}</p></div><button type="button" onClick={refresh} disabled={loading} className="admin-secondary">{S.admin.refresh}</button></header>
}

function Card({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <div className={`overflow-hidden rounded-[10px] border border-border bg-s1 ${className}`}>{children}</div>
}

function CardHeader({ title, aside }: { title: React.ReactNode; aside?: React.ReactNode }) {
  return <div className="flex items-baseline justify-between border-b border-border px-5 py-3.5"><span className="text-[15px] font-semibold">{title}</span>{aside}</div>
}

function relativeSubmission(value: string): string {
  const minutes = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 60000))
  const unit = minutes < 60 ? 'minute' : minutes < 1440 ? 'hour' : 'day'
  const amount = unit === 'minute' ? minutes : unit === 'hour' ? Math.floor(minutes / 60) : Math.floor(minutes / 1440)
  const locale = resolveLocale()
  return S.admin.overview.submitted(new Intl.RelativeTimeFormat(locale === 'zh' ? 'zh-CN' : locale === 'zh-Hant' ? 'zh-TW' : 'en', { numeric: 'auto' }).format(-amount, unit))
}

function OverviewPage({ state, applications, applicationsLoading, applicationsError, retryApplications, users, openUser, navigate }: {
  state: ResourceState<Awaited<ReturnType<typeof getAdminOverview>>>
  applications: CoachApplication[] | null
  applicationsLoading: boolean
  applicationsError: boolean
  retryApplications: () => void
  users: ResourceState<Awaited<ReturnType<typeof getAdminUsers>>>
  openUser: (id: string, label: string) => void
  navigate: (page: RootPage) => void
}) {
  const pending = (applications ?? []).filter(item => item.status === 'pending').sort((a, b) => b.created_at.localeCompare(a.created_at))
  const stats = state.data?.stats
  const statCards = [
    [S.admin.overview.coaches, stats?.coaches, S.admin.overview.coachesHint],
    [S.admin.overview.students, stats ? stats.coachedStudents + stats.selfTrainStudents : undefined, stats ? S.admin.overview.studentsHint(stats.coachedStudents, stats.selfTrainStudents) : ''],
    [S.admin.overview.bindings, stats?.activeBonds, S.admin.overview.bindingsHint],
    [S.admin.overview.applications, applications ? pending.length : undefined, S.admin.overview.applicationsHint(applications?.filter(a => a.status === 'approved').length ?? 0, applications?.filter(a => a.status === 'rejected').length ?? 0)],
  ] as const
  return <div className="flex flex-col gap-7" data-testid="admin-overview">
    <section className="overflow-hidden rounded-[10px] border border-border-strong bg-s1" aria-label={S.admin.overview.todo}>
      <CardHeader title={<span className="flex items-center gap-2.5">{S.admin.overview.todo}{applications && <span className="admin-count">{pending.length}</span>}</span>} aside={<button type="button" onClick={() => navigate('applications')} className="text-[12.5px] text-fg-secondary">{S.admin.overview.allApplications}</button>}/>
      {applicationsLoading ? <SkeletonRows count={2}/> : applicationsError ? <ErrorState retry={retryApplications}/> : pending.length ? pending.slice(0, 5).map(item => <button type="button" key={item.id} onClick={() => navigate('applications')} className="flex w-full items-center justify-between gap-4 border-b border-[#EEF0F3] px-5 py-3.5 text-left last:border-0 hover:bg-s2">
        <span className="min-w-0"><span className="block font-semibold">{S.admin.overview.application(item.name)}</span><span className="mt-[3px] block text-[12.5px] text-fg-tertiary">{S.admin.users.coachStudents(item.student_count)} · {applicationDevice(item.device)} · {relativeSubmission(item.created_at)}</span></span><span className="admin-secondary shrink-0">{S.admin.overview.review}</span>
      </button>) : <EmptyState text={S.admin.overview.noTodo}/>}
    </section>
    {state.error ? <ErrorState retry={state.retry}/> : <section aria-label={S.admin.overview.figures} className="grid grid-cols-4 gap-3 max-[1000px]:grid-cols-2">
      {statCards.map(([label, value, hint]) => <div key={label} className="rounded-[10px] border border-border bg-s1 px-5 py-[18px]"><div className="text-[12.5px] text-fg-tertiary">{label}</div><div className="my-1.5 text-[34px] font-extrabold leading-[1.1] tracking-[-0.02em] tabular-nums">{value ?? '—'}</div><div className="text-xs text-fg-tertiary">{hint}</div></div>)}
    </section>}
    <Card>
      <CardHeader title={S.admin.overview.recentUsers} aside={<button type="button" onClick={() => navigate('users')} className="text-[12.5px] text-fg-secondary">{S.admin.overview.allUsers}</button>}/>
      <div className="overflow-x-auto"><div className="min-w-[720px]">
        {users.loading ? <SkeletonRows count={3}/> : users.error ? <ErrorState retry={users.retry}/> : users.data?.users.length ? [...users.data.users].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 10).map(user => {
          const name = displayName(user.displayName, user.phone)
          return <button type="button" key={user.id} onClick={() => openUser(user.id, name)} className="grid h-[52px] w-full grid-cols-[minmax(140px,1fr)_120px_minmax(200px,1.4fr)_110px_16px] items-center gap-4 border-b border-[#EEF0F3] px-5 text-left last:border-0 hover:bg-s2"><span className="truncate font-medium">{name}</span><span><Badge spec={roleBadge(user.role)}/></span><span className="truncate font-mono text-[12.5px] text-fg-secondary">{user.email || '—'}</span><span className="font-mono text-xs text-fg-tertiary">{dateOnly(user.createdAt)}</span><Icon name="chevron" size={14}/></button>
        }) : <EmptyState text={S.admin.overview.noUsers}/>}
      </div></div>
    </Card>
  </div>
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
      && (!query || displayName(user.displayName, user.phone).toLocaleLowerCase().includes(query) || (user.email ?? '').toLocaleLowerCase().includes(query) || (user.phone ?? '').replace(/\s/g, '').includes(phoneQuery))
    )).sort((a, b) => descending ? b.createdAt.localeCompare(a.createdAt) : a.createdAt.localeCompare(b.createdAt))
  }, [descending, filter, search, state.data])
  const filtered = filter !== 'all' || search.trim() !== ''
  return (
    <div className="flex max-w-[1400px] flex-col gap-5" data-testid="admin-users"><PageHeader title={S.admin.page.users} subtitle={state.data ? S.admin.users.count(users.length) : '—'} loading={state.loading} refresh={state.retry}/>
      <div className="flex flex-wrap items-center gap-3"><FilterChips options={[["all", S.common.all], ['coach', S.admin.role.coach], ['coached_student', S.admin.role.coachedStudent], ['self_train_student', S.admin.role.selfTrain]]} value={filter} onChange={setFilter}/><SearchBox value={search} onChange={setSearch} placeholder={S.admin.users.search}/></div>
      <Card className="overflow-x-auto">
        <div className="min-w-[1100px]">
          <div className="grid h-10 grid-cols-[minmax(120px,1.1fr)_130px_minmax(220px,1.4fr)_160px_140px_minmax(150px,1.3fr)_24px] items-center gap-3 border-b border-border px-4 font-mono text-[10.5px] uppercase tracking-[0.08em] text-fg-tertiary"><span>{S.admin.users.name}</span><span>{S.admin.users.role}</span><span>{S.admin.users.email}</span><span>{S.admin.users.phone}</span><button type="button" onClick={() => setDescending((value) => !value)} className="flex items-center gap-1 text-left hover:text-fg">{S.admin.users.registeredAt} <span className="text-[9px]">{descending ? '▼' : '▲'}</span></button><span>{S.admin.users.keyRelation}</span><span/></div>
          {state.loading ? <SkeletonRows/> : state.error ? <ErrorState retry={state.retry}/> : users.length === 0 ? <EmptyState text={filtered ? S.admin.users.noMatch : S.admin.overview.noUsers} clear={filtered ? () => { setFilter('all'); setSearch('') } : undefined}/> : <>
            {users.map((user) => { const name = displayName(user.displayName, user.phone); return <button type="button" key={user.id} onClick={() => openUser(user.id, name)} className="grid h-12 w-full grid-cols-[minmax(120px,1.1fr)_130px_minmax(220px,1.4fr)_160px_140px_minmax(150px,1.3fr)_24px] items-center gap-3 border-b border-[#EEF0F3] px-4 text-left hover:bg-s2"><span className="truncate font-medium">{name}</span><span><Badge spec={roleBadge(user.role)}/></span><span className="truncate font-mono text-[12.5px] text-fg-secondary" title={user.email ?? undefined}>{user.email || '—'}</span><span className="font-mono text-[12.5px] text-fg-secondary tabular-nums">{user.phone || '—'}</span><span className="font-mono text-[12.5px] text-fg-tertiary tabular-nums">{dateOnly(user.createdAt)}</span><span className="truncate text-[12.5px] text-fg-secondary">{userRelation(user)}</span><span className="text-fg-tertiary"><Icon name="chevron" size={14}/></span></button> })}
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
    <div className="rounded-[10px] border border-border-strong bg-s1 p-4"><div className="mb-1.5 font-mono text-[10.5px] uppercase tracking-[0.08em] text-brand">{S.admin.danger.title}</div><div className="mb-3.5 text-xs text-fg-tertiary">{S.admin.danger.hint}</div><div className="flex items-center justify-between"><div><div className="text-[13px] font-medium">{S.admin.danger.deactivateAccount}</div><div className="mt-0.5 text-[11.5px] text-fg-tertiary">{S.admin.danger.deactivateHint}</div></div><button type="button" onClick={() => { setTyped(''); setModal('deactivate') }} className="rounded-md border border-[#D1D5DB] px-3.5 py-1.5 text-[12.5px] font-medium text-brand hover:bg-brand-soft">{S.admin.danger.deactivate}</button></div><div className="my-2 h-px bg-[#EEF0F3]"/><div className="flex items-center justify-between"><div><div className="text-[13px] font-medium">{S.admin.danger.unbindRelation}</div><div className="mt-0.5 text-[11.5px] text-fg-tertiary">{S.admin.danger.unbindHint}</div></div><button type="button" onClick={() => setModal('unbind')} className="rounded-md border border-[#D1D5DB] px-3.5 py-1.5 text-[12.5px] font-medium text-brand hover:bg-brand-soft">{S.admin.danger.unbind}</button></div></div>
    {modal && <div role="presentation" onMouseDown={() => setModal(null)} className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(17,24,39,0.32)]"><div role="dialog" aria-modal="true" onMouseDown={(event) => event.stopPropagation()} className="w-[420px] max-w-[calc(100vw-48px)] rounded-xl border border-border-strong bg-s2 p-6"><div className="font-mono text-[10.5px] uppercase tracking-[0.1em] text-brand">{S.admin.danger.confirmTitle}</div><div className="mt-2.5 text-lg font-bold">{modal === 'deactivate' ? S.admin.danger.deactivateTitle(target) : S.admin.danger.unbindTitle(target)}</div><div className="mt-2 text-[13px] leading-6 text-fg-secondary">{modal === 'deactivate' ? S.admin.danger.deactivateBody : S.admin.danger.unbindBody}</div><div className="mt-3 rounded-md border border-[#D1D5DB] bg-brand-soft px-3 py-2.5 text-[12.5px] leading-5">{S.admin.danger.impact}</div>{modal === 'deactivate' && <label className="mt-3.5 block text-xs text-fg-tertiary">{S.admin.danger.typeToConfirm} <span className="font-mono text-fg">{target}</span> {S.admin.danger.confirmSuffix}<input value={typed} onChange={(event) => setTyped(event.target.value)} placeholder={target} className="mt-1.5 h-[38px] w-full box-border rounded-md border border-border bg-s1 px-3 text-[13px] text-fg outline-none focus:border-[#111827]"/></label>}<div className="mt-5 flex justify-end gap-2"><button type="button" onClick={() => setModal(null)} className="rounded-md border border-border-strong px-4 py-2 text-[13px] hover:bg-s3">{S.common.cancel}</button><button type="button" disabled={!unlocked} onClick={() => { setModal(null); onToast(modal === 'deactivate' ? S.admin.danger.deactivated(target) : S.admin.danger.unbound(target)) }} className="rounded-md bg-brand px-4 py-2 text-[13px] font-semibold text-fg disabled:opacity-[0.35]">{modal === 'deactivate' ? S.admin.danger.deactivateAccount : S.admin.danger.confirmUnbind}</button></div></div></div>}
  </>
}

function UserDetailPage({ state, bindings, openUser, onToast }: {
  state: ResourceState<AdminUserDetailResponse>
  bindings: ResourceState<Awaited<ReturnType<typeof getAdminBindings>>>
  openUser: (id: string, label: string) => void
  onToast: (text: string) => void
}) {
  if (state.loading) return <div className="max-w-[1100px] rounded-[10px] border border-border bg-s1"><SkeletonRows count={6}/></div>
  if (state.error || !state.data) return <div className="max-w-[1100px] rounded-[10px] border border-border bg-s1"><ErrorState retry={state.retry}/></div>
  const detail = state.data
  const user = detail.user
  const name = displayName(user.displayName, user.phone)
  const rows = (bindings.data?.bindings ?? [])
    .filter(binding => binding.coachId === user.id || binding.studentId === user.id)
    .sort((a, b) => b.submittedAt.localeCompare(a.submittedAt))
  const activeCount = rows.filter(binding => binding.status === 'accepted').length
  const relationEmpty = user.role === 'admin' ? S.admin.users.adminNoRelation : user.role === 'self_train_student' ? S.admin.users.selfNoCoach : user.role === 'coach' ? S.admin.users.noStudents : S.admin.users.noCoach
  return <div className="flex flex-col gap-6" data-testid="admin-user-detail">
    <div className="flex items-center gap-3.5"><div className="flex h-[52px] w-[52px] shrink-0 items-center justify-center rounded-full bg-s3 text-xl font-bold">{name.slice(0, 1)}</div><div><div className="flex items-center gap-2.5"><h1 className="text-[26px] font-bold">{name}</h1><Badge spec={roleBadge(user.role)}/></div><div className="mt-1 font-mono text-xs text-fg-tertiary tabular-nums">{user.email || user.phone || '—'} · {S.admin.users.registeredOn(dateOnly(user.createdAt))}</div></div></div>
    <div className="grid grid-cols-[repeat(auto-fit,minmax(min(320px,100%),1fr))] items-start gap-4"><div className="flex min-w-0 flex-col gap-4"><Card className="px-5 py-4"><div className="mb-1.5 text-[15px] font-semibold">{S.admin.users.basicInfo}</div>{[[S.admin.users.name, name], [S.admin.users.role, roleBadge(user.role).label], [S.admin.users.email, user.email || '—'], [S.admin.users.phone, user.phone || '—'], [S.admin.users.registeredAt, dateOnly(user.createdAt)]].map(([key, value]) => <div key={key} className="flex items-center justify-between gap-3 border-b border-[#EEF0F3] py-2.5"><span className="text-[12.5px] text-fg-tertiary">{key}</span><span className="min-w-0 break-all text-right font-mono text-[13px] tabular-nums">{value}</span></div>)}</Card>{ADMIN_WRITE_ENABLED && <DangerCard detail={detail} onToast={onToast}/>}</div>
      <Card className="min-w-0">
        <CardHeader title={S.admin.bindings.title} aside={!bindings.loading && !bindings.error && bindings.data && <span className="text-xs text-fg-tertiary tabular-nums">{S.admin.bindings.summary(activeCount, rows.length)}</span>}/>
        {bindings.loading ? <SkeletonRows/> : bindings.error ? <ErrorState retry={bindings.retry}/> : rows.length === 0 ? <EmptyState text={relationEmpty}/> : <div className="overflow-x-auto">
          <div className="min-w-[480px]">
            <div className="grid h-[34px] grid-cols-[minmax(0,1fr)_72px_96px_96px_16px] items-center gap-3 border-b border-[#EEF0F3] px-5 font-mono text-[10.5px] tracking-[0.08em] text-fg-tertiary">
              <span>{user.role === 'coach' ? S.admin.bindings.student : S.admin.bindings.coach}</span><span>{S.admin.bindings.status}</span><span className="text-right">{S.admin.bindings.submittedAt}</span><span className="text-right">{S.admin.bindings.respondedAt}</span><span/>
            </div>
            {rows.map(binding => {
              const isCoach = binding.coachId === user.id
              const counterpartId = isCoach ? binding.studentId : binding.coachId
              const counterpartName = displayName(isCoach ? binding.studentName : binding.coachName)
              return <button type="button" key={binding.id} onClick={() => openUser(counterpartId, counterpartName)} className="grid h-[52px] w-full grid-cols-[minmax(0,1fr)_72px_96px_96px_16px] items-center gap-3 border-b border-[#EEF0F3] px-5 text-left last:border-0 hover:bg-s2">
                <span className="truncate font-medium">{counterpartName}</span><span><Badge spec={bindBadge(binding.status)}/></span><span className="text-right font-mono text-xs text-fg-tertiary">{dateOnly(binding.submittedAt)}</span><span className="text-right font-mono text-xs text-fg-tertiary">{dateOnly(binding.respondedAt)}</span><span className="text-fg-tertiary"><Icon name="chevron" size={14}/></span>
              </button>
            })}
          </div>
        </div>}
      </Card>
    </div>
  </div>
}

const exerciseTypeLabel = (type: string): string => S.common.exerciseType[type as keyof typeof S.common.exerciseType] ?? type

function ExerciseUsagePage({ state }: { state: ResourceState<Awaited<ReturnType<typeof getAdminExerciseUsage>>> }) {
  const [search, setSearch] = useState('')
  const rows = useMemo(() => {
    const query = normalizeTraditionalInput(search.trim()).toLowerCase()
    return (state.data?.exercises ?? [])
      .map((exercise, sourceIndex) => ({ exercise, sourceIndex }))
      .filter(({ exercise }) => !query
        || normalizeTraditionalInput(exercise.name).toLowerCase().includes(query)
        || (exercise.name_en?.toLowerCase().includes(query) ?? false)
        || normalizeTraditionalInput(exerciseTypeLabel(exercise.exercise_type)).toLowerCase().includes(query))
      .sort((a, b) => b.exercise.plan_count - a.exercise.plan_count || a.sourceIndex - b.sourceIndex)
      .map(({ exercise }) => exercise)
  }, [search, state.data])
  return (
    <div className="flex max-w-[1200px] flex-col gap-5" data-testid="admin-exercises">
      <div className="flex flex-wrap items-center gap-3">
        <SearchBox value={search} onChange={setSearch} placeholder={S.admin.exercises.search}/>

      </div>
      <Card className="overflow-x-auto">
        <div className="min-w-[720px]">
          <div className="grid h-10 grid-cols-[minmax(220px,1fr)_160px_150px_150px] items-center gap-3 border-b border-border px-4 font-mono text-[10.5px] uppercase tracking-[0.08em] text-fg-tertiary">
            <span>{S.admin.exercises.name}</span><span>{S.admin.exercises.type}</span><span>{S.admin.exercises.planUses}</span><span>{S.admin.exercises.coachUses}</span>
          </div>
          {state.loading ? <SkeletonRows/> : state.error ? <ErrorState retry={state.retry}/> : rows.length === 0
            ? <EmptyState text={search.trim() ? S.admin.exercises.noMatch : S.admin.exercises.empty} clear={search.trim() ? () => setSearch('') : undefined}/>
            : <>{rows.map((exercise: AdminExerciseUsage) => (
              <div key={exercise.exercise_id} className="grid h-12 grid-cols-[minmax(220px,1fr)_160px_150px_150px] items-center gap-3 border-b border-[#EEF0F3] px-4">
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

function AdminRail({ page, pending, navigate, onLogout }: { page: AdminPage; pending: number; navigate: (page: RootPage) => void; onLogout: () => void }) {
  const tabs: RootPage[] = ['overview', 'applications', 'users', 'exercises']
  const activeRoot = page === 'userDetail' ? 'users' : page
  return <nav aria-label={S.admin.navigation} className="flex w-24 flex-none flex-col items-center border-r border-border bg-s1 px-2.5 py-[18px]">
    <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-border-strong text-lg font-black">M</div>
    <div className="mt-2 rounded border border-[#E0B4B0] px-1.5 py-px font-mono text-[9.5px] tracking-[0.1em] text-[#A81E17]">ADMIN</div>
    <div className="mt-[18px] flex w-full flex-col gap-1">{tabs.map(tab => <button type="button" key={tab} onClick={() => navigate(tab)} aria-current={activeRoot === tab ? 'page' : undefined} className={`relative flex flex-col items-center gap-[5px] rounded-lg py-[11px] text-[11.5px] ${activeRoot === tab ? 'bg-s3 font-semibold text-fg' : 'text-fg-tertiary hover:bg-s2 hover:text-fg'}`}><Icon name={tab}/><span>{pageTitle(tab)}</span>{tab === 'applications' && pending > 0 && <span className="admin-count absolute left-[46px] top-1.5">{pending}</span>}</button>)}</div>
    <div className="flex-1"/><div className="mt-4 h-px w-full bg-border"/><div className="mt-3.5 flex h-8 w-8 items-center justify-center rounded-full bg-s3 text-[13px] font-bold" title={S.admin.detail.founder}>{S.admin.detail.founderInitial}</div><button type="button" aria-label={S.common.signOut} onClick={onLogout} className="mt-2.5 flex h-11 w-11 items-center justify-center rounded-md text-fg-tertiary hover:bg-s2"><Icon name="logout" size={18}/></button>
  </nav>
}

export function AdminWorkspace({ onLogout }: Props) {
  const [page, setPage] = useState<AdminPage>('overview')
  const [backPage, setBackPage] = useState<RootPage>('overview')
  const [userId, setUserId] = useState<string | null>(null)
  const [userLabel, setUserLabel] = useState('')
  const [toast, setToast] = useState('')
  const [reviewBusy, setReviewBusy] = useState(false)
  const [mailFailures, setMailFailures] = useState<Record<string, boolean>>({})
  useEffect(() => {
    if (!toast) return
    const timer = window.setTimeout(() => setToast(''), 6000)
    return () => window.clearTimeout(timer)
  }, [toast])
  const [applications, setApplications] = useState<CoachApplication[] | null>(null)
  const applicationState = useResource('applications', getCoachApplications)
  useEffect(() => { if (applicationState.data) { setApplications(applicationState.data); setMailFailures({}) } }, [applicationState.data])
  const overview = useResource(page === 'overview' ? 'overview' : null, getAdminOverview)
  // The overview endpoint omits email; the existing users endpoint supplies the recent-registration table.
  const users = useResource(page === 'users' || page === 'overview' ? 'users' : null, getAdminUsers)
  const userDetail = useResource(page === 'userDetail' && userId ? `user:${userId}` : null, () => getAdminUser(userId as string))
  const bindings = useResource(page === 'userDetail' ? 'bindings' : null, getAdminBindings)
  const exercises = useResource(page === 'exercises' ? 'exercises' : null, getAdminExerciseUsage)
  const navigate = (next: RootPage) => { setPage(next); setUserId(null) }
  const openUser = (id: string, label: string) => { setBackPage(page === 'userDetail' ? backPage : page); setUserId(id); setUserLabel(label); setPage('userDetail') }
  const active = page === 'overview' ? overview : page === 'users' ? users : page === 'userDetail' ? userDetail : page === 'exercises' ? exercises : applicationState
  const leaf = page === 'userDetail' ? (userDetail.data ? displayName(userDetail.data.user.displayName, userDetail.data.user.phone) : userLabel) : pageTitle(page)
  const pending = applications?.filter(item => item.status === 'pending').length ?? 0
  const subtitle = page === 'overview' ? S.admin.overview.updated(overview.updatedAt?.toLocaleTimeString(resolveLocale(), { hour: '2-digit', minute: '2-digit', hour12: false }) ?? '—') : page === 'applications' ? S.admin.applications.subtitle : ''
  const refresh = () => { active.retry(); if (page === 'userDetail') bindings.retry(); if (page === 'overview') { applicationState.retry(); users.retry() } }
  return <div className="flex h-screen overflow-hidden bg-bg font-sans text-sm leading-[1.4] text-fg" data-testid="admin-workspace">
    <AdminRail page={page} pending={pending} navigate={navigate} onLogout={onLogout}/>
    <div className="relative min-w-0 flex-1 overflow-y-auto">
      {active.loading && <div className="absolute inset-x-0 top-0 z-30 h-0.5 overflow-hidden"><div className="admin-loadbar absolute top-0 h-0.5 w-[30%] bg-[#111827]"/></div>}
      <main className={`flex min-w-0 max-w-[1240px] flex-col px-10 pb-12 ${page === 'userDetail' ? 'gap-6 pt-7' : page === 'overview' ? 'gap-7 pt-9' : 'gap-5 pt-9'}`}>
        {page !== 'users' && page !== 'exercises' && <header className="flex flex-wrap items-end justify-between gap-4">
          {page === 'userDetail' ? <div className="flex items-center gap-2 text-[13px]"><button type="button" onClick={() => navigate(backPage)} className="flex items-center gap-1.5 text-fg-secondary"><Icon name="back" size={15}/>{S.admin.page.users}</button><span>/</span><span>{leaf}</span></div> : <div><h1 className="text-[26px] font-bold tracking-[-0.01em]">{leaf}</h1><p className="mt-1 text-[13px] text-fg-tertiary">{subtitle}</p></div>}
          <button type="button" onClick={refresh} disabled={active.loading || reviewBusy} className="admin-secondary">{S.admin.refresh}</button>
        </header>}
        {page === 'applications' && <ApplicationsPage applications={applications} loading={applicationState.loading} error={applicationState.error} retry={applicationState.retry} onChange={setApplications} onToast={setToast} mailFailures={mailFailures} onMailResult={setMailFailures} busy={reviewBusy} onBusyChange={setReviewBusy}/>}
        {page === 'overview' && <OverviewPage state={overview} applications={applications} applicationsLoading={applicationState.loading} applicationsError={applicationState.error} retryApplications={applicationState.retry} users={users} openUser={openUser} navigate={navigate}/>}
        {page === 'users' && <UsersPage state={users} openUser={openUser}/>}
        {page === 'userDetail' && <UserDetailPage state={userDetail} bindings={bindings} openUser={openUser} onToast={setToast}/>}
        {page === 'exercises' && <CustomExercisesPage refreshUsage={exercises.retry} onToast={setToast}><ExerciseUsagePage state={exercises}/></CustomExercisesPage>}
      </main>
    </div>
    {toast && <div role="status" className="fixed bottom-7 left-1/2 z-[60] max-w-[calc(100vw-48px)] -translate-x-1/2 rounded-lg border border-border-strong bg-[#111827] px-[18px] py-[11px] text-[13px] text-[#FFFFFF]">{toast}</div>}
  </div>
}
