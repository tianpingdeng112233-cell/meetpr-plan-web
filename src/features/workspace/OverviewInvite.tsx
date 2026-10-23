import { useEffect, useState } from 'react'
import { S } from '../../i18n/strings'
import { invitationLink, invitationMessage, loadCoachInvitation, noInvitationMessage } from '../onboarding/invitation'
import { copyText, QrImage } from '../onboarding/install'
import { errorText, text } from '../onboarding/text'

export function OverviewInvite({ loadInvitation = loadCoachInvitation }: { loadInvitation?: typeof loadCoachInvitation }) {
  const [downloadContainer, setDownloadContainer] = useState<HTMLSpanElement | null>(null)
  const [data, setData] = useState<Awaited<ReturnType<typeof loadCoachInvitation>> | null>(null)
  const [error, setError] = useState('')
  const [status, setStatus] = useState('')
  const [attempt, setAttempt] = useState(0)
  useEffect(() => {
    let alive = true
    setError('')
    void loadInvitation().then(next => { if (alive) setData(next) }, error => { if (alive) setError(errorText(error)) })
    return () => { alive = false }
  }, [attempt, loadInvitation])
  const link = data?.code ? invitationLink(data.code) : ''
  const copy = async (value: string, linkOnly = false) => {
    try { await copyText(value); setStatus(linkOnly ? S.workspace.overview.linkCopied : text('邀请消息已复制，可以发给学员了。', 'Invitation copied. Send it to your students.')) }
    catch { setStatus(text('无法自动复制，请手动选择下方完整消息复制。', 'Could not copy. Select and copy the full message below.')) }
  }
  return <section className="overview-invite">
    <h2>{S.workspace.overview.invite}</h2>
    <ol>{S.workspace.overview.steps.map((step, i) => <li key={i}><b>{i + 1}</b><span>{step}</span></li>)}</ol>
    {error ? <p role="alert">{error} <button onClick={() => setAttempt(n => n + 1)}>{S.common.retry}</button></p>
      : !data ? <p role="status">{S.common.loadingEllipsis}</p>
        : !data.code ? <p>{noInvitationMessage()}</p> : <div className="overview-invitation">
          <div className="overview-invitation-copy"><small>{S.workspace.overview.codeHint}</small><strong>{data.code}</strong>
            <a href={link}>{link}</a>
            <div className="overview-invitation-actions">
              <button className="primary" onClick={() => void copy(invitationMessage(link, data.code!, data.name))}>{text('复制邀请消息', 'Copy invitation')}</button>
              <button onClick={() => void copy(link, true)}>{S.workspace.overview.copyLink}</button>
              <span ref={setDownloadContainer} />
            </div>
            {status && <><p role="status">{status}</p><details><summary>{text('查看邀请消息', 'View invitation message')}</summary><p style={{ whiteSpace: 'pre-wrap' }}>{invitationMessage(link, data.code, data.name)}</p></details></>}
          </div>
          <QrImage value={link} label={text('学员邀请二维码', 'Student invitation QR')} downloadable downloadContainer={downloadContainer} downloadLabel={S.workspace.overview.downloadQr} />
        </div>}
  </section>
}
