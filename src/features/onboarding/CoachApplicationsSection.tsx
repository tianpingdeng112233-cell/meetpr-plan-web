import { useEffect, useState } from 'react'
import { getCoachApplications, reviewCoachApplication, type CoachApplication } from '../../api/onboarding'
import { text, errorText, zhText } from './text'
import { trackOnboarding } from './telemetry'
import './onboarding.css'

export function CoachApplicationsSection() {
  const [applications, setApplications] = useState<CoachApplication[] | null>(null)
  const [error, setError] = useState('')
  const [messages, setMessages] = useState<Record<string, string>>({})
  const [confirm, setConfirm] = useState<{ id: string; action: 'approve' | 'reject' } | null>(null)
  const [busy, setBusy] = useState(false)
  const [attempt, setAttempt] = useState(0)
  useEffect(() => {
    let cancelled = false; setError('')
    void getCoachApplications().then(items => { if (!cancelled) setApplications(items) }, err => { if (!cancelled) setError(errorText(err)) })
    return () => { cancelled = true }
  }, [attempt])
  async function review(id: string, action: 'approve' | 'reject' | 'resend') {
    setBusy(true); setError('')
    try {
      const result = await reviewCoachApplication(id, action)
      const failed = result.welcome_email_sent === false || result.result_email_sent === false
      setMessages(prev => ({ ...prev, [id]: failed ? text('处理已保存，邮件暂未送达，请重新发送邮件。', 'Saved, but the email was not delivered. Resend the email.') : text('操作成功，邮件已发送。', 'Done. Email sent.') }))
      if (action !== 'resend') {
        setApplications(prev => prev?.map(item => item.id === id ? { ...item, status: action === 'approve' ? 'approved' : 'rejected' } : item) ?? null)
        if (action === 'approve') trackOnboarding('coach_application_approved')
      }
      setConfirm(null)
    } catch (err) { setError(errorText(err)) } finally { setBusy(false) }
  }
  return <section className="onboarding-admin"><div className="flex items-center justify-between gap-4"><h2>{text('教练申请', 'Coach applications')}</h2><button disabled={busy} onClick={() => setAttempt(n => n + 1)}>{text('刷新', 'Refresh')}</button></div>
    {error && <p role="alert" className="onboarding-error">{error}</p>}{!applications && !error && <p role="status">{text('正在加载申请…', 'Loading applications…')}</p>}{applications?.length === 0 && <p>{text('暂时没有教练申请。', 'No coach applications yet.')}</p>}
    {applications?.map(item => <article key={item.id}>
      <h3 className="font-semibold">{item.name} · {text(item.status === 'pending' ? '待处理' : item.status === 'approved' ? '已通过' : '已拒绝', item.status)}</h3><p>{item.email}</p><p>{text('联系方式', 'Contact')}: {item.contact || '—'} · {text('学员', 'Students')}: {item.student_count} · {item.device === 'both' ? text('iPhone 和安卓', 'iPhone and Android') : item.device}</p><p className="text-xs">{new Date(item.created_at).toLocaleString()}</p>
      {confirm?.id === item.id ? <div role="dialog" aria-label={text('确认处理申请', 'Confirm application review')} aria-describedby={`confirm-${item.id}`}><p id={`confirm-${item.id}`}>{confirm.action === 'approve' ? text(zhText`确认通过 ${item.name} 的申请？将创建教练账号、永久邀请码，并发送欢迎邮件。`, `Approve ${item.name}? This creates a coach account, a permanent invitation, and sends a welcome email.`) : text(zhText`确认拒绝 ${item.name} 的申请？将发送结果邮件。`, `Reject ${item.name}? The result will be emailed.`)}</p><div className="onboarding-actions"><button autoFocus disabled={busy} onClick={() => void review(item.id, confirm.action)}>{confirm.action === 'approve' ? text('确认通过', 'Confirm approval') : text('确认拒绝', 'Confirm rejection')}</button><button disabled={busy} onClick={() => setConfirm(null)}>{text('取消', 'Cancel')}</button></div></div>
        : <div className="onboarding-actions">{item.status === 'pending' ? <><button disabled={busy} onClick={() => setConfirm({ id: item.id, action: 'approve' })}>{text('通过', 'Approve')}</button><button disabled={busy} onClick={() => setConfirm({ id: item.id, action: 'reject' })}>{text('拒绝', 'Reject')}</button></> : <button disabled={busy} onClick={() => void review(item.id, 'resend')}>{text('重新发送邮件', 'Resend email')}</button>}</div>}
      {messages[item.id] && <p role="status">{messages[item.id]}</p>}
    </article>)}
  </section>
}
