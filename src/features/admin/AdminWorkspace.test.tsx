import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const api = vi.hoisted(() => ({
  overview: vi.fn(), users: vi.fn(), user: vi.fn(), bindings: vi.fn(), exerciseUsage: vi.fn(),
}))

vi.mock('../../api/admin', async (importOriginal) => ({
  ...await importOriginal<typeof import('../../api/admin')>(),
  getAdminOverview: api.overview,
  getAdminUsers: api.users,
  getAdminUser: api.user,
  getAdminBindings: api.bindings,
  getAdminExerciseUsage: api.exerciseUsage,
}))

import { AdminWorkspace } from './AdminWorkspace'
import { setLocale } from '../../i18n/locale'

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

async function settle() {
  await new Promise(resolve => setTimeout(resolve, 0))
}

function button(host: HTMLElement, label: string): HTMLButtonElement {
  const found = [...host.querySelectorAll('button')].find((item) => item.textContent?.trim() === label)
  if (!found) throw new Error(`button not found: ${label}`)
  return found
}

function buttonContaining(host: HTMLElement, label: string): HTMLButtonElement {
  const found = [...host.querySelectorAll('button')].find((item) => item.textContent?.includes(label))
  if (!found) throw new Error(`button not found containing: ${label}`)
  return found
}

function type(input: HTMLInputElement, value: string) {
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(input, value)
  input.dispatchEvent(new Event('input', { bubbles: true }))
}

describe('AdminWorkspace', () => {
  let host: HTMLDivElement
  let root: Root

  beforeEach(() => {
    const store = new Map<string, string>()
    vi.stubGlobal('localStorage', { getItem: (key: string) => store.get(key) ?? null, setItem: (key: string, value: string) => store.set(key, value), removeItem: (key: string) => store.delete(key) })
    host = document.createElement('div')
    document.body.appendChild(host)
    root = createRoot(host)
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ applications: [
      { id: 'app-1', name: '王雪', email: 'wang@example.test', contact: '', student_count: 12, device: 'iphone', status: 'pending', created_at: '2026-10-22T12:58:00Z' },
      { id: 'app-2', name: '陈默', email: 'chen@example.test', contact: '', student_count: 3, device: 'both', status: 'pending', created_at: '2026-10-21T21:40:00Z' },
    ] }))))
    api.overview.mockResolvedValue({ stats: { coaches: 1, coachedStudents: 1, selfTrainStudents: 0, activeBonds: 1, publishedPlans: 1 }, recentUsers: [], recentPlans: [] })
    api.users.mockResolvedValue({ users: [{ id: 'c1', displayName: '教练甲', role: 'coach', phone: '13800000000', createdAt: '2026-07-18T00:00:00Z', relation: { studentCount: 1 } }, { id: 's1', displayName: null, role: 'coached_student', phone: '13900000000', createdAt: '2026-07-17T00:00:00Z', relation: { coachId: 'c1', coachName: '教练甲' } }] })
    api.user.mockResolvedValue({ user: { id: 'c1', displayName: '教练甲', role: 'coach', phone: '13800000000', createdAt: '2026-07-18T00:00:00Z', relation: { studentCount: 1 } }, relations: [], plans: [] })
    api.bindings.mockResolvedValue({ bindings: [] })
    api.exerciseUsage.mockResolvedValue({ exercises: [
      { exercise_id: 'e1', name: '低杠位深蹲', exercise_type: 'main_lift', plan_count: 4, coach_count: 2 },
      { exercise_id: 'e2', name: '绳索下压', exercise_type: 'accessory', plan_count: 12, coach_count: 5 },
      { exercise_id: 'e3', name: '暂停卧推', exercise_type: 'main_lift_variation', plan_count: 4, coach_count: 3 },
    ] })
  })

  afterEach(() => {
    act(() => root.unmount())
    host.remove()
    vi.clearAllMocks()
    vi.unstubAllGlobals()
    setLocale('zh')
  })

  it('opens overview with five navigation items, shared pending counts and four key figures', async () => {
    await act(async () => { root.render(<AdminWorkspace onLogout={vi.fn()}/>); await settle() })
    const nav = host.querySelector('nav')!
    expect([...nav.querySelectorAll('button')].filter(b => !b.getAttribute('aria-label')).map(b => b.textContent)).toEqual(['总览', '教练申请2', '用户', '绑定关系', '动作库'])
    expect(host.textContent).not.toContain('计划总览')
    const overview = host.querySelector<HTMLElement>('[data-testid="admin-overview"]')!
    expect(overview).not.toBeNull()
    expect(overview.textContent).toContain('待办2')
    expect(overview.textContent).toContain('王雪 申请成为教练')
    expect(overview.textContent).toContain('陈默 申请成为教练')
    const figures = overview.querySelector('[aria-label="关键数字"]')!
    expect([...figures.children].map(n => n.firstElementChild?.textContent)).toEqual(['教练', '学员', '生效绑定', '待审申请'])
    expect(overview.textContent).not.toContain('已发布计划')
    expect(overview.textContent).not.toContain('最近计划')
    await act(async () => { buttonContaining(overview, '去审核').click(); await settle() })
    expect(host.querySelector('[aria-pressed="true"]')?.textContent).toContain('待处理')
    expect(vi.mocked(fetch).mock.calls.filter(([url]) => String(url).endsWith('/coach-applications'))).toHaveLength(1)
  })

  it('shows email and read-only plan summaries while linked users still open', async () => {
    api.user.mockResolvedValueOnce({ user: { id: 'c1', displayName: '教练甲', role: 'coach', email: 'coach@example.test', phone: null, createdAt: '2026-10-22' }, relations: [{ userId: 's1', displayName: '学员乙', role: 'coached_student', bondAcceptedAt: '2026-10-21' }], plans: [{ id: 'p1', name: '力量积累', status: 'published', weeks: 4, createdAt: '2026-10-20' }] })
    await act(async () => { root.render(<AdminWorkspace onLogout={vi.fn()}/>); await settle() })
    await act(async () => { button(host, '用户').click(); await settle() })
    await act(async () => { buttonContaining(host, '教练甲教练').click(); await settle() })
    const page = host.querySelector<HTMLElement>('[data-testid="admin-user-detail"]')!
    expect(page.textContent).toContain('邮箱coach@example.test')
    expect(page.textContent).toContain('1 份 · 仅显示概要')
    const name = [...page.querySelectorAll('span')].find(n => n.textContent === '力量积累')!
    expect(name.closest('button, a')).toBeNull()
    expect(name.parentElement?.querySelector('svg')).toBeNull()
    await act(async () => { buttonContaining(page, '学员乙').click(); await settle() })
    expect(api.user).toHaveBeenLastCalledWith('s1')
  })

  it('confirms approval once, updates shared counts, tracks approval and clears failed mail after resend', async () => {
    const fetcher = vi.mocked(fetch)
    const getApplications = fetcher.getMockImplementation()!
    fetcher.mockImplementation(async (url, init) => {
      if (String(url).endsWith('/approve')) return new Response(JSON.stringify({ welcome_email_sent: false }))
      if (init?.method === 'POST') return new Response(JSON.stringify({ welcome_email_sent: true }))
      return getApplications(url, init)
    })
    await act(async () => { root.render(<AdminWorkspace onLogout={vi.fn()}/>); await settle() })
    await act(async () => { buttonContaining(host.querySelector('nav')!, '教练申请').click(); await settle() })
    const page = host.querySelector<HTMLElement>('[data-testid="admin-applications"]')!
    await act(async () => { button(page, '通过').click(); await settle() })
    expect(fetcher.mock.calls.filter(([, init]) => init?.method === 'POST')).toHaveLength(0)
    const dialog = host.querySelector<HTMLElement>('dialog, [role="dialog"]')!
    expect(dialog.textContent).toContain('通过王雪的教练申请？')
    expect(dialog.textContent).toContain('用 wang@example.test 创建教练账号')
    expect(dialog.textContent).toContain('生成永久邀请码')
    expect(dialog.textContent).toContain('发送欢迎邮件')
    await act(async () => { button(dialog, '确认通过').click(); button(dialog, '确认通过').click(); await settle() })
    expect(fetcher.mock.calls.filter(([url, init]) => String(url).endsWith('/app-1/approve') && init?.method === 'POST')).toHaveLength(1)
    expect(page.querySelector('tbody')!.textContent).not.toContain('王雪')
    expect(host.querySelector('nav')!.textContent).toContain('教练申请1')
    expect(host.querySelector('[role="status"]')?.textContent).toContain('已通过王雪的申请，但欢迎邮件没发出去')
    const events = fetcher.mock.calls.filter(([url]) => String(url).endsWith('/events'))
    expect(events).toHaveLength(1)
    expect(JSON.parse(String(events[0][1]?.body)).events[0].name).toBe('coach_application_approved')
    await act(async () => { buttonContaining(page, '已通过').click(); await settle() })
    expect(page.querySelector('tbody')!.textContent).toContain('邮件未送达')
    await act(async () => { button(page, '重发邮件').click(); await settle() })
    expect(fetcher.mock.calls.filter(([url, init]) => String(url).endsWith('/app-1/resend') && init?.method === 'POST')).toHaveLength(1)
    expect(page.querySelector('tbody')!.textContent).not.toContain('邮件未送达')
    expect(host.querySelector('[role="status"]')?.textContent).toBe('已重新发送邮件')
    await act(async () => { button(host.querySelector('nav')!, '总览').click(); await settle() })
    const overview = host.querySelector('[data-testid="admin-overview"]')!
    expect(overview.textContent).toContain('待办1')
    expect(overview.textContent).not.toContain('王雪 申请成为教练')
    expect(overview.textContent).toContain('陈默 申请成为教练')
  })

  it('keeps a student-email application pending when review fails', async () => {
    const fetcher = vi.mocked(fetch)
    const getApplications = fetcher.getMockImplementation()!
    fetcher.mockImplementation(async (url, init) => init?.method === 'POST'
      ? new Response(JSON.stringify({ error: 'COACH_APPLICATION_EMAIL_IS_STUDENT' }), { status: 409 })
      : getApplications(url, init))
    await act(async () => { root.render(<AdminWorkspace onLogout={vi.fn()}/>); await settle() })
    await act(async () => { buttonContaining(host.querySelector('nav')!, '教练申请').click(); await settle() })
    const page = host.querySelector<HTMLElement>('[data-testid="admin-applications"]')!
    await act(async () => { button(page, '通过').click(); await settle() })
    await act(async () => { button(host, '确认通过').click(); await settle() })
    expect(host.querySelector('[role="alert"]')?.textContent).toContain('该邮箱已是学员账号')
    expect(page.querySelector('tbody')!.textContent).toContain('王雪')
    expect(page.querySelector('[aria-pressed="true"]')?.textContent).toBe('待处理2')
    expect(host.querySelector('nav')!.textContent).toContain('教练申请2')
    expect(fetcher.mock.calls.filter(([url]) => String(url).endsWith('/events'))).toHaveLength(0)
  })

  it('cancels rejection without posting, then confirms once and supports failed result-email resend', async () => {
    const fetcher = vi.mocked(fetch)
    const getApplications = fetcher.getMockImplementation()!
    fetcher.mockImplementation(async (url, init) => {
      if (String(url).endsWith('/reject')) return new Response(JSON.stringify({ result_email_sent: false }))
      if (init?.method === 'POST') return new Response(JSON.stringify({ result_email_sent: true }))
      return getApplications(url, init)
    })
    await act(async () => { root.render(<AdminWorkspace onLogout={vi.fn()}/>); await settle() })
    await act(async () => { buttonContaining(host.querySelector('nav')!, '教练申请').click(); await settle() })
    const page = host.querySelector<HTMLElement>('[data-testid="admin-applications"]')!
    await act(async () => { button(page, '拒绝').click(); await settle() })
    expect(host.querySelector('dialog')?.textContent).toContain('拒绝王雪的教练申请？')
    expect(host.querySelector('dialog')?.textContent).toContain('将发送结果邮件。')
    await act(async () => { button(host, '取消').click(); await settle() })
    expect(fetcher.mock.calls.filter(([, init]) => init?.method === 'POST')).toHaveLength(0)
    await act(async () => { button(page, '拒绝').click(); await settle() })
    await act(async () => { button(host, '确认拒绝').click(); button(host, '确认拒绝').click(); await settle() })
    expect(fetcher.mock.calls.filter(([url, init]) => String(url).endsWith('/app-1/reject') && init?.method === 'POST')).toHaveLength(1)
    expect(page.querySelector('tbody')!.textContent).not.toContain('王雪')
    expect(host.querySelector('[role="status"]')?.textContent).toContain('已拒绝王雪的申请，但结果邮件没发出去')
    await act(async () => { buttonContaining(page, '已拒绝').click(); await settle() })
    expect(page.querySelector('tbody')!.textContent).toContain('邮件未送达')
    await act(async () => { button(page, '重发邮件').click(); await settle() })
    expect(page.querySelector('tbody')!.textContent).not.toContain('邮件未送达')
    expect(host.querySelector('[role="status"]')?.textContent).toBe('已重新发送邮件')
    expect(fetcher.mock.calls.filter(([url]) => String(url).endsWith('/events'))).toHaveLength(0)
  })

  it('filters all four application states, searches name or email and sorts newest first', async () => {
    vi.mocked(fetch).mockImplementation(async () => new Response(JSON.stringify({ applications: [
      { id: 'old', name: '旧申请', email: 'old@example.test', contact: '', student_count: 0, device: 'android', status: 'pending', created_at: '2026-10-20T09:00:00Z' },
      { id: 'approved', name: '已审教练', email: 'approved@example.test', contact: 'wechat', student_count: 8, device: 'iphone', status: 'approved', created_at: '2026-10-22T09:00:00Z' },
      { id: 'new', name: '新申请', email: 'new@example.test', contact: '', student_count: 3, device: 'both', status: 'pending', created_at: '2026-10-21T09:00:00Z' },
      { id: 'rejected', name: '拒绝申请', email: 'rejected@example.test', contact: '', student_count: 1, device: 'android', status: 'rejected', created_at: '2026-10-19T09:00:00Z' },
    ] })))
    await act(async () => { root.render(<AdminWorkspace onLogout={vi.fn()}/>); await settle() })
    await act(async () => { buttonContaining(host.querySelector('nav')!, '教练申请').click(); await settle() })
    const page = host.querySelector<HTMLElement>('[data-testid="admin-applications"]')!
    const names = () => [...page.querySelectorAll('tbody tr')].map(row => row.querySelector('td span')?.textContent)
    expect(names()).toEqual(['新申请', '旧申请'])
    expect(page.textContent).toContain('iPhone 和安卓')
    expect(page.textContent).toContain('安卓')
    expect(page.textContent).toContain('—')
    for (const [label, expected] of [['已通过1', ['已审教练']], ['已拒绝1', ['拒绝申请']], ['全部4', ['已审教练', '新申请', '旧申请', '拒绝申请']]] as const) {
      await act(async () => { button(page, label).click(); await settle() })
      expect(names()).toEqual(expected)
    }
    const search = page.querySelector<HTMLInputElement>('input')!
    await act(async () => { type(search, ' APPROVED@EXAMPLE.TEST '); await settle() })
    expect(names()).toEqual(['已审教练'])
    await act(async () => { type(search, '新申请'); await settle() })
    expect(names()).toEqual(['新申请'])
    await act(async () => { type(search, 'missing'); await settle() })
    expect(page.textContent).toContain('没有匹配的申请')
    await act(async () => { type(search, ''); button(page, '待处理2').click(); await settle() })
    expect(names()).toEqual(['新申请', '旧申请'])
    expect(vi.mocked(fetch)).toHaveBeenCalledTimes(1)
  })

  it('never labels a failed linked-user load with the previous user identity', async () => {
    api.user.mockResolvedValueOnce({ user: { id: 'c1', displayName: '教练甲', role: 'coach', email: 'coach@example.test', phone: null, createdAt: '2026-10-22' }, relations: [{ userId: 's1', displayName: '学员乙', role: 'coached_student', bondAcceptedAt: '2026-10-21' }], plans: [] })
    let rejectUser!: (reason: Error) => void
    api.user.mockImplementationOnce(() => new Promise((_, reject) => { rejectUser = reject }))
    await act(async () => { root.render(<AdminWorkspace onLogout={vi.fn()}/>); await settle() })
    await act(async () => { button(host, '用户').click(); await settle() })
    await act(async () => { buttonContaining(host, '教练甲教练').click(); await settle() })
    await act(async () => { buttonContaining(host, '学员乙').click(); await settle() })
    expect(host.querySelector('header')?.textContent).toContain('学员乙')
    expect(host.querySelector('header')?.textContent).not.toContain('教练甲')
    await act(async () => { rejectUser(new Error('offline')); await settle() })
    expect(host.querySelector('header')?.textContent).toContain('学员乙')
    expect(host.querySelector('header')?.textContent).not.toContain('教练甲')
  })

  it('keeps failed-mail markers across navigation and clears them on refresh', async () => {
    const item = { id: 'app-1', name: '王雪', email: 'wang@example.test', contact: '', student_count: 12, device: 'iphone', status: 'pending', created_at: '2026-10-22T12:58:00Z' }
    vi.mocked(fetch).mockImplementation(async (_url, init) => {
      if (init?.method === 'POST') { item.status = 'approved'; return new Response(JSON.stringify({ welcome_email_sent: false })) }
      return new Response(JSON.stringify({ applications: [item] }))
    })
    await act(async () => { root.render(<AdminWorkspace onLogout={vi.fn()}/>); await settle() })
    await act(async () => { buttonContaining(host.querySelector('nav')!, '教练申请').click(); await settle() })
    await act(async () => { button(host, '通过').click(); await settle() })
    await act(async () => { button(host, '确认通过').click(); await settle() })
    expect(host.textContent).toContain('没有待处理的申请')
    await act(async () => { button(host.querySelector('nav')!, '总览').click(); await settle() })
    expect(host.textContent).toContain('没有待办')
    await act(async () => { buttonContaining(host.querySelector('nav')!, '教练申请').click(); await settle() })
    await act(async () => { buttonContaining(host, '已通过').click(); await settle() })
    expect(host.querySelector('tbody')!.textContent).toContain('邮件未送达')
    await act(async () => { button(host, '刷新').click(); await settle() })
    expect(host.querySelector('tbody')!.textContent).not.toContain('邮件未送达')
    expect(host.querySelector('tbody')!.textContent).toContain('已通过')
  })

  it('renders English overview, application filters, confirmation and success messages without untranslated copy', async () => {
    setLocale('en')
    api.users.mockResolvedValue({ users: [] })
    vi.mocked(fetch).mockImplementation(async (_url, init) => new Response(JSON.stringify(init?.method === 'POST' ? { welcome_email_sent: true } : { applications: [{ id: 'app', name: 'Alex', email: 'alex@example.test', contact: '', student_count: 2, device: 'android', status: 'pending', created_at: '2026-10-22T12:00:00Z' }] })))
    await act(async () => { root.render(<AdminWorkspace onLogout={vi.fn()}/>); await settle() })
    expect(host.textContent).not.toMatch(/[一-鿿]/)
    expect(host.querySelector('h1')?.textContent).toBe('Overview')
    await act(async () => { buttonContaining(host.querySelector('nav')!, 'Coach applications').click(); await settle() })
    expect(host.textContent).not.toMatch(/[一-鿿]/)
    expect(host.textContent).toContain('Android')
    await act(async () => { button(host, 'Approve').click(); await settle() })
    expect(host.querySelector('dialog')?.textContent).toContain('Approve Alex’s coach application?')
    await act(async () => { button(host, 'Confirm approval').click(); await settle() })
    expect(host.querySelector('[role="status"]')?.textContent).toBe('Approved Alex’s application. Welcome email sent.')
    expect(host.textContent).toContain('No pending applications')
    expect(host.textContent).not.toMatch(/[一-鿿]/)
  })

  it('shows email identities and filters by email without requiring a phone number', async () => {
    api.users.mockResolvedValue({ users: [
      { id: 'email-coach', displayName: '邮箱教练', role: 'coach', phone: null, email: 'coach@example.com', createdAt: '2026-07-18', relation: null },
      { id: 'legacy-student', displayName: '旧学员', role: 'coached_student', phone: '13900000000', email: null, createdAt: '2026-07-17', relation: null },
    ] })
    await act(async () => { root.render(<AdminWorkspace onLogout={vi.fn()}/>); await settle() })
    await act(async () => { button(host, '用户').click(); await settle() })
    const page = host.querySelector<HTMLElement>('[data-testid="admin-users"]')!
    expect(page.textContent).toContain('邮箱')
    expect(buttonContaining(page, '邮箱教练').textContent).toContain('coach@example.com')
    expect(buttonContaining(page, '邮箱教练').textContent).toContain('—')
    expect(buttonContaining(page, '旧学员').textContent).toContain('—')
    const search = page.querySelector<HTMLInputElement>('input')!
    expect(search.placeholder).toBe('搜索姓名、邮箱或手机号')
    await act(async () => { type(search, ' COACH@EXAMPLE.COM '); await settle() })
    expect(page.textContent).toContain('邮箱教练')
    expect(page.textContent).not.toContain('旧学员')
    await act(async () => { type(search, '139 0000'); await settle() })
    expect(page.textContent).toContain('旧学员')
    expect(page.textContent).not.toContain('邮箱教练')
    await act(async () => { type(search, '邮箱教练'); await settle() })
    expect(page.textContent).toContain('coach@example.com')
    await act(async () => { button(page, '有教练学员').click(); await settle() })
    expect(page.textContent).toContain('没有匹配的用户。')
  })

  it('filters locally and preserves list back-navigation', async () => {
    await act(async () => { root.render(<AdminWorkspace onLogout={vi.fn()}/>); await settle() })

    await act(async () => { button(host, '用户').click(); await settle() })
    const search = host.querySelector<HTMLInputElement>('input[placeholder="搜索姓名、邮箱或手机号"]')
    expect(search).not.toBeNull()
    await act(async () => { if (search) type(search, '139'); await settle() })
    expect(host.textContent).toContain('13900000000')
    expect(host.textContent).not.toContain('13800000000')

    await act(async () => { if (search) type(search, ''); await settle(); buttonContaining(host, '教练甲教练').click(); await settle() })
    expect(host.querySelector('[data-testid="admin-user-detail"]')).not.toBeNull()
    expect(host.textContent).not.toContain('DANGER // 管理操作')
    await act(async () => { const back = host.querySelector<HTMLButtonElement>('header button'); back?.click(); await settle() })
    expect(host.querySelector('[data-testid="admin-users"]')).not.toBeNull()

  })

  it('loads the read-only exercise library, sorts by plan usage, and filters locally', async () => {
    await act(async () => { root.render(<AdminWorkspace onLogout={vi.fn()}/>); await settle() })
    await act(async () => { button(host, '动作库').click(); await settle() })

    expect(api.exerciseUsage).toHaveBeenCalledTimes(1)
    const page = host.querySelector<HTMLElement>('[data-testid="admin-exercises"]')!
    expect(page.textContent).toContain('动作名类型使用计划数使用教练数')
    const names = [...page.querySelectorAll('.grid.h-12 span:first-child')].map((item) => item.textContent)
    expect(names).toEqual(['绳索下压', '低杠位深蹲', '暂停卧推'])
    expect(page.textContent).toContain('辅助动作')
    expect(page.querySelector('button:not([type="button"])')).toBeNull()

    const search = page.querySelector<HTMLInputElement>('input[placeholder="搜索动作名或类型"]')!
    await act(async () => { type(search, '暂停'); await settle() })
    expect(page.textContent).toContain('暂停卧推')
    expect(page.textContent).not.toContain('绳索下压')
    expect(page.textContent).not.toContain('低杠位深蹲')
  })
})
