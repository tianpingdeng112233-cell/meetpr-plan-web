import type { CoachStudent } from '../../api/types'
import { fmt, resolveLocale, S } from '../../i18n/strings'

export function PageTop({ title, students, studentId, onStudent, tail, onBack }: { title: string; students: CoachStudent[]; studentId: string; onStudent: (id: string) => void; tail?: React.ReactNode; onBack?: () => void }) {
  return <header className="page-top">
    {onBack && <button type="button" className="page-back" onClick={onBack}>{S.workspace.backAllStudents}</button>}
    <span className="page-eyebrow">COACH / {title}</span><span className="page-divider" />
    {students.length > 0 && <><span className="page-label">{S.common.student}</span><select className="student-select" value={studentId} onChange={(e) => onStudent(e.target.value)}>{students.map((s) => <option key={s.id} value={s.id}>{s.display_name}</option>)}</select></>}
    <span className="page-spacer" />{tail}
  </header>
}
export const shortDate = (value: string | null | undefined) => {
  if (!value) return '—'
  const date = fmt.parseDate(value)
  return fmt.monthDay(date, () => date.toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit' }))
}
/** Whole days elapsed since an ISO timestamp; null when the value is absent. */
export const daysSince = (value: string | null | undefined): number | null =>
  value ? Math.floor((Date.now() - fmt.parseDate(value).getTime()) / 86_400_000) : null
export const relativeDays = (value: string | null | undefined) => {
  const d = daysSince(value)
  if (d == null) return '—'
  if (d <= 0) return S.workspace.today
  if (d === 1) return S.workspace.yesterday
  return S.workspace.daysAgo(d)
}
export const kg = (value: string | null | undefined) => value == null ? '—' : Number(value).toLocaleString(resolveLocale() === 'zh' ? 'zh-CN' : 'en-US', { maximumFractionDigits: 1 })
export const profileLine = (p: { gender?: string | null; birth_date?: string | null; height_cm?: string | null; weight_kg?: string | null; training_years?: number | null }) => {
  const age = p.birth_date ? Math.max(0, new Date().getFullYear() - fmt.parseDate(p.birth_date).getFullYear()) : null
  return [p.gender === 'male' ? S.common.male : p.gender === 'female' ? S.common.female : null, age ? S.workspace.age(age) : null, p.height_cm ? `${kg(p.height_cm)}cm` : null, p.weight_kg ? `${kg(p.weight_kg)}kg` : null, p.training_years != null ? S.workspace.trainingYears(p.training_years) : null].filter(Boolean).join(' · ') || S.common.notProvided
}

const techniqueLabels: Record<string, string> = {
  get high_bar() { return S.workspace.squatStyleHigh },
  get low_bar() { return S.workspace.squatStyleLow },
  get conventional() { return S.workspace.deadliftConventional },
  get sumo() { return S.workspace.deadliftSumo },
  get both() { return S.workspace.deadliftBoth },
  get narrow() { return S.workspace.benchNarrow },
  get standard() { return S.workspace.benchStandard },
  get wide() { return S.workspace.benchWide },
}

export const techniqueStyleLine = (p: { squat_stance?: string | null; deadlift_style?: string | null; bench_grip?: string | null }) =>
  [p.squat_stance, p.deadlift_style, p.bench_grip]
    .filter((value): value is string => Boolean(value))
    .map((value) => techniqueLabels[value] ?? value)
    .join(' · ') || S.common.notProvided
