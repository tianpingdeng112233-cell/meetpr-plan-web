import { act, useState } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AuthUser } from '../../api/types'
import { installLocalStorageMock } from '../../test/localStorageMock'
import { CoachShell, type CoachView } from './CoachShell'
import { useGlobalKeyboardHandler } from './globalKeyboard'

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const me: AuthUser = {
  id: 'coach',
  phone: '+8613900000001',
  role: 'coach',
  createdAt: '2026-01-01T00:00:00Z',
  display_name: '李教练',
}

function ShellHarness({
  initialView = 'editor',
  unreadCount = 0,
  requestCount = 0,
  videoCount = 0,
  exerciseCount = 0,
  onLogout = () => undefined,
  onConfirmLeave,
  commandStudents = [],
  commandExercises = [],
  onCommandStudent = () => undefined,
  onCommandExercise = () => undefined,
  onProbe,
}: {
  initialView?: CoachView
  unreadCount?: number
  requestCount?: number
  videoCount?: number
  exerciseCount?: number
  onLogout?: () => void | Promise<void>
  onConfirmLeave?: () => Promise<boolean>
  commandStudents?: Array<{ id: string; label: string }>
  commandExercises?: Array<{ id: string; label: string; secondary?: string }>
  onCommandStudent?: (id: string) => void
  onCommandExercise?: (id: string) => void
  onProbe?: () => void
}) {
  const [view, setView] = useState<CoachView>(initialView)
  return (
    <CoachShell
      view={view}
      onChange={setView}
      me={me}
      exerciseCount={exerciseCount}
      pendingStudents={[]}
      pendingCount={0}
      unreadCount={unreadCount}
      requestCount={requestCount}
      videoCount={videoCount}
      onPickPending={() => undefined}
      lastSyncedAt={new Date(2026, 6, 27, 9, 12)}
      onLogout={onLogout}
      onConfirmLeave={onConfirmLeave}
      commandStudents={commandStudents}
      commandExercises={commandExercises}
      onCommandStudent={onCommandStudent}
      onCommandExercise={onCommandExercise}
    >
      <div data-testid="content">{view}</div>
      {onProbe && <KeyboardProbe onHit={onProbe} />}
    </CoachShell>
  )
}

function KeyboardProbe({ onHit }: { onHit: () => void }) {
  useGlobalKeyboardHandler(({ event }) => {
    if (event.key.toLowerCase() !== 'j') return false
    onHit()
    return true
  }, 10)
  return null
}

function navButton(host: HTMLElement, label: string): HTMLButtonElement {
  const button = [...host.querySelectorAll<HTMLButtonElement>('.coach-nav-item')]
    .find((item) => item.firstElementChild?.textContent === label)
  if (!button) throw new Error(`nav button not found: ${label}`)
  return button
}

describe('CoachShell', () => {
  let host: HTMLDivElement
  let root: Root

  beforeEach(() => {
    installLocalStorageMock()
    window.localStorage.removeItem('meetpr:sidebar:coach-shell')
    host = document.createElement('div')
    document.body.appendChild(host)
    root = createRoot(host)
  })

  afterEach(() => {
    act(() => root.unmount())
    host.remove()
  })

  it('switches navigation with exactly one highlighted item', async () => {
    await act(async () => { root.render(<ShellHarness />) })
    expect(host.querySelectorAll('.coach-nav-item.active')).toHaveLength(1)
    expect(host.querySelector('.coach-nav-item.active')?.firstElementChild?.textContent).toBe('计划编排')

    await act(async () => { navButton(host, '动作库').click() })

    expect(host.querySelectorAll('.coach-nav-item.active')).toHaveLength(1)
    expect(host.querySelector('.coach-nav-item.active')?.firstElementChild?.textContent).toBe('动作库')
    expect(host.querySelector('[data-testid="content"]')?.textContent).toBe('catalog')
  })

  it('derives danger and muted badges from the supplied data counts', async () => {
    await act(async () => {
      root.render(<ShellHarness unreadCount={5} requestCount={2} videoCount={3} exerciseCount={1} />)
    })

    expect(navButton(host, '消息').querySelector('.coach-nav-badge.danger')?.textContent).toBe('5')
    expect(navButton(host, '学员申请').querySelector('.coach-nav-badge.danger')?.textContent).toBe('2')
    expect(navButton(host, '动作库').querySelector('.coach-nav-badge.muted')?.textContent).toBe('1')
    expect(navButton(host, '训练视频').querySelector('.coach-nav-badge.muted')?.textContent).toBe('3')
  })

  it('renders the main workspace full-width beside the navigation on every screen', async () => {
    await act(async () => { root.render(<ShellHarness />) })
    const body = host.querySelector('.coach-shell-body')
    expect(host.querySelector('.coach-context')).toBeNull()
    expect(host.querySelector('.coach-main')).not.toBeNull()
    expect(body?.children).toHaveLength(2)
    expect(body?.lastElementChild?.classList.contains('coach-main')).toBe(true)
  })

  it('collapses the workspace navigation to 44px semantics and restores it from localStorage', async () => {
    await act(async () => { root.render(<ShellHarness unreadCount={5} />) })
    const toggle = host.querySelector<HTMLButtonElement>('[aria-label="收起工作区导航"]')!

    await act(async () => { toggle.click() })
    const navigation = host.querySelector<HTMLElement>('.coach-navigation')!
    expect(navigation.classList.contains('collapsed')).toBe(true)
    expect(toggle.getAttribute('aria-expanded')).toBe('false')
    expect(window.localStorage.getItem('meetpr:sidebar:coach-shell')).toBe('true')
    const messages = navigation.querySelector<HTMLButtonElement>('[title="消息"]')!
    expect(messages.textContent).toContain('消')
    expect(messages.getAttribute('aria-label')).toBe('消息，5 条未读')
    expect(messages.querySelector('.coach-nav-badge.danger')?.textContent).toBe('5')
    expect(messages.querySelector('.coach-nav-badge.danger')?.getAttribute('aria-hidden')).toBe('true')
    expect(navigation.querySelector<HTMLButtonElement>('[title="计划编排"]')?.getAttribute('aria-label')).toBe('计划编排')

    act(() => root.unmount())
    root = createRoot(host)
    await act(async () => { root.render(<ShellHarness />) })
    expect(host.querySelector('.coach-navigation')?.classList.contains('collapsed')).toBe(true)
    expect(host.querySelector('[aria-label="展开工作区导航"]')).not.toBeNull()
  })

  it('moves focus through the avatar menu and restores it on Escape or an outside click', async () => {
    await act(async () => { root.render(<ShellHarness />) })
    const avatar = host.querySelector<HTMLButtonElement>('.coach-avatar')!

    await act(async () => { avatar.click() })
    expect(avatar.getAttribute('aria-expanded')).toBe('true')
    const items = [...host.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')]
    expect(items).toHaveLength(2)
    expect(host.textContent).toContain('改密码')
    expect(host.textContent).toContain('退出')
    expect(document.activeElement).toBe(items[0])

    await act(async () => {
      items[0]?.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }))
    })
    expect(document.activeElement).toBe(items[1])
    await act(async () => {
      items[1]?.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }))
    })
    expect(document.activeElement).toBe(items[0])
    await act(async () => {
      items[0]?.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true }))
    })
    expect(document.activeElement).toBe(items[1])

    await act(async () => {
      items[1]?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    })
    expect(avatar.getAttribute('aria-expanded')).toBe('false')
    expect(host.querySelector('[role="menu"]')).toBeNull()
    expect(document.activeElement).toBe(avatar)

    await act(async () => { avatar.click() })
    await act(async () => { document.body.dispatchEvent(new MouseEvent('mousedown', { bubbles: true })) })
    expect(avatar.getAttribute('aria-expanded')).toBe('false')
    expect(document.activeElement).toBe(avatar)
  })

  it('opens change password and guards logout from the avatar menu', async () => {
    const onLogout = vi.fn()
    const onConfirmLeave = vi.fn(async () => true)
    await act(async () => {
      root.render(<ShellHarness onLogout={onLogout} onConfirmLeave={onConfirmLeave} />)
    })
    const avatar = host.querySelector<HTMLButtonElement>('.coach-avatar')!

    await act(async () => { avatar.click() })
    const passwordItem = [...host.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')]
      .find((button) => button.textContent === '改密码')!
    await act(async () => { passwordItem.click() })
    expect(document.querySelector('[role="dialog"][aria-label="修改密码"]')).not.toBeNull()

    await act(async () => {
      document.querySelector<HTMLButtonElement>('[role="dialog"] button')?.click()
    })
    await act(async () => { avatar.click() })
    const logoutItem = [...host.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')]
      .find((button) => button.textContent === '退出')!
    await act(async () => { logoutItem.click() })

    expect(onConfirmLeave).toHaveBeenCalledTimes(1)
    expect(onLogout).toHaveBeenCalledTimes(1)
  })

  it('opens ⌘K, filters local commands, executes the active result, and closes with Escape', async () => {
    const onCommandStudent = vi.fn()
    const onCommandExercise = vi.fn()
    await act(async () => {
      root.render(
        <ShellHarness
          commandStudents={[{ id: 'student-2', label: '乙学员' }]}
          commandExercises={[{ id: 'bench', label: '竞技卧推', secondary: 'Competition Bench Press' }]}
          onCommandStudent={onCommandStudent}
          onCommandExercise={onCommandExercise}
        />,
      )
    })

    await act(async () => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', metaKey: true, bubbles: true }))
    })
    expect(host.querySelector('[role="dialog"][aria-label="命令面板"]')).not.toBeNull()
    const search = host.querySelector<HTMLInputElement>('[aria-label="搜索命令"]')!
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(search, '卧推')
      search.dispatchEvent(new Event('input', { bubbles: true }))
    })
    const options = [...host.querySelectorAll<HTMLElement>('[role="option"]')]
    expect(options).toHaveLength(1)
    expect(options[0].textContent).toContain('竞技卧推')

    await act(async () => {
      search.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    })
    expect(onCommandExercise).toHaveBeenCalledWith('bench')
    expect(host.querySelector('[role="dialog"][aria-label="命令面板"]')).toBeNull()

    await act(async () => { host.querySelector<HTMLButtonElement>('.coach-search-shell')?.click() })
    const studentSearch = host.querySelector<HTMLInputElement>('[aria-label="搜索命令"]')!
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(studentSearch, '乙学员')
      studentSearch.dispatchEvent(new Event('input', { bubbles: true }))
      studentSearch.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    })
    expect(onCommandStudent).toHaveBeenCalledWith('student-2')

    await act(async () => { host.querySelector<HTMLButtonElement>('.coach-search-shell')?.click() })
    await act(async () => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }))
    })
    await act(async () => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    })
    expect(host.querySelector('[data-testid="content"]')?.textContent).toBe('board')

    await act(async () => { host.querySelector<HTMLButtonElement>('.coach-search-shell')?.click() })
    await act(async () => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    })
    expect(host.querySelector('[role="dialog"][aria-label="命令面板"]')).toBeNull()
  })

  it('suspends screen shortcut registrations while the command palette is open', async () => {
    const onProbe = vi.fn()
    await act(async () => { root.render(<ShellHarness onProbe={onProbe} />) })
    await act(async () => { host.querySelector<HTMLButtonElement>('.coach-search-shell')?.click() })
    await act(async () => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'j', bubbles: true }))
    })
    expect(onProbe).not.toHaveBeenCalled()

    await act(async () => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    })
    await act(async () => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'j', bubbles: true }))
    })
    expect(onProbe).toHaveBeenCalledTimes(1)
  })

  it('traps Tab inside the command palette and restores the search trigger after every close path', async () => {
    await act(async () => { root.render(<ShellHarness />) })
    const trigger = host.querySelector<HTMLButtonElement>('.coach-search-shell')!
    const openPalette = async () => {
      await act(async () => { trigger.click() })
      await act(async () => { await new Promise((resolve) => window.setTimeout(resolve, 0)) })
      return host.querySelector<HTMLInputElement>('[aria-label="搜索命令"]')!
    }

    const search = await openPalette()
    expect(document.activeElement).toBe(search)
    const options = [...host.querySelectorAll<HTMLButtonElement>('[role="option"]')]
    const lastOption = options.at(-1)!
    await act(async () => {
      search.dispatchEvent(new KeyboardEvent('keydown', {
        key: 'Tab',
        shiftKey: true,
        bubbles: true,
        cancelable: true,
      }))
    })
    expect(document.activeElement).toBe(lastOption)
    await act(async () => {
      lastOption.dispatchEvent(new KeyboardEvent('keydown', {
        key: 'Tab',
        bubbles: true,
        cancelable: true,
      }))
    })
    expect(document.activeElement).toBe(search)

    await act(async () => {
      search.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    })
    expect(document.activeElement).toBe(trigger)

    await openPalette()
    await act(async () => {
      host.querySelector<HTMLButtonElement>('[role="option"]')?.click()
    })
    expect(document.activeElement).toBe(trigger)

    await openPalette()
    await act(async () => {
      host.querySelector<HTMLElement>('.command-palette-layer')
        ?.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
    })
    expect(document.activeElement).toBe(trigger)
  })
})
