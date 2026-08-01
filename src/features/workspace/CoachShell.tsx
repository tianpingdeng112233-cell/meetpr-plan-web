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

export type CoachView = 'board' | 'editor' | 'messages' | 'catalog' | 'requests'

type Badge = { count: number; tone: 'danger' | 'muted'; label: string }

const NAV_ITEMS: { id: CoachView; label: string; short: string }[] = [
  { id: 'board', label: '总览', short: '总' },
  { id: 'editor', label: '计划编排', short: '编' },
  { id: 'messages', label: '反馈工作区', short: '反' },
  { id: 'catalog', label: '动作库', short: '动' },
  { id: 'requests', label: '学员申请', short: '申' },
]

const VIEW_SHORTCUTS: Record<CoachView, string> = {
  board: 'J / K 移动 · ↵ 打开编排器 · ⌘K 命令',
  editor: 'Tab / ⇧Tab 横移 · ↵ / ↑↓ 纵移 · ⌘D 向下填充 · ⌘C / ⌘V · ⌘Z',
  messages: '⌥1–5 快捷回复 · ↵ 发送 · ← / → 切视频 · 空格播放 · ⌘↵ 反馈',
  catalog: '⌘K 搜动作 / 跳转',
  requests: '',
}

const VIEW_CRUMBS: Record<CoachView, string> = {
  board: '总览',
  editor: '计划编排',
  messages: '反馈工作区',
  catalog: '动作库',
  requests: '学员申请',
}

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
        ? `${unreadCount} 条未读`
        : `${unreadCount} 条未读，${videoCount} 条视频待审`,
    },
    requests: { count: requestCount, tone: 'danger', label: `${requestCount} 条待处理` },
    catalog: { count: exerciseCount, tone: 'muted', label: `${exerciseCount} 个动作` },
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
        <span>待排 {pendingCount}</span>
        <span>未读 {unreadCount}</span>
        <span className="coach-statusbar-shortcuts">{VIEW_SHORTCUTS[view]}</span>
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
  const coachName = me.display_name?.trim() || '教'
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
      <span className="coach-breadcrumb">COACH / {VIEW_CRUMBS[view]}</span>
      <button ref={commandTriggerRef} className="coach-search-shell" type="button" aria-label="打开命令面板" onClick={onOpenCommand}>
        <span className="coach-search-icon" aria-hidden="true" />
        <span>跳转学员、屏幕、动作…</span>
        <kbd>⌘K</kbd>
      </button>
      <div className="coach-account" ref={accountRef}>
        <button
          ref={avatarRef}
          type="button"
          className="coach-avatar"
          title={coachName}
          aria-label={`${coachName}账户菜单`}
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
            aria-label={`${coachName}账户菜单`}
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
              改密码
            </button>
            <button type="button" role="menuitem" onClick={() => { void handleLogout() }}>
              退出
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
    <nav className={`coach-navigation${collapsed ? ' collapsed' : ''}`} aria-label="教练工作区">
      <div className="coach-nav-head">
        <span className="coach-nav-heading">工作区</span>
        <button
          type="button"
          className="column-collapse-toggle"
          aria-label={collapsed ? '展开工作区导航' : '收起工作区导航'}
          aria-expanded={!collapsed}
          title={collapsed ? '展开工作区导航' : '收起工作区导航'}
          onClick={toggleCollapsed}
        >
          {collapsed ? '›' : '‹'}
        </button>
      </div>
      {NAV_ITEMS.map((item) => {
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
          <span className="coach-nav-heading coach-queue-heading">待排队列 · {pendingCount}</span>
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
        本周 {week}
        <br />
        已同步 {lastSyncedAt ? formatTime(lastSyncedAt) : '—'}
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
  return `${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

function formatTime(date: Date): string {
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
}
