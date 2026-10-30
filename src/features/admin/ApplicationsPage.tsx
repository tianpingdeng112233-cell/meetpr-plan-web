import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react'
import { reviewCoachApplication, type ApplicationDevice, type CoachApplication } from '../../api/onboarding'
import { EmptyState, ErrorState, SkeletonRows } from '../../components/states'
import { S } from '../../i18n/strings'
import { errorText } from '../onboarding/text'
import { trackOnboarding } from '../onboarding/telemetry'

export const applicationDevice = (device: ApplicationDevice) => S.admin.applications.devices[device]

type Props = {
  applications: CoachApplication[] | null
  loading: boolean
  error: boolean
  retry: () => void
  onChange: Dispatch<SetStateAction<CoachApplication[] | null>>
  mailFailures: Record<string, boolean>
  onMailResult: Dispatch<SetStateAction<Record<string, boolean>>>
  busy: boolean
  onBusyChange: (busy: boolean) => void
  onToast: (message: string) => void
}

type Filter = CoachApplication['status'] | 'all'

export function ApplicationsPage({ applications, loading, error, retry, onChange, onToast, mailFailures, onMailResult, busy, onBusyChange }: Props) {
  const [filter, setFilter] = useState<Filter>('pending')
  const [search, setSearch] = useState('')
  const [confirm, setConfirm] = useState<{ item: CoachApplication; action: 'approve' | 'reject' } | null>(null)
  const [reviewError, setReviewError] = useState('')
  const inFlight = useRef(false)
  const labels = S.admin.applications
  async function review(item: CoachApplication, action: 'approve' | 'reject' | 'resend') {
    if (inFlight.current || busy) return
    inFlight.current = true
    onBusyChange(true)
    setReviewError('')
    try {
      const result = await reviewCoachApplication(item.id, action)
      const failed = result.welcome_email_sent === false || result.result_email_sent === false
      onMailResult(previous => ({ ...previous, [item.id]: failed }))
      if (action !== 'resend') {
        onChange(previous => previous?.map(row => row.id === item.id ? { ...row, status: action === 'approve' ? 'approved' : 'rejected' } : row) ?? null)
        if (action === 'approve') trackOnboarding('coach_application_approved')
      }
      onToast(action === 'approve' ? (failed ? labels.approvedFailed(item.name) : labels.approvedSent(item.name)) : action === 'reject' ? (failed ? labels.rejectedFailed(item.name) : labels.rejectedSent(item.name)) : failed ? labels.resendFailed : labels.resent)
      setConfirm(null)
    } catch (err) {
      setReviewError(errorText(err))
      setConfirm(null)
    } finally {
      inFlight.current = false
      onBusyChange(false)
    }
  }
  const query = search.trim().toLocaleLowerCase()
  const rows = (applications ?? []).filter(item => (filter === 'all' || item.status === filter) && (!query || item.name.toLocaleLowerCase().includes(query) || item.email.toLocaleLowerCase().includes(query))).sort((a, b) => b.created_at.localeCompare(a.created_at))
  return <div className="flex flex-col gap-5" data-testid="admin-applications">
    {reviewError && <p role="alert" className="rounded-md border border-[#F2D9A6] bg-[#FEF3C7] px-4 py-3 text-[#A15C00]">{reviewError}</p>}
    <div className="flex flex-wrap items-center gap-3">
      <div role="group" aria-label={labels.filters} className="flex gap-0.5 rounded-md border border-border p-0.5">
        {(['pending', 'approved', 'rejected', 'all'] as const).map(status => <button type="button" key={status} aria-pressed={filter === status} onClick={() => setFilter(status)} className={`flex items-center gap-1.5 whitespace-nowrap rounded px-3 py-1.5 text-[12.5px] ${filter === status ? 'bg-[#111827] font-semibold text-[#FFFFFF]' : 'text-fg-tertiary'}`}>{labels[status]}<span className={status === 'pending' ? 'admin-count' : ''}>{applications?.filter(item => status === 'all' || item.status === status).length ?? 0}</span></button>)}
      </div>
      <label className="relative block w-full max-w-[300px]">
        <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="absolute left-2.5 top-[11px] text-fg-tertiary"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
        <input aria-label={labels.search} placeholder={labels.search} value={search} onChange={event => setSearch(event.target.value)} className="h-9 w-full rounded-md border border-border bg-s1 pl-8 pr-3 text-[13px]"/>
      </label>
    </div>
    <section aria-label={labels.list} className="overflow-hidden rounded-[10px] border border-border bg-s1">
      <div className="overflow-x-auto"><table className="admin-applications-table">
        <thead><tr>{[labels.applicant, labels.contact, labels.students, labels.device, `${labels.submittedAt} ▼`, labels.actions].map(label => <th key={label} scope="col">{label}</th>)}</tr></thead>
        <tbody>{!loading && !error && rows.map(item => <tr key={item.id}>
          <td><div className="flex items-center gap-2"><span className="font-semibold text-fg">{item.name}</span>{item.status !== 'pending' && <span className={`whitespace-nowrap rounded border px-1.5 py-px text-[11px] ${mailFailures[item.id] ? 'border-[#F2D9A6] bg-[#FEF3C7] text-[#A15C00]' : item.status === 'approved' ? 'border-[#B7D4CC] bg-[#E7F1EE] text-[#10715A]' : 'border-border bg-s2 text-fg-tertiary'}`}>{mailFailures[item.id] ? labels.mailFailed : labels[item.status]}</span>}</div><div className="font-mono text-xs text-fg-secondary">{item.email}</div></td>
          <td>{item.contact || '—'}</td><td className="font-mono">{item.student_count}</td><td>{applicationDevice(item.device)}</td><td className="font-mono text-xs text-fg-tertiary">{applicationTime(item.created_at)}</td><td><div className="flex justify-end gap-2">{item.status === 'pending' ? <><button type="button" disabled={busy || loading} className="admin-primary" onClick={() => setConfirm({ item, action: 'approve' })}>{labels.approve}</button><button type="button" disabled={busy || loading} className="admin-secondary" onClick={() => setConfirm({ item, action: 'reject' })}>{labels.reject}</button></> : <button type="button" disabled={busy || loading} className="admin-secondary" style={mailFailures[item.id] ? { color: '#A15C00', borderColor: '#A15C00' } : undefined} onClick={() => void review(item, 'resend')}>{labels.resend}</button>}</div></td>
        </tr>)}</tbody>
      </table></div>
      {loading ? <SkeletonRows/> : error ? <ErrorState retry={retry}/> : rows.length === 0 ? <EmptyState text={filter === 'pending' && !query ? labels.emptyPending : labels.empty}/> : null}
    </section>
    {confirm && <ReviewConfirmation item={confirm.item} action={confirm.action} busy={busy} onCancel={() => setConfirm(null)} onConfirm={() => void review(confirm.item, confirm.action)}/>}
    <p className="text-xs text-fg-tertiary">{filter === 'pending' ? labels.pendingHint : labels.otherHint}</p>
  </div>
}

function applicationTime(value: string): string {
  const date = new Date(value)
  const two = (n: number) => String(n).padStart(2, '0')
  return `${two(date.getMonth() + 1)}-${two(date.getDate())} ${two(date.getHours())}:${two(date.getMinutes())}`
}

function ReviewConfirmation({ item, action, busy, onCancel, onConfirm }: {
  item: CoachApplication; action: 'approve' | 'reject'; busy: boolean; onCancel: () => void; onConfirm: () => void
}) {
  const dialog = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null
    const element = dialog.current!
    if (typeof element.showModal === 'function') element.showModal()
    else element.setAttribute('open', '')
    return () => { if (previous?.isConnected) previous.focus() }
  }, [])
  const labels = S.admin.applications
  return <dialog ref={dialog} aria-modal="true" aria-labelledby="admin-review-title" aria-describedby="admin-review-consequences" onCancel={event => { event.preventDefault(); if (!busy) onCancel() }} className="admin-review-dialog">
    <h2 id="admin-review-title" className="text-lg font-bold">{action === 'approve' ? labels.approveTitle(item.name) : labels.rejectTitle(item.name)}</h2>
    <div id="admin-review-consequences" className="my-4 text-[13px] leading-[1.6] text-fg-secondary">{action === 'approve' ? <><p>{labels.consequences}</p><ul className="mt-1.5 list-inside list-disc space-y-1.5"><li className="break-words">{labels.createAccount(item.email)}</li><li>{labels.createInvite}</li><li>{labels.welcomeEmail}</li></ul></> : <p>{labels.resultEmail}</p>}</div>
    <div className="flex justify-end gap-2 pt-1"><button type="button" autoFocus disabled={busy} onClick={onCancel} className="admin-secondary">{S.common.cancel}</button><button type="button" disabled={busy} onClick={onConfirm} className="admin-primary">{action === 'approve' ? labels.confirmApprove : labels.confirmReject}</button></div>
  </dialog>
}
