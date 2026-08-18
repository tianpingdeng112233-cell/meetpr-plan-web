import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { AuthUser, CoachStudent } from '../../api/types'
import { ChangePasswordDialog } from './ChangePasswordDialog'
import {
  CommandPalette,
  type CommandExercise,
  type CommandStudent,
} from './CommandPalette'
import { usePersistentCollapse } from './usePersistentCollapse'
import { useGlobalKeyboardHandler } from './globalKeyboard'
import { fmt, S } from '../../i18n/strings'

export type CoachView = 'board' | 'editor' | 'messages' | 'catalog' | 'requests' | 'tracking'

type Badge = { count: number; tone: 'danger' | 'muted'; label: string }

const navItems = (): { id: CoachView; label: string; short: string }[] => [
  { id: 'board', label: S.workspace.nav.overview, short: S.workspace.nav.overviewShort },
  { id: 'editor', label: S.workspace.nav.editor, short: S.workspace.nav.editorShort },
  { id: 'messages', label: S.workspace.nav.feedback, short: S.workspace.nav.feedbackShort },
  { id: 'catalog', label: S.workspace.nav.catalog, short: S.workspace.nav.catalogShort },
  { id: 'requests', label: S.workspace.nav.requests, short: S.workspace.nav.requestsShort },
  { id: 'tracking', label: S.workspace.nav.tracking, short: S.workspace.nav.trackingShort },
]

const viewShortcuts = (): Record<CoachView, string> => ({
  board: S.workspace.shortcuts.board,
  editor: S.workspace.shortcuts.editor,
  messages: S.workspace.shortcuts.feedback,
  catalog: S.workspace.shortcuts.catalog,
  requests: '',
  tracking: '',
})

const viewCrumbs = (): Record<CoachView, string> => ({
  board: S.workspace.nav.overview, editor: S.workspace.nav.editor, messages: S.workspace.nav.feedback,
  catalog: S.workspace.nav.catalog, requests: S.workspace.nav.requests, tracking: S.workspace.nav.tracking,
})

export interface CoachShellProps {
  children: React.ReactNode
  view: CoachView
  onChange: (view: CoachView) => void
  me: AuthUser
  exerciseCount: number
  pendingStudents: CoachStudent[]
  pendingCount: number
  unreadCount: number
  requestCount: number
  videoCount: number | null
  onPickPending: (studentId: string) => void
  lastSyncedAt: Date | null
  onLogout: () => void | Promise<void>
  onConfirmLeave?: () => Promise<boolean>
  commandStudents?: readonly CommandStudent[]
  commandExercises?: readonly CommandExercise[]
  onCommandStudent?: (studentId: string) => void | Promise<void>
  onCommandExercise?: (exerciseId: string) => void | Promise<void>
}

export function CoachShell({
  children,
  view,
  onChange,
  me,
  exerciseCount,
  pendingStudents,
  pendingCount,
  unreadCount,
  requestCount,
  videoCount,
  onPickPending,
  lastSyncedAt,
  onLogout,
  onConfirmLeave,
  commandStudents = [],
  commandExercises = [],
  onCommandStudent = () => {},
  onCommandExercise = () => {},
}: CoachShellProps) {
  const badges = useMemo<Partial<Record<CoachView, Badge>>>(() => ({
    messages: {
      count: unreadCount + (videoCount ?? 0),
      tone: unreadCount > 0 ? 'danger' : 'muted',
      label: videoCount == null
        ? S.workspace.unreadBadge(unreadCount)
        : S.workspace.unreadVideoBadge(unreadCount, videoCount),
    },
    requests: { count: requestCount, tone: 'danger', label: S.workspace.pendingBadge(requestCount) },
    catalog: { count: exerciseCount, tone: 'muted', label: S.workspace.exerciseBadge(exerciseCount) },
  }), [exerciseCount, requestCount, unreadCount, videoCount])
  const [toast, setToast] = useState('')
  const [commandOpen, setCommandOpen] = useState(false)
  const commandTriggerRef = useRef<HTMLButtonElement>(null)

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
      <CoachTopBar
        view={view}
        me={me}
        onLogout={onLogout}
        onConfirmLeave={onConfirmLeave}
        onOpenCommand={() => setCommandOpen(true)}
        commandTriggerRef={commandTriggerRef}
      />
      <div className="coach-shell-body">
        <CoachNavigation
          view={view}
          badges={badges}
          pendingStudents={pendingStudents}
          pendingCount={pendingCount}
          onChange={onChange}
          onPickPending={onPickPending}
          lastSyncedAt={lastSyncedAt}
        />
        <main className="coach-main">{children}</main>
      </div>
      <footer className="coach-statusbar">
        <span>{S.workspace.queued(pendingCount)}</span>
        <span>{S.workspace.unread(unreadCount)}</span>
        <span className="coach-statusbar-shortcuts">{viewShortcuts()[view]}</span>
      </footer>
      {toast && <div className="coach-toast" role="status">{toast}</div>}
      <CommandPalette
        open={commandOpen}
        students={commandStudents}
        exercises={commandExercises}
        onOpenChange={setCommandOpen}
        onOpenStudent={onCommandStudent}
        onOpenExercise={onCommandExercise}
        onOpenView={onChange}
        returnFocusRef={commandTriggerRef}
      />
    </div>
  )
}

function CoachTopBar({
  view,
  me,
  onLogout,
  onConfirmLeave,
  onOpenCommand,
  commandTriggerRef,
}: {
  view: CoachView
  me: AuthUser
  onLogout: () => void | Promise<void>
  onConfirmLeave?: () => Promise<boolean>
  onOpenCommand: () => void
  commandTriggerRef: React.RefObject<HTMLButtonElement>
}) {
  // Login has no display name today; switch to GET /me when the backend exposes it.
  const coachName = me.display_name?.trim() || S.workspace.coachAvatar
  const [menuOpen, setMenuOpen] = useState(false)
  const [passwordOpen, setPasswordOpen] = useState(false)
  const accountRef = useRef<HTMLDivElement>(null)
  const avatarRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  const closeMenu = useCallback((restoreFocus = false) => {
    setMenuOpen(false)
    if (restoreFocus) avatarRef.current?.focus()
  }, [])

  useGlobalKeyboardHandler(({ event }) => {
    if (!menuOpen || event.key !== 'Escape') return false
    event.preventDefault()
    closeMenu(true)
    return true
  }, 100)

  useEffect(() => {
    if (!menuOpen) return
    menuRef.current?.querySelector<HTMLButtonElement>('[role="menuitem"]')?.focus()
    const onPointerDown = (event: MouseEvent) => {
      if (!accountRef.current?.contains(event.target as Node)) {
        event.preventDefault()
        closeMenu(true)
      }
    }
    document.addEventListener('mousedown', onPointerDown)
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
    }
  }, [closeMenu, menuOpen])

  const handleLogout = async () => {
    closeMenu()
    if (onConfirmLeave && !(await onConfirmLeave())) {
      avatarRef.current?.focus()
      return
    }
    await onLogout()
  }

  const handleMenuKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return
    event.preventDefault()
    const items = [...(menuRef.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]') ?? [])]
    if (items.length === 0) return
    const currentIndex = items.indexOf(document.activeElement as HTMLButtonElement)
    const direction = event.key === 'ArrowDown' ? 1 : -1
    const nextIndex = (currentIndex + direction + items.length) % items.length
    items[nextIndex]?.focus()
  }

  return (
    <header className="coach-topbar">
      <span className="coach-mark">M</span>
      <span className="coach-breadcrumb">COACH / {viewCrumbs()[view]}</span>
      <button ref={commandTriggerRef} className="coach-search-shell" type="button" aria-label={S.workspace.openCommandPalette} onClick={onOpenCommand}>
        <span className="coach-search-icon" aria-hidden="true" />
        <span>{S.workspace.commandPlaceholder}</span>
        <kbd>⌘K</kbd>
      </button>
      <div className="coach-account" ref={accountRef}>
        <button
          ref={avatarRef}
          type="button"
          className="coach-avatar"
          title={coachName}
          aria-label={S.workspace.accountMenu(coachName)}
          aria-haspopup="menu"
          aria-controls={menuOpen ? 'coach-account-menu' : undefined}
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen((open) => !open)}
        >
          {coachName.slice(0, 1)}
        </button>
        {menuOpen && (
          <div
            ref={menuRef}
            id="coach-account-menu"
            className="coach-account-menu"
            role="menu"
            aria-label={S.workspace.accountMenu(coachName)}
            onKeyDown={handleMenuKeyDown}
          >
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                closeMenu()
                setPasswordOpen(true)
              }}
            >
              {S.workspace.changePassword}
            </button>
            <button type="button" role="menuitem" onClick={() => { void handleLogout() }}>
              {S.workspace.signOut}
            </button>
          </div>
        )}
      </div>
      <ChangePasswordDialog
        open={passwordOpen}
        onClose={() => setPasswordOpen(false)}
        onSessionInvalidated={() => {
          setPasswordOpen(false)
          return onLogout()
        }}
        onBeforeSubmit={onConfirmLeave}
      />
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
  pendingCount: number
  onChange: (view: CoachView) => void
  onPickPending: (studentId: string) => void
  lastSyncedAt: Date | null
}) {
  const week = weekRange(new Date())
  const [collapsed, toggleCollapsed] = usePersistentCollapse('meetpr:sidebar:coach-shell')
  return (
    <nav className={`coach-navigation${collapsed ? ' collapsed' : ''}`} aria-label={S.workspace.coachWorkspace}>
      <div className="coach-nav-head">
        <span className="coach-nav-heading">{S.workspace.workspace}</span>
        <button
          type="button"
          className="column-collapse-toggle"
          aria-label={collapsed ? S.workspace.expandNavigation : S.workspace.collapseNavigation}
          aria-expanded={!collapsed}
          title={collapsed ? S.workspace.expandNavigation : S.workspace.collapseNavigation}
          onClick={toggleCollapsed}
        >
          {collapsed ? '›' : '‹'}
        </button>
      </div>
      {navItems().map((item) => {
        const badge = badges[item.id]
        const collapsedLabel = collapsedNavLabel(item.label, badge)
        return (
          <button
            key={item.id}
            type="button"
            aria-label={collapsed ? collapsedLabel : undefined}
            aria-current={view === item.id ? 'page' : undefined}
            className={`coach-nav-item${view === item.id ? ' active' : ''}`}
            onClick={() => onChange(item.id)}
            title={collapsed ? item.label : undefined}
          >
            <span>{collapsed ? item.short : item.label}</span>
            {badge && badge.count > 0 && (
              <span
                className={`coach-nav-badge ${badge.tone}`}
                aria-label={collapsed ? undefined : badge.label}
                aria-hidden={collapsed || undefined}
              >{badge.count}</span>
            )}
          </button>
        )
      })}
      {!collapsed && (
        <>
          <span className="coach-nav-heading coach-queue-heading">{S.workspace.queue(pendingCount)}</span>
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
        </>
      )}
      <span className="coach-nav-footer">
        {S.workspace.thisWeek(week)}
        <br />
        {S.workspace.synced(lastSyncedAt ? formatTime(lastSyncedAt) : '—')}
      </span>
    </nav>
  )
}

function collapsedNavLabel(label: string, badge: Badge | undefined): string {
  if (!badge || badge.count <= 0) return label
  return `${label}，${badge.label}`
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
  return fmt.monthDay(date, () => `${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`)
}

function formatTime(date: Date): string {
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
}
