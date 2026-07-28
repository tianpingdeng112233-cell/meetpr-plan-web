import { act, useState } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { AuthUser, ExerciseResponse } from '../../api/types'
import { CoachShell, type CoachView } from './CoachShell'

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const me: AuthUser = {
  id: 'coach',
  phone: '+8613900000001',
  role: 'coach',
  createdAt: '2026-01-01T00:00:00Z',
  display_name: '李教练',
}

const exercise: ExerciseResponse = {
  id: 'squat',
  name: '竞技深蹲',
  name_en: 'Competition Squat',
  exercise_type: 'main_lift',
  main_lift_family: 'squat',
  is_competition_lift: true,
  muscle_groups: [],
  equipment: [],
  movement_pattern: [],
  competition_stance: null,
  created_by_coach_id: null,
  created_at: '2026-01-01T00:00:00Z',
}

function ShellHarness({
  initialView = 'editor',
  unreadCount = 0,
  requestCount = 0,
  videoCount = 0,
  exercises = [],
}: {
  initialView?: CoachView
  unreadCount?: number
  requestCount?: number
  videoCount?: number
  exercises?: ExerciseResponse[]
}) {
  const [view, setView] = useState<CoachView>(initialView)
  return (
    <CoachShell
      view={view}
      onChange={setView}
      me={me}
      students={[]}
      studentId=""
      onboarding={null}
      exercises={exercises}
      pendingStudents={[]}
      pendingCount={0}
      unreadCount={unreadCount}
      requestCount={requestCount}
      videoCount={videoCount}
      onPickPending={() => undefined}
      lastSyncedAt={new Date(2026, 6, 27, 9, 12)}
    >
      <div data-testid="content">{view}</div>
    </CoachShell>
  )
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
      root.render(<ShellHarness unreadCount={5} requestCount={2} videoCount={3} exercises={[exercise]} />)
    })

    expect(navButton(host, '消息').querySelector('.coach-nav-badge.danger')?.textContent).toBe('5')
    expect(navButton(host, '学员申请').querySelector('.coach-nav-badge.danger')?.textContent).toBe('2')
    expect(navButton(host, '动作库').querySelector('.coach-nav-badge.muted')?.textContent).toBe('1')
    expect(navButton(host, '训练视频').querySelector('.coach-nav-badge.muted')?.textContent).toBe('3')
  })

  it('removes the student context panel on the messages screen', async () => {
    await act(async () => { root.render(<ShellHarness initialView="messages" />) })
    expect(host.querySelector('.coach-context')).toBeNull()
    expect(host.querySelector('.coach-main')).not.toBeNull()
  })
})
