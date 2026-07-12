import { describe, expect, it } from 'vitest'
import { profileEmptyMessage, writingContextLevel } from './components/WritingContextPanel'
import type { ExerciseRow } from './types'

const row = (patch: Partial<ExerciseRow>): ExerciseRow => ({
  id: 'r', serverRowId: null, serverSortOrder: null, hasLogs: false, conflictMessage: null,
  exerciseId: null, name: '', ku: false, custom: false, isMain: false, aux: false,
  reps: '—', mode: 'kg', boxes: [], note: '', ...patch,
})

describe('writing context state machine', () => {
  it('moves through profile, exercise, set-count and exact reps without network state', () => {
    expect(writingContextLevel(null)).toBe(1)
    expect(writingContextLevel(row({ exerciseId: 'exercise' }))).toBe(2)
    expect(writingContextLevel(row({ exerciseId: 'exercise', boxes: [{ val: '', empty: true }] }))).toBe(3)
    expect(writingContextLevel(row({ exerciseId: 'exercise', boxes: [{ val: '100', empty: false }], reps: '5' }))).toBe(4)
  })

  it('distinguishes a loading profile from a confirmed missing profile', () => {
    expect(profileEmptyMessage(undefined)).toBe('画像载入中…')
    expect(profileEmptyMessage(null)).toBe('学员未填写画像')
    expect(profileEmptyMessage({ deadlift_style: null })).toBeNull()
  })
})
