import { useEffect, useState } from 'react'
import { getPlan, getStudentPlans } from '../../api/plans'
import type { LiftFamily } from '../../api/types'
import {
  classifySets, JTS_CLASSIFICATION_LABELS, JTS_VOLUME_BANDS, loadJtsPhase, saveJtsPhase,
  type JtsPhase, type JtsPhaseSelection, type JtsSetClassification,
} from '../plan-editor/jtsVolumeBands'
import { ExerciseIndex } from '../plan-editor/exerciseIndex'
import { isoDate, mapPlanToWeeks, type Catalog } from '../plan-editor/mapping'
import { summarizeWeek, type WeekSummary } from '../plan-editor/weeklySummary'
import { JtsPhaseSelector } from '../plan-editor/components/JtsPhaseSelector'
import { JtsDeadliftFootnote, JtsVolumeDisclaimer } from '../plan-editor/components/JtsReferenceNotes'
import { latestCapacityPlan, locateCapacityWeek } from './studentPlanCapacity'

type CapacityState =
  | { kind: 'loading' }
  | { kind: 'empty' }
  | { kind: 'ready'; planId: string; planName: string; weekNumber: number; summary: WeekSummary }

const LIFTS: { family: LiftFamily; short: string; sets: keyof Pick<WeekSummary, 'squatSets' | 'benchSets' | 'deadliftSets'> }[] = [
  { family: 'squat', short: 'S', sets: 'squatSets' },
  { family: 'bench', short: 'B', sets: 'benchSets' },
  { family: 'deadlift', short: 'D', sets: 'deadliftSets' },
]

function classificationClass(classification: JtsSetClassification): string {
  if (classification === 'below_mev') return 'week-capacity-lift-below'
  if (classification === 'above_mrv') return 'week-capacity-lift-above'
  return 'week-capacity-lift-normal'
}

function LiftCapacity({ family, short, sets, phase }: {
  family: LiftFamily
  short: string
  sets: number
  phase: JtsPhaseSelection
}) {
  const selectedPhase = phase === 'off' ? null : phase as JtsPhase
  const classification = selectedPhase ? classifySets(family, selectedPhase, sets) : null
  const band = selectedPhase ? JTS_VOLUME_BANDS[selectedPhase][family] : null
  return (
    <div
      className="student-capacity-lift"
      data-lift-family={family}
      {...(classification ? { 'data-jts-classification': classification } : {})}
    >
      <span className="student-capacity-lift-name">{short}</span>
      <b>{sets}<small>组</small></b>
      {classification && <em className={`student-capacity-chip ${classificationClass(classification)}`}>{JTS_CLASSIFICATION_LABELS[classification]}</em>}
      {band && <span className="student-capacity-range">MEV {band.mev[0]}-{band.mev[1]} / MRV {band.mrv[0]}-{band.mrv[1]}</span>}
      {selectedPhase && family === 'deadlift' && <JtsDeadliftFootnote className="student-capacity-deadlift-note" />}
    </div>
  )
}

export function StudentPlanCapacityCard({ studentId, catalog, index }: {
  studentId: string
  catalog?: Catalog | null
  index?: ExerciseIndex | null
}) {
  const [capacity, setCapacity] = useState<CapacityState>({ kind: 'loading' })
  const [phase, setPhase] = useState<JtsPhaseSelection>('off')

  useEffect(() => {
    let alive = true
    setCapacity({ kind: 'loading' })
    setPhase('off')
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
          setPhase(loadJtsPhase(full.id))
          setCapacity({ kind: 'ready', planId: full.id, planName: full.name, weekNumber: week.num, summary })
        }
      } catch {
        if (alive) setCapacity({ kind: 'empty' })
      }
    })()

    return () => { alive = false }
  }, [studentId, catalog, index])

  const changePhase = (next: JtsPhaseSelection) => {
    setPhase(next)
    if (capacity.kind === 'ready') saveJtsPhase(capacity.planId, next)
  }

  return (
    <article className="student-capacity-card" data-testid="student-plan-capacity">
      <header>
        <div><h3>本周计划容量 · JTS 参考</h3>{capacity.kind === 'ready' && <small>{capacity.planName} · 第 {capacity.weekNumber} 周</small>}</div>
        {capacity.kind === 'ready' && <JtsPhaseSelector value={phase} onChange={changePhase} />}
      </header>
      {capacity.kind === 'loading' && <p>计划容量加载中…</p>}
      {capacity.kind === 'empty' && <p>暂无计划容量数据</p>}
      {capacity.kind === 'ready' && (
        <>
          <div className="student-capacity-lifts">
            {LIFTS.map((lift) => <LiftCapacity key={lift.family} family={lift.family} short={lift.short} sets={capacity.summary[lift.sets]} phase={phase} />)}
          </div>
          {phase !== 'off' && <JtsVolumeDisclaimer className="student-capacity-disclaimer" />}
        </>
      )}
    </article>
  )
}
