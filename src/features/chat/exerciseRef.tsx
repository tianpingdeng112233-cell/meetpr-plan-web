import { useEffect, useRef, useState } from 'react'
import type { ChatExerciseRefV1, ChatMessage } from '../../api/types'
import { S } from '../../i18n/strings'

export function parseExerciseRefMessage(message: Pick<ChatMessage, 'kind' | 'body' | 'exercise_ref'>) {
  const ref = message.exercise_ref
  if (message.kind !== 'text' || typeof ref !== 'object' || ref === null) return null
  const value = ref as Record<string, unknown>
  if (value.v !== 1 || typeof value.exercise_name !== 'string' || !value.exercise_name.trim()
    || typeof value.day_date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value.day_date)
    || !Number.isFinite(Date.parse(value.day_date))
    || typeof value.exercise_id !== 'string' || !value.exercise_id
    || ![value.plan_day_id, value.plan_exercise_id].every(id => id === null || typeof id === 'string' && id.length > 0)) return null
  const exerciseRef = ref as ChatExerciseRefV1
  const date = `${Number(exerciseRef.day_date.slice(5, 7))}/${Number(exerciseRef.day_date.slice(8, 10))}`
  const body = message.body ?? ''
  const firstLine = `[动作留言] ${exerciseRef.exercise_name} · ${date}`
  const lineEnd = body.indexOf('\n')
  const first = (lineEnd < 0 ? body : body.slice(0, lineEnd)).replace(/\r$/, '')
  return { exerciseRef, date, note: first === firstLine ? (lineEnd < 0 ? '' : body.slice(lineEnd + 1)) : body }
}

export function ExerciseRefCard({ parsed, onHover, onOpen, unavailable = false }: {
  parsed: NonNullable<ReturnType<typeof parseExerciseRefMessage>>
  onHover?: (ref: ChatExerciseRefV1 | null) => void
  onOpen?: (ref: ChatExerciseRefV1) => void | boolean | Promise<void | boolean>
  unavailable?: boolean
}) {
  // Collapsing chat while hovered must also release the transient emphasis.
  const hover = useRef(onHover)
  hover.current = onHover
  useEffect(() => () => hover.current?.(null), [])
  const [missing, setMissing] = useState(false)
  return <button type="button" className="exercise-ref-card"
    onMouseEnter={() => onHover?.(parsed.exerciseRef)} onMouseLeave={() => onHover?.(null)}
    onFocus={() => onHover?.(parsed.exerciseRef)} onBlur={() => onHover?.(null)}
    onClick={async () => { setMissing((await onOpen?.(parsed.exerciseRef)) === false) }}>
    <span className="exercise-ref-heading"><small>{parsed.date} · {parsed.exerciseRef.exercise_name}</small>
      {(unavailable || missing) && <small role="status">{S.chat.exerciseMissing}</small>}</span>
    <p>{parsed.note}</p>
  </button>
}
