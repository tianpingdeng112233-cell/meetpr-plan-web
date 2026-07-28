import { useEffect, useState } from 'react'
import { acceptBindRequest, getInviteCodes, rejectBindRequest } from '../../api/coach'
import type { CoachBindRequest, InviteCode } from '../../api/types'
import { kg, profileLine, shortDate, techniqueStyleLine } from './WorkspaceCommon'

export const REQUEST_POLL_INTERVAL_MS = 60_000

interface Props {
  requests: CoachBindRequest[]
  onRequestsChanged: (rows: CoachBindRequest[]) => void
  onAccepted: () => void | Promise<void>
}

function requestTime(value: string): string {
  const parts = new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(new Date(value))
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)?.value ?? '—'
  return `${part('month')}-${part('day')} ${part('hour')}:${part('minute')}`
}

function requestSummary(request: CoachBindRequest): string {
  const profile = request.onboarding
  const training = profile.training_years == null ? '训练年限未填写' : `训练 ${profile.training_years} 年`
  return `自报 S ${kg(profile.squat_1rm_kg)} / B ${kg(profile.bench_1rm_kg)} / D ${kg(profile.deadlift_1rm_kg)} · ${training}`
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
    if (!window.confirm(`拒绝 ${request.display_name} 的申请？`)) return
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
      toast('邀请码已复制')
    } catch {
      toast('复制失败，请手动复制邀请码')
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
        <h1>待处理申请</h1>
        <span className="requests-count">{requests.length} 条</span>
        <span className="requests-refresh">
          <i aria-hidden="true" />
          {REQUEST_POLL_INTERVAL_MS / 1000}s 自动刷新
        </span>
      </header>

      <div className="request-list">
        {requests.length === 0 && (
          <div className="requests-empty">
            <span>暂无待处理申请</span>
            <small>把下方邀请码发给学员，他们注册后会出现在这里</small>
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
                  <small>{request.masked_phone || '手机号未提供'} · {requestTime(request.submitted_at)} · 邀请码 {request.invite_code || '—'}</small>
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
                >拒绝</button>
                <button
                  type="button"
                  className="accept"
                  disabled={processing}
                  onClick={(event) => {
                    event.stopPropagation()
                    void accept(request)
                  }}
                >{processing ? '处理中…' : '接受'}</button>
              </div>
              {expanded && (
                <div className="request-detail">
                  <h3>ONBOARDING · 学员自填</h3>
                  <div>
                    <span><small>基础</small><b>{profileLine(profile)}</b></span>
                    <span><small>训练年限</small><b>{profile.training_years != null ? `${profile.training_years} 年 · 每周 ${profile.training_days?.length ?? '—'} 天` : '未填写'}</b></span>
                    <span><small>自报 1RM</small><b>S {kg(profile.squat_1rm_kg)} / B {kg(profile.bench_1rm_kg)} / D {kg(profile.deadlift_1rm_kg)}</b></span>
                    <span><small>技术风格</small><b>{techniqueStyleLine(profile)}</b></span>
                    <span><small>伤病</small><b>{profile.injury_notes || profile.injury_areas?.join('、') || '无'}</b></span>
                    <span><small>备赛</small><b>{profile.is_competing ? `${shortDate(profile.competition_date)} · ${profile.target_weight_class || '未填级别'}` : '暂不备赛'}</b></span>
                  </div>
                  {profile.note_to_coach && <blockquote>“{profile.note_to_coach}”</blockquote>}
                </div>
              )}
            </section>
          )
        })}
      </div>

      <footer className="invite-footer">
        <span>我的邀请码</span>
        <b>{personal?.code ?? '暂无可用邀请码'}</b>
        <button type="button" disabled={!personal} onClick={() => { void copyInviteCode() }}>
          {copied ? '已复制' : '复制'}
        </button>
      </footer>
    </main>
  )
}
