import { useEffect, useRef, useState } from 'react'
import { getPublicInvite } from '../../api/onboarding'
import { OnboardingFrame } from './OnboardingPages'
import { InstallOptions, visitorDevice } from './install'
import { text, zhText } from './text'
import { trackOnboarding } from './telemetry'

export const groupedCode = (code: string) => `${code.slice(0, 4)} ${code.slice(4, 7)} ${code.slice(7)}`
export function InviteLandingPage({ code }: { code: string }) {
  const [result, setResult] = useState<{ valid: boolean; coach_display_name: string | null } | null>(null)
  const [unreachable, setUnreachable] = useState(false)
  const tracked = useRef(false)
  const validFormat = /^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{10}$/.test(code)
  useEffect(() => {
    let cancelled = false
    if (!tracked.current) { trackOnboarding('invite_landing_open', { device: visitorDevice().device, in_wechat: visitorDevice().inWechat }); tracked.current = true }
    setResult(null); setUnreachable(false)
    if (validFormat) void getPublicInvite(code).then(value => { if (!cancelled) setResult(value) }, () => { if (!cancelled) setUnreachable(true) })
    return () => { cancelled = true }
  }, [code, validFormat])
  const invalid = !validFormat || result?.valid === false
  const name = result?.coach_display_name
  return <OnboardingFrame title={invalid ? text('邀请已失效', 'Invitation expired') : name ? text(zhText`${name} 邀请你加入 MeetPR`, `${name} invites you to MeetPR`) : text('邀请你加入 MeetPR', 'You’re invited to MeetPR')}>
    {invalid ? <p>{text('这个邀请已经失效，请联系你的教练要一个新的', 'This invitation is no longer valid. Ask your coach for a new one.')}</p> : <>
      <p className="onboarding-code" aria-label={text('邀请码', 'Invite code')}>{groupedCode(code)}</p>
      {!result && !unreachable ? <p role="status">{text('正在确认邀请码…', 'Checking invitation…')}</p> : <>{unreachable && <p role="status">{text('暂时无法确认教练信息，你仍可以安装 App 并使用上方邀请码。', 'We cannot load the coach details right now. You can still install the app and use the code above.')}</p>}<section><InstallOptions code={code} /></section></>}
      <ol><li>{text('安装 App', 'Install the app')}</li><li>{text('打开后注册账号', 'Open it and create an account')}</li><li>{text('在「输入邀请码」那一页点「粘贴邀请码」，然后提交。教练确认后就能看到训练计划。', 'On the invite code screen, tap Paste and submit. Your plan appears once your coach accepts.')}</li></ol>
    </>}
  </OnboardingFrame>
}
