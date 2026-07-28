import type { ChatMessage, ChatSetRefV1 } from '../../api/types'

const nullableString = (value: unknown): value is string | null =>
  value === null || typeof value === 'string'

const nullableNumber = (value: unknown): value is number | null =>
  value === null || typeof value === 'number'

const SET_REF_V1_KEYS = [
  'v',
  'exercise_name',
  'set_number',
  'weight_kg',
  'reps',
  'rpe',
  'day_date',
  'set_log_id',
] as const

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
  return SET_REF_V1_KEYS.every((key) => Object.hasOwn(candidate, key))
    && candidate.v === 1
    && typeof candidate.exercise_name === 'string'
    && candidate.exercise_name.length > 0
    && Array.from(candidate.exercise_name).length <= 120
    && !/[\u0000-\u001f\u007f-\u009f]/.test(candidate.exercise_name)
    && typeof candidate.set_number === 'number'
    && Number.isInteger(candidate.set_number)
    && candidate.set_number >= 1
    && candidate.set_number <= 2_147_483_648
    && nullableString(candidate.weight_kg)
    && validCanonicalWeight(candidate.weight_kg)
    && nullableNumber(candidate.reps)
    && (candidate.reps === null
      || (Number.isInteger(candidate.reps) && candidate.reps >= 0 && candidate.reps <= 99))
    && nullableString(candidate.rpe)
    && (candidate.rpe === null || /^(10|[0-9](?:\.5)?)$/.test(candidate.rpe))
    && typeof candidate.day_date === 'string'
    && validCalendarDate(candidate.day_date)
    && typeof candidate.set_log_id === 'string'
    && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
      .test(candidate.set_log_id)
}

export function setRefFirstLine(setRef: ChatSetRefV1): string {
  const weight = setRef.weight_kg === null ? '-kg' : `${setRef.weight_kg}kg`
  const reps = setRef.reps === null ? '-' : String(setRef.reps)
  const rpe = setRef.rpe === null ? '' : ` @RPE${setRef.rpe}`
  return `[训练分享] ${setRef.exercise_name} 第${setRef.set_number}组 ${weight}×${reps}${rpe} (${setRef.day_date})`
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
  onPlayVideo,
}: {
  parsed: ParsedSetRefMessage
  hasVideo: boolean
  onPlayVideo?: () => void
}) {
  const { setRef, note } = parsed
  return <section className="set-ref-card" aria-label="训练分享">
    <header>
      <span className="set-ref-kicker">训练分享</span>
      <time>{setRef.day_date}</time>
    </header>
    <div className="set-ref-heading">
      <b>{setRef.exercise_name}</b>
      <span>第 {setRef.set_number} 组</span>
    </div>
    <div className="set-ref-metrics">
      <strong>
        {setRef.weight_kg === null ? '-kg' : `${setRef.weight_kg}kg`}
        <i>×</i>
        {setRef.reps === null ? '-' : setRef.reps}
      </strong>
      {setRef.rpe !== null && <span>RPE {setRef.rpe}</span>}
    </div>
    {hasVideo && <button type="button" className="set-ref-play" onClick={onPlayVideo}>
      <span>▶</span> 播放视频
    </button>}
    {note !== null && note !== '' && <p className="set-ref-note">{note}</p>}
  </section>
}
