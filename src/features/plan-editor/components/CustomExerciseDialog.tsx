import { useEffect, useMemo, useRef, useState } from 'react'
import type { CreateCustomExerciseInput } from '../../../api/exercises'
import type { Equipment, LiftFamily, MovementPattern, MuscleGroup } from '../../../api/types'
import { useGlobalKeyboardHandler } from '../../workspace/globalKeyboard'
import { fmt, resolveLocale, S } from '../../../i18n/strings'
import { EQUIPMENT_LABEL, LIFT_FAMILY_LABEL, MOVEMENT_PATTERN_LABEL, MUSCLE_LABEL } from '../../catalog/catalogModel'
import { STABLE_ZH } from '../../../i18n/stable-zh'
import type { ExerciseHit, ExerciseIndex } from '../exerciseIndex'
import { registerReloadBlocker } from '../../../reloadSafety'

interface Props {
  open: boolean
  initialName: string
  /** Seeds 分类: 'main' when the coach adds from the 主项及变式 section. */
  initialTier?: 'main' | 'aux'
  saving: boolean
  error: string
  index?: ExerciseIndex | null
  onClose: () => void
  onSubmit: (input: CreateCustomExerciseInput) => void | Promise<void>
  onUseExisting?: (hit: ExerciseHit) => void
}

const muscleOptions: MuscleGroup[] = [
  'core', 'chest', 'back', 'shoulder', 'triceps', 'biceps', 'quad', 'hamstring',
  'glute', 'hip', 'mobility', 'calf', 'forearm', 'trap', 'adductor',
]

const equipmentOptions: Equipment[] = [
  'bodyweight', 'barbell', 'dumbbell', 'cable', 'machine', 'band', 'kettlebell',
  'specialty_bar', 'other',
]

const typeOptions: ('accessory' | 'main_lift_variation')[] = ['accessory', 'main_lift_variation']

const familyOptions: LiftFamily[] = ['squat', 'bench', 'deadlift']

export function guessLiftFamily(rawName: string): LiftFamily | null {
  const name = rawName.toLowerCase()
  if (STABLE_ZH.catalogGuess.lift.bench.test(name)) return 'bench'
  if (STABLE_ZH.catalogGuess.lift.deadlift.test(name)) return 'deadlift'
  if (STABLE_ZH.catalogGuess.lift.squat.test(name)) return 'squat'
  return null
}

const movementOptions: MovementPattern[] = [
  'other', 'squat', 'hip_hinge', 'horizontal_push', 'vertical_push', 'horizontal_pull',
  'vertical_pull', 'warm_up',
]

function guessFields(rawName: string): Pick<CreateCustomExerciseInput, 'muscleGroup' | 'equipment' | 'movementPattern'> {
  const name = rawName.toLowerCase()
  const patterns = STABLE_ZH.catalogGuess
  const equipment: Equipment =
    patterns.equipment.dumbbell.test(name) ? 'dumbbell'
      : patterns.equipment.barbell.test(name) ? 'barbell'
        : patterns.equipment.cable.test(name) ? 'cable'
          : patterns.equipment.band.test(name) ? 'band'
            : patterns.equipment.machine.test(name) ? 'machine'
              : patterns.equipment.kettlebell.test(name) ? 'kettlebell'
                : patterns.equipment.specialty_bar.test(name) ? 'specialty_bar'
                  : 'bodyweight'
  const muscleGroup: MuscleGroup =
    patterns.muscle.core.test(name) ? 'core'
      : patterns.muscle.chest.test(name) ? 'chest'
        : patterns.muscle.back.test(name) ? 'back'
          : patterns.muscle.shoulder.test(name) ? 'shoulder'
            : patterns.muscle.triceps.test(name) ? 'triceps'
              : patterns.muscle.biceps.test(name) ? 'biceps'
                : patterns.muscle.glute.test(name) ? 'glute'
                  : patterns.muscle.hamstring.test(name) ? 'hamstring'
                    : patterns.muscle.hip.test(name) ? 'hip'
                      : patterns.muscle.quad.test(name) ? 'quad'
                        : 'core'
  const movementPattern: MovementPattern =
    patterns.movement.squat.test(name) ? 'squat'
      : patterns.movement.hip_hinge.test(name) ? 'hip_hinge'
        : patterns.movement.horizontal_push.test(name) ? 'horizontal_push'
          : patterns.movement.vertical_push.test(name) ? 'vertical_push'
            : patterns.movement.horizontal_pull.test(name) ? 'horizontal_pull'
              : patterns.movement.vertical_pull.test(name) ? 'vertical_pull'
                : patterns.movement.warm_up.test(name) ? 'warm_up'
                  : 'other'
  return { muscleGroup, equipment, movementPattern }
}

const fieldWrap: React.CSSProperties = { display: 'grid', gap: 7 }
const label: React.CSSProperties = { color: 'var(--mut)', fontSize: 12, fontWeight: 600 }
const input: React.CSSProperties = {
  height: 40,
  borderRadius: 'var(--r-sm)',
  border: '1px solid var(--bd)',
  background: 'var(--card-bg)',
  color: 'var(--txt)',
  padding: '0 11px',
  font: 'inherit',
  outline: 'none',
}

export function CustomExerciseDialog({ open, initialName, initialTier, saving, error, index, onClose, onSubmit, onUseExisting }: Props) {
  const [name, setName] = useState('')
  const [nameEn, setNameEn] = useState('')
  const [exerciseType, setExerciseType] = useState<'accessory' | 'main_lift_variation'>('accessory')
  const [mainLiftFamily, setMainLiftFamily] = useState<LiftFamily>('squat')
  const [muscleGroup, setMuscleGroup] = useState<MuscleGroup>('core')
  const [equipment, setEquipment] = useState<Equipment>('bodyweight')
  const [movementPattern, setMovementPattern] = useState<MovementPattern>('other')
  const nameRef = useRef<HTMLInputElement>(null)
  const reloadBlockedRef = useRef(false)
  reloadBlockedRef.current = open || saving

  useEffect(() => registerReloadBlocker(() => reloadBlockedRef.current), [])

  useEffect(() => {
    if (!open) return
    const trimmed = initialName.trim()
    const guessed = guessFields(trimmed)
    const family = guessLiftFamily(trimmed)
    setName(trimmed)
    setNameEn('')
    setExerciseType(initialTier === 'main' ? 'main_lift_variation' : 'accessory')
    setMainLiftFamily(family ?? 'squat')
    setMuscleGroup(guessed.muscleGroup ?? 'core')
    setEquipment(guessed.equipment ?? 'bodyweight')
    setMovementPattern(guessed.movementPattern ?? 'other')
    window.setTimeout(() => nameRef.current?.focus(), 0)
  }, [initialName, initialTier, open])

  useGlobalKeyboardHandler(({ event }) => {
    if (!open || saving || event.key !== 'Escape') return false
    event.preventDefault()
    onClose()
    return true
  }, 200)

  const trimmed = name.trim()
  const candidates = useMemo(
    () => open && trimmed && index ? index.search(trimmed, 5) : [],
    [index, open, trimmed],
  )
  if (!open) return null

  return (
    <div
      onMouseDown={() => { if (!saving) onClose() }}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 120,
        display: 'grid',
        placeItems: 'center',
        background: 'color-mix(in srgb, var(--txt) 42%, transparent)',
      }}
    >
      <form
        onMouseDown={(e) => e.stopPropagation()}
        onSubmit={(e) => {
          e.preventDefault()
          if (!trimmed || saving) return
          void onSubmit({
            name: trimmed,
            nameEn: nameEn.trim() || null,
            exerciseType,
            mainLiftFamily: exerciseType === 'main_lift_variation' ? mainLiftFamily : undefined,
            muscleGroup,
            equipment,
            movementPattern,
          })
        }}
        style={{
          width: 420,
          maxWidth: 'calc(100vw - 32px)',
          borderRadius: 'var(--r-sm)',
          border: '1px solid var(--bd)',
          background: 'var(--panel-bg)',
          boxShadow: 'var(--elev-modal)',
          padding: 18,
          display: 'grid',
          gap: 14,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--txt)' }}>{S.catalog.newExercise}</div>
          <span style={{ color: 'var(--mut)', fontFamily: 'var(--font-mono)', fontSize: 10 }}>CUSTOM</span>
        </div>

        <label style={fieldWrap}>
          <span style={label}>{S.catalog.exerciseName}</span>
          <input
            ref={nameRef}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={S.catalog.customDialogExample}
            style={input}
          />
        </label>

        <label style={fieldWrap}>
          <span style={label}>{S.catalog.englishName} · {S.catalog.optional}</span>
          <input
            value={nameEn}
            maxLength={120}
            onChange={(e) => setNameEn(e.target.value)}
            style={input}
          />
        </label>

        {candidates.length > 0 && onUseExisting && (
          <div className="catalog-existing-candidates" style={fieldWrap}>
            <span style={label}>{S.catalog.possibleExisting}</span>
            <div>{candidates.map((candidate) => (
              <button key={candidate.id} type="button" onClick={() => onUseExisting(candidate)}>
                <b>{fmt.exerciseName(candidate)}</b>
                {resolveLocale() === 'zh' && candidate.name_en && <small>{candidate.name_en}</small>}
                <em>{S.catalog.useExisting}</em>
              </button>
            ))}</div>
          </div>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <label style={fieldWrap}>
            <span style={label}>{S.common.category}</span>
            <select value={exerciseType} onChange={(e) => setExerciseType(e.target.value as 'accessory' | 'main_lift_variation')} style={input}>
              {typeOptions.map((value) => <option key={value} value={value}>{value === 'accessory' ? S.common.accessoryItem : S.common.mainLiftVariation}</option>)}
            </select>
          </label>
          {exerciseType === 'main_lift_variation' && (
            <label style={fieldWrap}>
              <span style={label}>{S.catalog.belongsToMainLift}</span>
              <select value={mainLiftFamily} onChange={(e) => setMainLiftFamily(e.target.value as LiftFamily)} style={input}>
                {familyOptions.map((value) => <option key={value} value={value}>{LIFT_FAMILY_LABEL[value]}</option>)}
              </select>
            </label>
          )}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <label style={fieldWrap}>
            <span style={label}>{S.catalog.targetArea}</span>
            <select value={muscleGroup} onChange={(e) => setMuscleGroup(e.target.value as MuscleGroup)} style={input}>
              {muscleOptions.map((value) => <option key={value} value={value}>{MUSCLE_LABEL[value]}</option>)}
            </select>
          </label>
          <label style={fieldWrap}>
            <span style={label}>{S.common.equipment}</span>
            <select value={equipment} onChange={(e) => setEquipment(e.target.value as Equipment)} style={input}>
              {equipmentOptions.map((value) => <option key={value} value={value}>{EQUIPMENT_LABEL[value]}</option>)}
            </select>
          </label>
        </div>

        <label style={fieldWrap}>
          <span style={label}>{S.catalog.movementPattern}</span>
          <select value={movementPattern} onChange={(e) => setMovementPattern(e.target.value as MovementPattern)} style={input}>
            {movementOptions.map((value) => <option key={value} value={value}>{MOVEMENT_PATTERN_LABEL[value]}</option>)}
          </select>
        </label>

        {error && <div style={{ color: 'var(--bad)', fontSize: 12, fontWeight: 600 }}>{error}</div>}

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, paddingTop: 2 }}>
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            style={{
              border: '1px solid var(--bd)',
              background: 'transparent',
              color: 'var(--sec)',
              borderRadius: 'var(--r-sm)',
              padding: '9px 14px',
              fontWeight: 700,
              cursor: saving ? 'default' : 'pointer',
            }}
          >
            {S.common.cancel}
          </button>
          <button
            type="submit"
            disabled={!trimmed || saving}
            style={{
              border: '1px solid var(--ink)',
              background: 'var(--ink)',
              color: 'var(--white)',
              borderRadius: 'var(--r-sm)',
              padding: '9px 16px',
              fontWeight: 800,
              cursor: !trimmed || saving ? 'default' : 'pointer',
              opacity: !trimmed || saving ? 0.6 : 1,
            }}
          >
            {saving ? S.catalog.creating : S.catalog.create}
          </button>
        </div>
      </form>
    </div>
  )
}
