import type { CoachStudent } from '../../api/types'

export function PageTop({ title, students, studentId, onStudent, tail }: { title: string; students: CoachStudent[]; studentId: string; onStudent: (id: string) => void; tail?: React.ReactNode }) {
  return <header className="page-top"><span className="page-eyebrow">COACH / {title}</span><span className="page-divider" />
    {students.length > 0 && <><span className="page-label">学员</span><select className="student-select" value={studentId} onChange={(e) => onStudent(e.target.value)}>{students.map((s) => <option key={s.id} value={s.id}>{s.display_name}</option>)}</select></>}
    <span className="page-spacer" />{tail}
  </header>
}
export const shortDate = (value: string | null | undefined) => value ? new Date(value).toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit' }) : '—'
export const kg = (value: string | null | undefined) => value == null ? '—' : Number(value).toLocaleString('zh-CN', { maximumFractionDigits: 1 })
export const profileLine = (p: { gender?: string | null; birth_date?: string | null; height_cm?: string | null; weight_kg?: string | null; training_years?: number | null }) => {
  const age = p.birth_date ? Math.max(0, new Date().getFullYear() - new Date(p.birth_date).getFullYear()) : null
  return [p.gender === 'male' ? '男' : p.gender === 'female' ? '女' : null, age ? `${age} 岁` : null, p.height_cm ? `${kg(p.height_cm)}cm` : null, p.weight_kg ? `${kg(p.weight_kg)}kg` : null, p.training_years != null ? `训练 ${p.training_years} 年` : null].filter(Boolean).join(' · ') || '未填写'
}
