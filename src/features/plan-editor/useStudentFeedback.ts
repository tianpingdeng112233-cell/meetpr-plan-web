import { useCallback, useEffect, useRef, useState } from 'react'
import { getStudentFeedback } from '../../api/coach'
import type { CoachFeedbackResponse } from '../../api/types'

/** Read failures are isolated from the plan, logs and video queue. */
export function useStudentFeedback(studentId?: string) {
  const [result, setResult] = useState<{ studentId?: string; items?: CoachFeedbackResponse[]; failed?: boolean }>({})
  const request = useRef(0)
  const owner = useRef<string>()
  const confirmed = useRef(new Map<string, CoachFeedbackResponse>())
  const refresh = useCallback(async () => {
    if (!studentId) return
    const token = ++request.current
    try {
      const items = await getStudentFeedback(studentId)
      if (request.current !== token || owner.current !== studentId) return
      const merged = new Map(items.map(item => [item.id, item]))
      for (const [id, item] of confirmed.current) {
        if (merged.has(id)) confirmed.current.delete(id)
        else merged.set(id, item)
      }
      setResult({ studentId, items: [...merged.values()] })
    } catch {
      if (request.current === token && owner.current === studentId) setResult(current => ({ studentId, failed: true, items: current.studentId === studentId ? current.items : undefined }))
    }
  }, [studentId])
  useEffect(() => {
    owner.current = studentId
    confirmed.current.clear()
    setResult({ studentId })
    void refresh()
    return () => { request.current++; owner.current = undefined }
  }, [studentId, refresh])
  const append = useCallback((item: CoachFeedbackResponse) => {
    if (owner.current !== studentId || item.student_id !== studentId) return
    confirmed.current.set(item.id, item)
    setResult(current => ({ ...current, studentId, items: [
      ...(current.studentId === studentId ? current.items ?? [] : []).filter(existing => existing.id !== item.id), item,
    ] }))
  }, [studentId])
  return { items: result.studentId === studentId ? result.items : undefined,
    failed: result.studentId === studentId && !!result.failed, refresh, append }
}
