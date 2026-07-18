import { useEffect, useState } from 'react'
import { getPlan, getStudentPlans } from '../../api/plans'
import type { LiftFamily } from '../../api/types'
import { ExerciseIndex } from '../plan-editor/exerciseIndex'
import { isoDate, mapPlanToWeeks, type Catalog } from '../plan-editor/mapping'
import { summarizeWeek, type WeekSummary } from '../plan-editor/weeklySummary'
import { latestCapacityPlan, locateCapacityWeek } from './studentPlanCapacity'

type CapacityState =
  | { kind: 'loading' }
  | { kind: 'empty' }
  | { kind: 'ready'; planName: string; weekNumber: number; summary: WeekSummary }

const LIFTS: { family: LiftFamily; short: string; sets: keyof Pick<WeekSummary, 'squatSets' | 'benchSets' | 'deadliftSets'> }[] = [
  { family: 'squat', short: 'S', sets: 'squatSets' },
  { family: 'bench', short: 'B', sets: 'benchSets' },
  { family: 'deadlift', short: 'D', sets: 'deadliftSets' },
]

function LiftCapacity({ family, short, sets }: {
  family: LiftFamily
  short: string
  sets: number
}) {
  return (
    <div className="student-capacity-lift" data-lift-family={family}>
      <span className="student-capacity-lift-name">{short}</span>
      <b>{sets}<small>组</small></b>
    </div>
  )
}

export function StudentPlanCapacityCard({ studentId, catalog, index }: {
  studentId: string
  catalog?: Catalog | null
  index?: ExerciseIndex | null
}) {
  const [capacity, setCapacity] = useState<CapacityState>({ kind: 'loading' })

  useEffect(() => {
    let alive = true
    setCapacity({ kind: 'loading' })
    if (!studentId || !catalog || !index) {
      setCapacity({ kind: 'empty' })
      return () => { alive = false }
    }

    void (async () => {
      try {
        const plans = await getStudentPlans(studentId)
        const selected = latestCapacityPlan(plans)
        if (!selected) {
          if (alive) setCapacity({ kind: 'empty' })
          return
        }
        const full = await getPlan(selected.id)
        const weeks = mapPlanToWeeks(full, catalog)
        const week = locateCapacityWeek(weeks, full.start_date, isoDate(new Date()))
        if (!week) {
          if (alive) setCapacity({ kind: 'empty' })
          return
        }
        const summary = summarizeWeek(week, (exerciseId) => index.classificationById(exerciseId))
        if (alive) {
          setCapacity({ kind: 'ready', planName: full.name, weekNumber: week.num, summary })
        }
      } catch {
        if (alive) setCapacity({ kind: 'empty' })
      }
    })()

    return () => { alive = false }
  }, [studentId, catalog, index])

  return (
    <article className="student-capacity-card" data-testid="student-plan-capacity">
      <header>
        <div><h3>本周计划容量</h3>{capacity.kind === 'ready' && <small>{capacity.planName} · 第 {capacity.weekNumber} 周</small>}</div>
      </header>
      {capacity.kind === 'loading' && <p>计划容量加载中…</p>}
      {capacity.kind === 'empty' && <p>暂无计划容量数据</p>}
      {capacity.kind === 'ready' && (
        <div className="student-capacity-lifts">
          {LIFTS.map((lift) => <LiftCapacity key={lift.family} family={lift.family} short={lift.short} sets={capacity.summary[lift.sets]} />)}
        </div>
      )}
    </article>
  )
}
