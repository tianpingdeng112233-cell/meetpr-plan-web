import { useEffect, useState } from 'react'
import { acceptBindRequest, getInviteCodes, rejectBindRequest } from '../../api/coach'
import type { CoachBindRequest, InviteCode } from '../../api/types'
import { kg, profileLine, shortDate, techniqueStyleLine } from './WorkspaceCommon'
import { resolveLocale, S } from '../../i18n/strings'

export const REQUEST_POLL_INTERVAL_MS = 60_000

interface Props {
  requests: CoachBindRequest[]
  onRequestsChanged: (rows: CoachBindRequest[]) => void
  onAccepted: () => void | Promise<void>
}

function requestTime(value: string): string {
  const parts = new Intl.DateTimeFormat(resolveLocale() === 'zh' ? 'zh-CN' : 'en-US', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(new Date(value))
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)?.value ?? '—'
  return resolveLocale() === 'zh'
    ? `${part('month')}-${part('day')} ${part('hour')}:${part('minute')}`
    : `${part('month')} ${part('day')}, ${part('hour')}:${part('minute')}`
}

function requestSummary(request: CoachBindRequest): string {
  const profile = request.onboarding
  const training = profile.training_years == null ? S.workspace.requests.experienceMissing : S.workspace.trainingYears(profile.training_years)
  return S.workspace.requests.selfReportSummary(kg(profile.squat_1rm_kg), kg(profile.bench_1rm_kg), kg(profile.deadlift_1rm_kg), training)
}

function toast(message: string) {
  window.dispatchEvent(new CustomEvent('meetpr:toast', { detail: message }))
}

export function RequestsPage({ requests, onRequestsChanged, onAccepted }: Props) {
  const [open, setOpen] = useState<Set<string>>(new Set())
  const [busy, setBusy] = useState('')
  const [codes, setCodes] = useState<InviteCode[]>([])
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    void getInviteCodes().then(setCodes).catch(() => setCodes([]))
  }, [])

  useEffect(() => {
    if (!copied) return
    const timer = window.setTimeout(() => setCopied(false), 1600)
    return () => window.clearTimeout(timer)
  }, [copied])

  const personal = codes.find((code) => code.type === 'personal_permanent' && !code.revoked_at)
    ?? codes.find((code) => !code.revoked_at)
  const remove = (id: string) => onRequestsChanged(requests.filter((request) => request.id !== id))

  const accept = async (request: CoachBindRequest) => {
    setBusy(request.id)
    try {
      await acceptBindRequest(request.id)
      remove(request.id)
      await onAccepted()
    } finally {
      setBusy('')
    }
  }

  const reject = async (request: CoachBindRequest) => {
    if (!window.confirm(S.workspace.requests.rejectConfirm(request.display_name))) return
    setBusy(request.id)
    try {
      await rejectBindRequest(request.id)
      remove(request.id)
    } finally {
      setBusy('')
    }
  }

  const copyInviteCode = async () => {
    if (!personal) return
    try {
      if (!navigator.clipboard) throw new Error('Clipboard API unavailable')
      await navigator.clipboard.writeText(personal.code)
      setCopied(true)
      toast(S.workspace.requests.copied)
    } catch {
      toast(S.workspace.requests.copyFailed)
    }
  }

  const toggle = (id: string) => {
    setOpen((previous) => {
      const next = new Set(previous)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  return (
    <main className="data-page requests-page">
      <header className="requests-head">
        <h1>{S.workspace.requests.pending}</h1>
        <span className="requests-count">{S.workspace.requests.requestCount(requests.length)}</span>
        <span className="requests-refresh">
          <i aria-hidden="true" />
          {S.workspace.requests.autoRefresh(REQUEST_POLL_INTERVAL_MS / 1000)}
        </span>
      </header>

      <div className="request-list">
        {requests.length === 0 && (
          <div className="requests-empty">
            <span>{S.workspace.requests.empty}</span>
            <small>{S.workspace.requests.emptyHint}</small>
          </div>
        )}
        {requests.map((request) => {
          const profile = request.onboarding
          const expanded = open.has(request.id)
          const processing = busy === request.id
          return (
            <section className={`request-card${expanded ? ' expanded' : ''}`} key={request.id}>
              <div
                className="request-row"
                role="button"
                tabIndex={0}
                aria-expanded={expanded}
                onClick={() => toggle(request.id)}
                onKeyDown={(event) => {
                  if (event.target !== event.currentTarget) return
                  if (event.key !== 'Enter' && event.key !== ' ') return
                  event.preventDefault()
                  toggle(request.id)
                }}
              >
                <span className="request-avatar">{request.display_name.slice(0, 1)}</span>
                <span className="request-who">
                  <b>{request.display_name}</b>
                  <small>{request.masked_phone || S.workspace.requests.phoneMissing} · {requestTime(request.submitted_at)} {S.workspace.requests.inviteCode(request.invite_code || '—')}</small>
                  <span>{requestSummary(request)}</span>
                </span>
                <button
                  type="button"
                  className="request-reject"
                  disabled={processing}
                  onClick={(event) => {
                    event.stopPropagation()
                    void reject(request)
                  }}
                >{S.workspace.requests.reject}</button>
                <button
                  type="button"
                  className="accept"
                  disabled={processing}
                  onClick={(event) => {
                    event.stopPropagation()
                    void accept(request)
                  }}
                >{processing ? S.workspace.requests.processing : S.workspace.requests.accept}</button>
              </div>
              {expanded && (
                <div className="request-detail">
                  <h3>{S.workspace.requests.onboarding}</h3>
                  <div>
                    <span><small>{S.workspace.requests.basics}</small><b>{profileLine(profile)}</b></span>
                    <span><small>{S.workspace.requests.experience}</small><b>{profile.training_years != null ? S.workspace.requests.yearsAndDays(profile.training_years, profile.training_days?.length ?? '—') : S.common.notProvided}</b></span>
                    <span><small>{S.workspace.requests.selfReported1rm}</small><b>S {kg(profile.squat_1rm_kg)} / B {kg(profile.bench_1rm_kg)} / D {kg(profile.deadlift_1rm_kg)}</b></span>
                    <span><small>{S.workspace.requests.techniqueStyle}</small><b>{techniqueStyleLine(profile)}</b></span>
                    <span><small>{S.workspace.requests.injuries}</small><b>{profile.injury_notes || profile.injury_areas?.join('、') || S.common.noInjury}</b></span>
                    <span><small>{S.workspace.requests.competition}</small><b>{profile.is_competing ? `${shortDate(profile.competition_date)} · ${profile.target_weight_class || S.workspace.requests.levelMissing}` : S.workspace.requests.notCompeting}</b></span>
                  </div>
                  {profile.note_to_coach && <blockquote>“{profile.note_to_coach}”</blockquote>}
                </div>
              )}
            </section>
          )
        })}
      </div>

      <footer className="invite-footer">
        <span>{S.workspace.requests.myInvite}</span>
        <b>{personal?.code ?? S.workspace.requests.noInvite}</b>
        <button type="button" disabled={!personal} onClick={() => { void copyInviteCode() }}>
          {copied ? S.workspace.requests.copiedShort : S.workspace.requests.copy}
        </button>
      </footer>
    </main>
  )
}
