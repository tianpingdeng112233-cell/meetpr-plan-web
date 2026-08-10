import { useEffect, useState, type CSSProperties } from 'react'
import { WeekdayDateSelector, calendarFieldLabel, calendarInputStyle, mmdd, planEndISO, todayISO, weekdayIndex } from '../plan-editor/components/PlanCalendarControls'
import { DOW_LABELS } from '../plan-editor/mapping'

const overlay: CSSProperties = {
  position: 'fixed',
  inset: 0,
  zIndex: 140,
  display: 'grid',
  placeItems: 'center',
  background: 'color-mix(in srgb, var(--bg) 68%, transparent)',
}

const panel: CSSProperties = {
  width: 430,
  maxWidth: 'calc(100vw - 32px)',
  boxSizing: 'border-box',
  borderRadius: 'var(--r-md)',
  border: '1px solid var(--border-strong)',
  background: 'var(--surface-2)',
  boxShadow: 'var(--elev-modal)',
  padding: 22,
  display: 'grid',
  gap: 'var(--sp-base)',
}

const secondaryButton: CSSProperties = {
  height: 36,
  padding: '0 14px',
  borderRadius: 'var(--r-md)',
  border: '1px solid var(--border-strong)',
  background: 'transparent',
  color: 'var(--fg-secondary)',
  font: 'inherit',
  fontWeight: 600,
  cursor: 'pointer',
}

const primaryButton: CSSProperties = {
  ...secondaryButton,
  borderColor: 'var(--ink)',
  background: 'var(--ink)',
  color: 'var(--white)',
}

function Stepper({ value, onChange }: { value: number; onChange: (value: number) => void }) {
  return (
    <div style={{ display: 'inline-flex', width: 'fit-content', border: '1px solid var(--border-strong)', borderRadius: 'var(--r-md)', overflow: 'hidden' }}>
      <button type="button" aria-label="减少一周" disabled={value <= 1} onClick={() => onChange(Math.max(1, value - 1))} style={{ ...secondaryButton, width: 38, padding: 0, border: 0, borderRadius: 0 }}>－</button>
      <span style={{ minWidth: 72, display: 'grid', placeItems: 'center', borderInline: '1px solid var(--border)', fontFamily: 'var(--font-mono)', fontWeight: 700 }}>{value} 周</span>
      <button type="button" aria-label="增加一周" disabled={value >= 52} onClick={() => onChange(Math.min(52, value + 1))} style={{ ...secondaryButton, width: 38, padding: 0, border: 0, borderRadius: 0 }}>＋</button>
    </div>
  )
}

export function NewPlanDialog({ open, studentName, onClose, onCreate }: {
  open: boolean
  studentName: string
  onClose: () => void
  onCreate: (name: string, weeks: number, startDate: string, anchorWeekday: number) => Promise<void>
}) {
  const [name, setName] = useState('新计划')
  const [weeks, setWeeks] = useState(12)
  const [startDate, setStartDate] = useState(todayISO())
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!open) return
    setName('新计划')
    setWeeks(12)
    setStartDate(todayISO())
    setCreating(false)
    setError('')
  }, [open])

  if (!open) return null
  const endDate = planEndISO(startDate, weeks)
  const validName = name.trim().length > 0

  return (
    <div onMouseDown={() => { if (!creating) onClose() }} style={overlay}>
      <form
        aria-label="新建计划"
        onMouseDown={(event) => event.stopPropagation()}
        onSubmit={(event) => {
          event.preventDefault()
          if (!validName || creating) return
          setCreating(true)
          setError('')
          void onCreate(name.trim(), weeks, startDate, weekdayIndex(startDate) + 1).catch(() => {
            setError('创建失败，请稍后重试')
            setCreating(false)
          })
        }}
        style={panel}
      >
        <div>
          <h3 style={{ margin: 0, fontSize: 18 }}>新建计划</h3>
          <div style={{ color: 'var(--fg-tertiary)', marginTop: 5, fontSize: 12 }}>学员 · {studentName}</div>
        </div>

        <label style={{ display: 'grid', gap: 7 }}>
          <span style={calendarFieldLabel}>计划名称</span>
          <input autoFocus value={name} onChange={(event) => setName(event.target.value)} style={calendarInputStyle} />
        </label>

        <div style={{ display: 'grid', gap: 7 }}>
          <span style={calendarFieldLabel}>周期长度（1–52 周）</span>
          <Stepper value={weeks} onChange={setWeeks} />
        </div>

        <div style={{ display: 'grid', gap: 7 }}>
          <span style={calendarFieldLabel}>Day 1 从周几开始</span>
          <WeekdayDateSelector value={startDate} onChange={setStartDate} dateLabel="开始日期" />
        </div>

        <div style={{ padding: '11px 12px', border: '1px dashed var(--border-strong)', borderRadius: 'var(--r-md)', color: 'var(--fg-secondary)', fontFamily: 'var(--font-mono)', fontSize: 11 }}>
          Day 1 = {DOW_LABELS[weekdayIndex(startDate)]} · {mmdd(startDate)} → W{weeks} 结束于 {mmdd(endDate)}（共 {weeks} 周）
        </div>

        {error && <div role="alert" style={{ color: 'var(--brand-red)', fontSize: 12 }}>{error}</div>}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--sp-sm)' }}>
          <button type="button" disabled={creating} onClick={onClose} style={secondaryButton}>取消</button>
          <button type="submit" disabled={!validName || creating} style={{ ...primaryButton, opacity: (!validName || creating) ? 0.55 : 1 }}>
            {creating ? '创建中…' : '创建计划'}
          </button>
        </div>
      </form>
    </div>
  )
}

export function DeletePlanDialog({ open, name, weeks, trainingDays, deleting, error, onClose, onDelete }: {
  open: boolean
  name: string
  weeks: number
  trainingDays: number
  deleting: boolean
  error: string
  onClose: () => void
  onDelete: () => void
}) {
  if (!open) return null
  return (
    <div onMouseDown={() => { if (!deleting) onClose() }} style={overlay}>
      <div role="dialog" aria-modal="true" aria-labelledby="delete-plan-title" onMouseDown={(event) => event.stopPropagation()} style={{ ...panel, width: 390 }}>
        <div>
          <h3 id="delete-plan-title" style={{ margin: 0, fontSize: 18 }}>删除草稿计划？</h3>
          <div style={{ marginTop: 8, color: 'var(--fg-secondary)', fontFamily: 'var(--font-mono)', fontSize: 12 }}>
            {name} · {weeks} 周 · {trainingDays} 个训练日 · 未发布
          </div>
        </div>
        <p style={{ margin: 0, color: 'var(--fg-secondary)', lineHeight: 1.6 }}>
          删除后不可恢复。该计划从未发布，学员端不受任何影响。
        </p>
        {error && <div role="alert" style={{ color: 'var(--brand-red)', fontSize: 12 }}>{error}</div>}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--sp-sm)' }}>
          <button type="button" disabled={deleting} onClick={onClose} style={secondaryButton}>取消</button>
          <button type="button" disabled={deleting} onClick={onDelete} style={{ ...primaryButton, background: 'var(--bad)', borderColor: 'var(--bad)', color: 'var(--white)', opacity: deleting ? 0.55 : 1 }}>
            {deleting ? '删除中…' : '删除计划'}
          </button>
        </div>
      </div>
    </div>
  )
}

export function CompletePlanDialog({ open, name, weeks, completing, error, onClose, onComplete }: {
  open: boolean
  name: string
  weeks: number
  completing: boolean
  error: string
  onClose: () => void
  onComplete: () => void
}) {
  if (!open) return null
  return (
    <div onMouseDown={() => { if (!completing) onClose() }} style={overlay}>
      <div role="dialog" aria-modal="true" aria-labelledby="complete-plan-title" onMouseDown={(event) => event.stopPropagation()} style={{ ...panel, width: 390 }}>
        <div>
          <h3 id="complete-plan-title" style={{ margin: 0, fontSize: 18 }}>将计划标记为完成？</h3>
          <div style={{ marginTop: 8, color: 'var(--fg-secondary)', fontFamily: 'var(--font-mono)', fontSize: 12 }}>
            {name} · {weeks} 周
          </div>
        </div>
        <p style={{ margin: 0, color: 'var(--fg-secondary)', lineHeight: 1.6 }}>
          学员端将不再显示该计划，此操作不可撤销。
        </p>
        {error && <div role="alert" style={{ color: 'var(--brand-red)', fontSize: 12 }}>{error}</div>}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--sp-sm)' }}>
          <button type="button" disabled={completing} onClick={onClose} style={secondaryButton}>取消</button>
          <button type="button" disabled={completing} onClick={onComplete} style={{ ...primaryButton, background: 'var(--green)', borderColor: 'var(--green)', color: 'var(--white)', opacity: completing ? 0.55 : 1 }}>
            {completing ? '处理中…' : '标记完成'}
          </button>
        </div>
      </div>
    </div>
  )
}

export function BackfillHistoryDialog({ open, name, weeks, busy, error, onClose, onConfirm }: {
  open: boolean
  name: string
  weeks: number
  busy: boolean
  error: string
  onClose: () => void
  onConfirm: () => void
}) {
  if (!open) return null
  return (
    <div onMouseDown={() => { if (!busy) onClose() }} style={overlay}>
      <div role="dialog" aria-modal="true" aria-labelledby="backfill-history-title" onMouseDown={(event) => event.stopPropagation()} style={{ ...panel, width: 400 }}>
        <div>
          <h3 id="backfill-history-title" style={{ margin: 0, fontSize: 18 }}>补记过去训练为已完成？</h3>
          <div style={{ marginTop: 8, color: 'var(--fg-secondary)', fontFamily: 'var(--font-mono)', fontSize: 12 }}>
            {name} · {weeks} 周
          </div>
        </div>
        <p style={{ margin: 0, color: 'var(--fg-secondary)', lineHeight: 1.6 }}>
          过去日期中尚无打卡的训练日，将按计划内容标记为「推定完成」（带「导」标，计入 PR 与 e1RM 基线，不计入完成率）。已有真实打卡的天不受影响。此操作不可撤销。
        </p>
        {error && <div role="alert" style={{ color: 'var(--brand-red)', fontSize: 12 }}>{error}</div>}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--sp-sm)' }}>
          <button type="button" disabled={busy} onClick={onClose} style={secondaryButton}>取消</button>
          <button type="button" disabled={busy} onClick={onConfirm} style={{ ...primaryButton, opacity: busy ? 0.55 : 1 }}>
            {busy ? '补记中…' : '补记历史'}
          </button>
        </div>
      </div>
    </div>
  )
}
