import type { ChatMessage, ChatSetRefV1 } from '../../api/types'

const nullableString = (value: unknown): value is string | null =>
  value === null || typeof value === 'string'

const nullableNumber = (value: unknown): value is number | null =>
  value === null || typeof value === 'number'

const SET_REF_V1_KEYS = [
  'v',
  'source',
  'exercise_name',
  'set_number',
  'set_total',
  'weight_kg',
  'reps',
  'reps_max',
  'rpe',
  'day_date',
  'set_log_id',
  'plan_set_id',
] as const

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function validCanonicalWeight(value: string | null): boolean {
  if (value === null) return true
  const match = /^(0|[1-9][0-9]{0,3})(?:\.([0-9]{1,2}))?$/.exec(value)
  return match !== null && (match[2] === undefined || !match[2].endsWith('0'))
}

function validCalendarDate(value: string): boolean {
  const match = /^([0-9]{4})-([0-9]{2})-([0-9]{2})$/.exec(value)
  if (!match) return false
  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  const date = new Date(Date.UTC(year, month - 1, day))
  return date.getUTCFullYear() === year
    && date.getUTCMonth() === month - 1
    && date.getUTCDate() === day
}

export function isChatSetRefV1(value: unknown): value is ChatSetRefV1 {
  if (typeof value !== 'object' || value === null) return false
  const candidate = value as Record<string, unknown>
  // Every known field must be present and valid, but extra fields are ignored on
  // purpose. The `.strict()` rejection in §11.1 is the *write* contract the server
  // enforces; a coach's cached bundle reads messages the server already accepted,
  // so exact-key-count matching here would blank every card the moment the server
  // grows a field this bundle predates.
  return SET_REF_V1_KEYS.every((key) => Object.hasOwn(candidate, key))
    && candidate.v === 1
    && (candidate.source === 'logged' || candidate.source === 'planned')
    && typeof candidate.exercise_name === 'string'
    && candidate.exercise_name.length > 0
    && Array.from(candidate.exercise_name).length <= 120
    && !/[\u0000-\u001f\u007f-\u009f]/.test(candidate.exercise_name)
    && typeof candidate.set_number === 'number'
    && Number.isInteger(candidate.set_number)
    && candidate.set_number >= 1
    && candidate.set_number <= 2_147_483_648
    && nullableNumber(candidate.set_total)
    && (candidate.set_total === null
      || (Number.isInteger(candidate.set_total)
        && candidate.set_total >= 1
        && candidate.set_total <= 999
        && candidate.set_total >= candidate.set_number))
    && nullableString(candidate.weight_kg)
    && validCanonicalWeight(candidate.weight_kg)
    && nullableNumber(candidate.reps)
    && (candidate.reps === null
      || (Number.isInteger(candidate.reps) && candidate.reps >= 0 && candidate.reps <= 99))
    && nullableNumber(candidate.reps_max)
    && (candidate.reps_max === null
      || (candidate.reps !== null
        && Number.isInteger(candidate.reps_max)
        && candidate.reps < candidate.reps_max
        && candidate.reps_max <= 99))
    && nullableString(candidate.rpe)
    && (candidate.rpe === null || /^(10|[0-9](?:\.5)?)$/.test(candidate.rpe))
    && typeof candidate.day_date === 'string'
    && validCalendarDate(candidate.day_date)
    && nullableString(candidate.set_log_id)
    && nullableString(candidate.plan_set_id)
    && (candidate.source === 'logged'
      ? candidate.set_log_id !== null
        && UUID_PATTERN.test(candidate.set_log_id)
        && candidate.plan_set_id === null
      : candidate.plan_set_id !== null
        && UUID_PATTERN.test(candidate.plan_set_id)
        && candidate.set_log_id === null)
}

export function setRefFirstLine(setRef: ChatSetRefV1): string {
  const prefix = setRef.source === 'logged' ? '[训练分享]' : '[训练计划]'
  const setTotal = setRef.set_total === null ? '' : `/${setRef.set_total}`
  const planned = setRef.source === 'planned' ? ' 计划' : ''
  const weight = setRef.weight_kg === null ? '-kg' : `${setRef.weight_kg}kg`
  const reps = setRef.reps === null
    ? '-'
    : `${setRef.reps}${setRef.reps_max === null ? '' : `-${setRef.reps_max}`}`
  const rpe = setRef.rpe === null ? '' : ` @RPE${setRef.rpe}`
  return `${prefix} ${setRef.exercise_name} 第${setRef.set_number}组${setTotal}${planned} ${weight}×${reps}${rpe} (${setRef.day_date})`
}

export interface ParsedSetRefMessage {
  setRef: ChatSetRefV1
  note: string | null
}

export function parseSetRefMessage(message: ChatMessage): ParsedSetRefMessage | null {
  if (message.kind !== 'text' || !isChatSetRefV1(message.set_ref) || message.body === null) return null
  const firstLine = setRefFirstLine(message.set_ref)
  if (message.body === firstLine) return { setRef: message.set_ref, note: null }
  const prefix = `${firstLine}\n`
  if (!message.body.startsWith(prefix)) return null
  const note = message.body.slice(prefix.length)
  return { setRef: message.set_ref, note }
}

export function SetRefCard({
  parsed,
  hasVideo,
  sentAt,
  onPlayVideo,
}: {
  parsed: ParsedSetRefMessage
  hasVideo: boolean
  /** Clock time the message was sent — §11.5 layer 1. Not the training day. */
  sentAt: string
  onPlayVideo?: () => void
}) {
  const { setRef, note } = parsed
  const sourceLabel = setRef.source === 'logged' ? '学员记录的一组' : '学员今天的计划'
  const reps = setRef.reps === null
    ? '-'
    : `${setRef.reps}${setRef.reps_max === null ? '' : `-${setRef.reps_max}`}`
  return <section
    className={`set-ref-card set-ref-card-${setRef.source}`}
    aria-label={setRef.source === 'logged' ? '训练分享' : '训练计划'}
  >
    <header>
      <span className="set-ref-kicker">
        <svg viewBox="0 0 24 12" aria-hidden="true">
          <path d="M1 4v4m3-6v8m3-6v4m0-2h10m0-2v4m3-6v8m3-6v4" />
        </svg>
        {sourceLabel}
      </span>
      <time>{sentAt}</time>
    </header>
    <div className="set-ref-heading">
      <b>{setRef.exercise_name}</b>
      <span>
        第 {setRef.set_number} 组
        {setRef.set_total !== null && <> / {setRef.set_total}</>}
      </span>
    </div>
    <div className="set-ref-metrics">
      <div className="set-ref-metric set-ref-load">
        <span>WEIGHT × REPS</span>
        <strong>
          <span>{setRef.weight_kg ?? '-'}</span><small>kg</small>
          <i>×</i>
          <span>{reps}</span>
        </strong>
      </div>
      <div className="set-ref-metric set-ref-rpe">
        <span>RPE</span>
        <strong className={setRef.rpe === null ? 'empty' : ''}>{setRef.rpe ?? '—'}</strong>
      </div>
    </div>
    {hasVideo && <button type="button" className="set-ref-play" onClick={onPlayVideo}>
      <span>▶</span> 播放视频
    </button>}
    {note !== null && note !== '' && <p className="set-ref-note">{note}</p>}
  </section>
}
