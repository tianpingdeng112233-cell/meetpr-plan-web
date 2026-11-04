import { getServiceTerm, type ServiceTerm } from './serviceTerm'
import type { CoachBindRequest, CoachStudent } from '../../api/types'
import charPinyinData from '../../data/char-pinyin.json'
import { matchesPinyin } from '../plan-editor/pinyin'

const charPinyin = charPinyinData as Record<string, string[]>

function nameSortKey(name: string): string {
  return [...name].map(char => charPinyin[char]?.[0] ?? char.toLowerCase()).join('')
}

export interface StudentRailRow {
  serviceTerm: ServiceTerm | null
  student: CoachStudent
  displayName: string
  subtitle: string | null
  endedAt: string | null
  /** Keys into S.workspace.studentRail; ended rows have no training status. */
  status: { key: 'completed'; time: string } | { key: 'scheduled' | 'rest' } | null
  pendingVideoCount: number
}

function trainingStatus(student: CoachStudent): StudentRailRow['status'] {
  if (student.bond_status === 'ended') return null
  if (student.today?.state === 'completed') {
    const date = new Date(student.today.completed_at ?? '')
    const time = Number.isNaN(date.getTime()) ? '—'
      : `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
    return { key: 'completed', time }
  }
  return { key: student.today?.state ?? 'rest' }
}

export function buildStudentRail(students: readonly CoachStudent[], query: string, today = new Date()): { active: StudentRailRow[]; ended: StudentRailRow[] } {
  const search = query.trim().toLowerCase()
  const rank = { completed: 0, scheduled: 1, rest: 2 }
  const rows = students.filter(student => [student.alias, student.display_name].some(name =>
    name != null && (name.toLowerCase().includes(search) || matchesPinyin(name, search)),
  )).map(student => ({
    student,
    serviceTerm: student.bond_status === 'ended' ? null : getServiceTerm(student.service_until, today),
    displayName: student.alias ?? student.display_name,
    subtitle: student.alias != null ? student.display_name : null,
    endedAt: student.ended_at ?? null,
    status: trainingStatus(student),
    pendingVideoCount: student.pending_video_count ?? 0,
  }))
  const active = rows.filter(row => row.student.bond_status !== 'ended').sort((a, b) => {
    const group = rank[a.student.today?.state ?? 'rest'] - rank[b.student.today?.state ?? 'rest']
    if (group !== 0) return group
    if (a.student.today?.state === 'completed' && b.student.today?.state === 'completed') {
      return Date.parse(a.student.today.completed_at!) - Date.parse(b.student.today.completed_at!)
    }
    return nameSortKey(a.displayName).localeCompare(nameSortKey(b.displayName), 'en')
  })
  return { active, ended: rows.filter(row => row.student.bond_status === 'ended') }
}

/** Browser-local month/day for the returning-student label; old responses have no marker. */
export function previouslyEnded(request: Pick<CoachBindRequest, 'previously_ended_at'>): string | null {
  if (!request.previously_ended_at) return null
  const date = new Date(request.previously_ended_at)
  if (Number.isNaN(date.getTime())) return null
  return `${String(date.getMonth() + 1).padStart(2, '0')}/${String(date.getDate()).padStart(2, '0')}`
}
