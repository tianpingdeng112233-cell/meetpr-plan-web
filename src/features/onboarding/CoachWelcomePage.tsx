import { useEffect, useState } from 'react'
import { currentUser } from '../../api/auth'
import { ApiException, request } from '../../api/client'
import { activePermanentCode, getInviteCodes } from '../../api/invite'
import { getPublicInvite } from '../../api/onboarding'
import type { AuthUser } from '../../api/types'
import { LoginScreen } from '../auth/LoginScreen'
import { OnboardingFrame } from './OnboardingPages'
import { groupedCode } from './InviteLandingPage'
import { copyText, InstallOptions, QrImage } from './install'
import { text, errorText } from './text'

// Mirrors RN RnExtras.json coach.invites.message, including the Paste button label.
export function invitationMessage(link: string, code: string, name?: string | null) {
  const coach = name?.trim() || text('教练', 'Coach')
  return text(`我在用 MeetPR 给你排训练计划和看动作视频。\n1. 点这个链接安装 App：${link}\n2. 打开 App 注册账号\n3. 在「输入邀请码」页点「粘贴邀请码」，或输入：${groupedCode(code)}\n我这边确认后你就能看到训练计划了。—— ${coach}`, `I'm using MeetPR to plan your training and review your lift videos.\n1. Install the app: ${link}\n2. Open it and create an account\n3. On the invite code screen, tap Paste invite code, or enter: ${groupedCode(code)}\nOnce I accept, your plan will show up. — ${coach}`)
}
export function CoachWelcomePage() {
  const [user, setUser] = useState<AuthUser | null>(() => currentUser())
  const [data, setData] = useState<{ email: string | null; code: string | null; name: string | null } | null>(null)
  const [error, setError] = useState('')
  const [copyStatus, setCopyStatus] = useState('')
  const [attempt, setAttempt] = useState(0)
  useEffect(() => {
    if (!user || user.role !== 'coach') return
    let cancelled = false; setData(null); setError('')
    void Promise.all([request<{ user: { email: string | null; role: string } }>('/me'), getInviteCodes()]).then(async ([me, codes]) => {
      if (me.user.role !== 'coach') throw new Error('NOT_COACH')
      const code = activePermanentCode(codes)?.code ?? null
      const invite = code ? await getPublicInvite(code) : null
      if (!cancelled) setData({ email: me.user.email, code: invite?.valid ? code : null, name: invite?.coach_display_name ?? null })
    }).catch(err => {
      if (cancelled) return
      if (err instanceof ApiException && err.status === 401) setUser(null)
      else setError(errorText(err))
    })
    return () => { cancelled = true }
  }, [user, attempt])
  if (!user) return <LoginScreen onLogin={setUser} onSampleMode={() => window.location.assign('/')} />
  if (user.role !== 'coach') return <OnboardingFrame title={text('教练入驻指南', 'Coach onboarding')}><p>{text('此页面仅供教练使用。', 'This page is for coaches only.')}</p><a href="/">{text('返回工作台', 'Back to workspace')}</a></OnboardingFrame>
  const link = data?.code ? `${window.location.origin}/i/${data.code}` : ''
  return <OnboardingFrame title={text('欢迎加入 MeetPR 内测', 'Welcome to the MeetPR beta')}>
    <p className="onboarding-lead">{text('装好 App，开始排计划，再把邀请发给学员。这份指南随时可以回来查看。', 'Install the app, start planning, and invite your students. You can return to this guide anytime.')}</p>
    {error ? <><p role="alert" className="onboarding-error">{error}</p><button onClick={() => setAttempt(n => n + 1)}>{text('重新加载', 'Retry')}</button></> : !data ? <p role="status">{text('正在加载账号信息…', 'Loading account…')}</p> : <>
      <section id="install"><h2>{text('1. 装 App', '1. Install the app')}</h2><InstallOptions /><p>{text('装好后选「登录」，用', 'After installing, choose Sign in and use')} <strong>{data.email ?? text('你的账号', 'your account')}</strong> {text('和刚设的密码。不要点「注册」——注册出来的是学员账号。', 'with your password. Do not choose Sign up: that creates a student account.')}</p></section>
      <section><h2>{text('2. 网页排计划', '2. Plan on the web')}</h2><p>{text('在电脑上打开教练网页，使用申请内测时的邮箱和已设置的密码登录，即可管理学员、编辑和发布训练计划。', 'Open the coach website on your computer and sign in with your beta application email and the password you set to manage students, edit and publish plans.')}</p><a href="/coach/login" className="onboarding-button onboarding-primary">{text('登录教练网页', 'Sign in to the coach website')}</a></section>
      <section id="invite"><h2>{text('3. 邀请学员', '3. Invite students')}</h2>{data.code ? <><p className="onboarding-link"><a href={link}>{link}</a></p><QrImage value={link} label={text('学员邀请二维码', 'Student invitation QR')} downloadable /><div className="onboarding-actions"><button className="onboarding-primary" onClick={async () => { try { await copyText(invitationMessage(link, data.code!, data.name)); setCopyStatus(text('邀请消息已复制，可以发给学员了。', 'Invitation copied. Send it to your students.')) } catch { setCopyStatus(text('无法自动复制，请手动选择下方完整消息复制。', 'Could not copy. Select and copy the full message below.')) } }}>{text('复制邀请消息', 'Copy invitation')}</button></div>{copyStatus && <p role="status">{copyStatus}</p>}<details><summary>{text('查看邀请消息', 'View invitation message')}</summary><p style={{ whiteSpace: 'pre-wrap' }}>{invitationMessage(link, data.code, data.name)}</p></details><p className="onboarding-footnote">{text('这条链接可以发给所有学员，长期有效；学员提交后，你在 App「接收」里确认即可。', 'Share this permanent link with all your students. After they submit, accept them in the app.')}</p></> : <p>{text('暂时没有有效的永久邀请码。请在 App 邀请码页面生成后回来刷新。', 'No active permanent invite is available. Generate one in the app, then refresh this page.')}</p>}</section>
    </>}
  </OnboardingFrame>
}
