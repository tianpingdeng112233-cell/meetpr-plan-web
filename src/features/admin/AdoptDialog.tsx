import { ErrorState } from '../../components/states'
import { ApiException } from '../../api/client'
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { adoptCustomExercises, type OfficialExerciseInput, type PendingExerciseGroup } from '../../api/admin'
import type { ExerciseResponse, ExerciseType } from '../../api/types'
import { fmt, S } from '../../i18n/strings'
import { EQUIPMENT_LABEL, EQUIPMENT_OPTIONS, EXERCISE_TYPE_LABEL, FAMILY_CATEGORIES, LIFT_FAMILY_LABEL, MOVEMENT_PATTERN_LABEL, MOVEMENT_PATTERN_OPTIONS, MUSCLE_LABEL, MUSCLE_OPTIONS } from '../catalog/catalogModel'
import { errorText } from '../onboarding/text'
import { normalizeAdoptionName, rankAdoptionCandidates } from './adoptionCandidates'

type Props = { group: PendingExerciseGroup; refreshing: boolean; refreshError: boolean; onRetryRefresh: () => void; catalog: ExerciseResponse[]; onClose: () => void; onSuccess: (message: string) => void; onConflict: () => void }

export function AdoptDialog({ group, refreshing, refreshError, onRetryRefresh, catalog, onClose, onSuccess, onConflict }: Props) {
  const recommendations = useMemo(() => rankAdoptionCandidates(group.rows.map(row => row.name), catalog), [group, catalog])
  const [mode, setMode] = useState<'existing' | 'new'>(recommendations.length ? 'existing' : 'new')
  const [draft, setDraft] = useState<OfficialExerciseInput>(() => {
    const row = group.rows.reduce((best, row) => row.plan_count > best.plan_count ? row : best)
    return { name: row.name, name_en: row.name_en, exercise_type: row.exercise_type, main_lift_family: row.main_lift_family, is_competition_lift: row.is_competition_lift, muscle_groups: [...row.muscle_groups], equipment: [...row.equipment], movement_pattern: [...row.movement_pattern] }
  })
  const validNew = !!draft.name.trim() && draft.muscle_groups.length > 0 && draft.equipment.length > 0 && (draft.exercise_type === 'accessory' || !!draft.main_lift_family)
  const [search, setSearch] = useState('')
  const [selectedId, setSelectedId] = useState(recommendations[0]?.id ?? '')
  const [busy, setBusy] = useState(false)
  const inFlight = useRef(false)
  const [error, setError] = useState('')
  const dialog = useRef<HTMLDialogElement>(null)
  const labels = S.admin.adoption
  const query = normalizeAdoptionName(search)
  const candidates = query ? catalog.filter(row => row.created_by_coach_id == null && [row.name, row.name_en ?? ''].some(name => normalizeAdoptionName(name).includes(query))) : recommendations
  const selected = candidates.find(row => row.id === selectedId)
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null
    const element = dialog.current!
    if (typeof element.showModal === 'function') element.showModal()
    else element.setAttribute('open', '')
    return () => { if (previous?.isConnected) previous.focus() }
  }, [])
  async function submit() {
    if (inFlight.current || refreshing || refreshError || !group.rows.length || (mode === 'existing' ? !selected : !validNew)) return
    inFlight.current = true
    setBusy(true)
    setError('')
    try {
      const exercise_ids = group.rows.map(row => row.exercise_id)
      if (mode === 'new') {
        await adoptCustomExercises({ exercise_ids, new_official: { ...draft, name: draft.name.trim(), name_en: draft.name_en?.trim() || null, main_lift_family: draft.exercise_type === 'accessory' ? null : draft.main_lift_family, is_competition_lift: draft.exercise_type === 'main_lift' && draft.is_competition_lift } })
        onSuccess(labels.created(group.coach_count, group.display_name))
      } else if (selected) {
        await adoptCustomExercises({ exercise_ids, target_exercise_id: selected.id })
        onSuccess(labels.assigned(group.coach_count, group.display_name, fmt.exerciseName(selected)))
      }
    } catch (caught) {
      if (caught instanceof ApiException && caught.status === 409 && caught.code === 'EXERCISE_ADOPTION_CONFLICT') {
        setError(labels.conflict)
        onConflict()
      } else setError(errorText(caught))
    } finally {
      inFlight.current = false
      setBusy(false)
    }
  }
  return <dialog ref={dialog} role="dialog" aria-modal="true" aria-labelledby="adopt-title" onCancel={event => { event.preventDefault(); if (!inFlight.current) onClose() }} className="admin-review-dialog admin-adopt-dialog w-[520px] max-h-[calc(100dvh-48px)] overflow-y-auto" style={{ width: 520 }}>
    <h2 id="adopt-title" className="text-lg font-bold">{labels.title(group.display_name)}</h2>
    <p className="mt-1.5 text-[13px] leading-[1.6] text-fg-secondary">{labels.description(group.coach_count, new Set(group.rows.map(row => row.name)).size, group.plan_count)}</p>
    {mode === 'new' ? <fieldset disabled={busy} className="mt-[18px] flex min-w-0 flex-col gap-[18px]">
      {recommendations.length ? <button type="button" onClick={() => setMode('existing')} className="text-left text-[13px] text-fg-secondary">{labels.back}</button> : <p className="text-[13px] text-fg-tertiary">{labels.noCandidates}</p>}
      <h3 className="text-[12.5px] font-semibold text-fg-secondary">{labels.newTitle}</h3>
      <div className="grid grid-cols-2 gap-3">
        <label className="flex flex-col gap-1.5 text-[12.5px] text-fg-secondary">{labels.officialName}<input aria-label={labels.officialName} value={draft.name} onChange={event => setDraft(draft => ({ ...draft, name: event.target.value }))} className="h-[38px] min-w-0 rounded-md border border-border-strong px-3 text-[13px] text-fg"/></label>
        <label className="flex flex-col gap-1.5 text-[12.5px] text-fg-secondary">{S.catalog.englishName}<input aria-label={S.catalog.englishName} value={draft.name_en ?? ''} onChange={event => setDraft(draft => ({ ...draft, name_en: event.target.value }))} className="h-[38px] min-w-0 rounded-md border border-border-strong px-3 text-[13px] text-fg"/></label>
      </div>
      <Choices label={S.admin.exercises.type}>{(['main_lift', 'main_lift_variation', 'accessory'] as ExerciseType[]).map(type => <Chip key={type} active={draft.exercise_type === type} onClick={() => setDraft(draft => ({ ...draft, exercise_type: type, main_lift_family: type === 'accessory' ? null : draft.main_lift_family ?? 'squat', is_competition_lift: type === 'main_lift' && draft.is_competition_lift }))}>{EXERCISE_TYPE_LABEL[type]}</Chip>)}</Choices>
      {draft.exercise_type !== 'accessory' && <Choices label={labels.family}>{FAMILY_CATEGORIES.map(family => <Chip key={family} active={draft.main_lift_family === family} onClick={() => setDraft(draft => ({ ...draft, main_lift_family: family }))}>{LIFT_FAMILY_LABEL[family]}</Chip>)}</Choices>}
      {draft.exercise_type === 'main_lift' && <label className="flex items-center gap-2 text-[12.5px]"><input type="checkbox" aria-label={labels.competition} checked={draft.is_competition_lift} onChange={event => setDraft(draft => ({ ...draft, is_competition_lift: event.target.checked }))}/>{labels.competition}</label>}
      <Choices label={S.common.muscleGroup}>{MUSCLE_OPTIONS.map(muscle => <Chip key={muscle} active={draft.muscle_groups.includes(muscle)} onClick={() => setDraft(draft => ({ ...draft, muscle_groups: toggle(draft.muscle_groups, muscle) }))}>{MUSCLE_LABEL[muscle]}</Chip>)}</Choices>
      <Choices label={S.common.equipment}>{EQUIPMENT_OPTIONS.map(item => <Chip key={item} active={draft.equipment.includes(item)} onClick={() => setDraft(draft => ({ ...draft, equipment: toggle(draft.equipment, item) }))}>{EQUIPMENT_LABEL[item]}</Chip>)}</Choices>
      <Choices label={S.catalog.movementPattern}>{MOVEMENT_PATTERN_OPTIONS.map(pattern => <Chip key={pattern} active={draft.movement_pattern.includes(pattern)} onClick={() => setDraft(draft => ({ ...draft, movement_pattern: toggle(draft.movement_pattern, pattern) }))}>{MOVEMENT_PATTERN_LABEL[pattern]}</Chip>)}</Choices>
    </fieldset> : <div className="mt-[18px] flex flex-col gap-2">
      <h3 className="text-[12.5px] font-semibold text-fg-secondary">{labels.recommendations}</h3>
      <div className="flex max-h-[300px] flex-col gap-2 overflow-y-auto">
        {candidates.map((row, index) => <label key={row.id} className={`flex cursor-pointer items-center gap-3 rounded-lg border px-3.5 py-3 ${selectedId === row.id ? 'border-[#111827] bg-s2' : 'border-border bg-s1'}`}>
          <input type="radio" name="adoption-target" disabled={busy} checked={selectedId === row.id} onChange={() => setSelectedId(row.id)} className="accent-[#111827]"/>
          <span><span className="flex items-center gap-2"><b>{fmt.exerciseName(row)}</b>{!query && index === 0 && <span className="rounded border border-[#F2D9A6] bg-[#FEF3C7] px-1.5 py-px text-[11px]">{labels.closest}</span>}</span><span className="text-xs text-fg-tertiary">{EXERCISE_TYPE_LABEL[row.exercise_type]} · {row.muscle_groups.map(muscle => MUSCLE_LABEL[muscle]).join(' / ')} · {row.equipment.map(item => EQUIPMENT_LABEL[item]).join(' / ')}</span></span>
        </label>)}
      </div>
      <input aria-label={labels.searchOfficial} placeholder={labels.searchOfficialHint} disabled={busy} value={search} onChange={event => { setSearch(event.target.value); setSelectedId(event.target.value.trim() ? '' : recommendations[0]?.id ?? '') }} className="mt-0.5 h-[38px] rounded-md border border-border-strong px-3 text-[13px]"/>
    </div>}
    {refreshError && <ErrorState retry={onRetryRefresh}/>}
    {!group.rows.length && <p role="status" className="mt-3 text-[13px] text-fg-secondary">{labels.alreadyProcessed}</p>}
    {error && <p role="alert" className="mt-3 text-[13px] text-fg-secondary">{error}</p>}
    <div className="mt-[18px] flex flex-wrap items-center justify-between gap-3 border-t border-[#EEF0F3] pt-4">
      {mode === 'existing' && <button type="button" disabled={busy} onClick={() => setMode('new')} className="text-[13px] underline underline-offset-4">{labels.newInstead}</button>}
      <div className="ml-auto flex gap-2"><button type="button" disabled={busy} onClick={onClose} className="admin-secondary">{S.common.cancel}</button><button type="button" disabled={busy || refreshing || refreshError || !group.rows.length || (mode === 'new' ? !validNew : !selected)} onClick={() => void submit()} className="admin-primary">{mode === 'new' ? labels.createOfficial : labels.assign(selected ? fmt.exerciseName(selected) : '')}</button></div>
    </div>
  </dialog>
}

function toggle<T>(values: T[], value: T): T[] {
  return values.includes(value) ? values.filter(item => item !== value) : [...values, value]
}

function Choices({ label, children }: { label: string; children: ReactNode }) {
  return <div role="group" aria-label={label}><div className="mb-1.5 text-[12.5px] font-medium text-fg-secondary">{label}</div><div className="flex flex-wrap gap-1.5">{children}</div></div>
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return <button type="button" aria-pressed={active} onClick={onClick} className={`h-[30px] rounded-full border px-3 text-[12.5px] ${active ? 'border-[#111827] bg-[#111827] text-white' : 'border-border-strong bg-s1 text-fg-secondary'}`}>{children}</button>
}
