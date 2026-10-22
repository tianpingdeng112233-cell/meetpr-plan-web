import { useState, type ReactNode, type FormEvent } from 'react'
import { submitCoachApplication, resendCoachApplication, type ApplicationDevice } from '../../api/onboarding'
import { text, errorText } from './text'
import './onboarding.css'
import { trackOnboarding } from './telemetry'

export function OnboardingFrame({ title, children }: { title: string; children: ReactNode }) {
  return <main className="onboarding"><div className="onboarding-wrap"><header className="onboarding-brand"><a href="/">MeetPR</a><span>{text('内测入驻', 'Beta onboarding')}</span></header><h1>{title}</h1>{children}</div></main>
}
export function CoachApplicationPage() {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [receipt, setReceipt] = useState<{ email: string; sent: boolean } | null>(null)
  const [resent, setResent] = useState(false)
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault(); setBusy(true); setError('')
    const fields = new FormData(e.currentTarget)
    const email = String(fields.get('email')).trim()
    try {
      const result = await submitCoachApplication({ name: String(fields.get('name')).trim(), email, contact: String(fields.get('contact') ?? '').trim(), student_count: Number(fields.get('student_count')), device: fields.get('device') as ApplicationDevice })
      setReceipt({ email, sent: result.receipt_email_sent }); trackOnboarding('coach_application_submitted')
    } catch (err) { setError(errorText(err)) } finally { setBusy(false) }
  }
  return <OnboardingFrame title={text('申请成为 MeetPR 内测教练', 'Apply to coach with MeetPR')}>
    {receipt ? <section aria-live="polite"><h2>{text('已收到你的申请', 'Application received')}</h2><p>{text('通常 1 个工作日内处理，结果会发到', 'We usually review within one business day. We’ll email the result to')} <strong>{receipt.email}</strong>。</p>{!receipt.sent && <><p>{text('确认邮件暂未送达，申请已保存。你可以重新发送确认邮件。', 'Your application is saved, but the receipt email was not delivered. You can resend it.')}</p><button disabled={busy || resent} onClick={async () => { setBusy(true); setError(''); try { await resendCoachApplication(receipt.email); setResent(true) } catch (err) { setError(errorText(err)) } finally { setBusy(false) } }}>{resent ? text('已请求重新发送', 'Resend requested') : text('重新发送', 'Resend')}</button></>}</section>
      : <><p className="onboarding-lead">{text('留下联系方式。审核通过后，你会收到设置密码、安装 App 和邀请学员的说明。', 'Leave your details. Once approved, you’ll receive instructions to set your password, install the app, and invite students.')}</p><form onSubmit={submit} className="onboarding-form">
        <label>{text('姓名', 'Name')}<input name="name" required maxLength={100} autoComplete="name" /></label>
        <label>{text('邮箱', 'Email')}<input name="email" type="email" required maxLength={320} autoComplete="email" autoCapitalize="none" /></label>
        <label>{text('手机或微信（选填）', 'Phone or WeChat (optional)')}<input name="contact" maxLength={200} /></label>
        <label>{text('大概带多少学员', 'Approximate number of students')}<input name="student_count" type="number" min={0} max={100000} required inputMode="numeric" /></label>
        <label>{text('学员主要用什么手机', 'What phones do most of your athletes use?')}<select name="device" defaultValue="iphone"><option value="iphone">iPhone</option><option value="android">{text('安卓', 'Android')}</option><option value="both">{text('都有', 'Both')}</option></select></label>
        <button type="submit" className="onboarding-primary" disabled={busy}>{busy ? text('提交中…', 'Submitting…') : text('提交申请', 'Submit application')}</button>
      </form></>}
    {error && <p role="alert" className="onboarding-error">{error}</p>}<p className="onboarding-footnote"><a href="/">{text('已有账号？登录网页', 'Already have an account? Sign in')}</a></p>
  </OnboardingFrame>
}
