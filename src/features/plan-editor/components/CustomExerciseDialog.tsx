import { useEffect, useRef, useState } from 'react'
import type { CreateCustomExerciseInput } from '../../../api/exercises'
import type { Equipment, MovementPattern, MuscleGroup } from '../../../api/types'

interface Props {
  open: boolean
  initialName: string
  saving: boolean
  error: string
  onClose: () => void
  onSubmit: (input: CreateCustomExerciseInput) => void | Promise<void>
}

const muscleOptions: { value: MuscleGroup; label: string }[] = [
  { value: 'core', label: '核心' },
  { value: 'chest', label: '胸' },
  { value: 'back', label: '背' },
  { value: 'shoulder', label: '肩' },
  { value: 'triceps', label: '三头' },
  { value: 'biceps', label: '二头' },
  { value: 'quad', label: '股四头' },
  { value: 'hamstring', label: '腘绳肌' },
  { value: 'glute', label: '臀' },
  { value: 'hip', label: '髋' },
  { value: 'mobility', label: '灵活性' },
  { value: 'calf', label: '小腿' },
  { value: 'forearm', label: '前臂' },
  { value: 'trap', label: '斜方肌' },
  { value: 'adductor', label: '内收肌' },
]

const equipmentOptions: { value: Equipment; label: string }[] = [
  { value: 'bodyweight', label: '徒手' },
  { value: 'barbell', label: '杠铃' },
  { value: 'dumbbell', label: '哑铃' },
  { value: 'cable', label: '绳索' },
  { value: 'machine', label: '器械' },
  { value: 'band', label: '弹力带' },
  { value: 'kettlebell', label: '壶铃' },
  { value: 'specialty_bar', label: '特殊杆' },
  { value: 'other', label: '其他' },
]

const movementOptions: { value: MovementPattern; label: string }[] = [
  { value: 'other', label: '其他' },
  { value: 'squat', label: '蹲' },
  { value: 'hip_hinge', label: '髋铰链' },
  { value: 'horizontal_push', label: '水平推' },
  { value: 'vertical_push', label: '垂直推' },
  { value: 'horizontal_pull', label: '水平拉' },
  { value: 'vertical_pull', label: '垂直拉' },
  { value: 'warm_up', label: '热身' },
]

function guessFields(rawName: string): Pick<CreateCustomExerciseInput, 'muscleGroup' | 'equipment' | 'movementPattern'> {
  const name = rawName.toLowerCase()
  const equipment: Equipment =
    /哑铃|db|dumbbell/.test(name) ? 'dumbbell'
      : /杠铃|barbell/.test(name) ? 'barbell'
        : /绳索|龙门|cable/.test(name) ? 'cable'
          : /弹力|弹力带|band/.test(name) ? 'band'
            : /器械|machine|史密斯/.test(name) ? 'machine'
              : /壶铃|kettlebell/.test(name) ? 'kettlebell'
                : /安全杆|ssb|特殊杆/.test(name) ? 'specialty_bar'
                  : 'bodyweight'
  const muscleGroup: MuscleGroup =
    /平板|支撑|腹|卷腹|核心|core|plank/.test(name) ? 'core'
      : /卧推|俯卧撑|胸|夹胸|chest|push.?up/.test(name) ? 'chest'
        : /划船|下拉|引体|背|row|pulldown|pull.?up/.test(name) ? 'back'
          : /肩|推举|侧平举|shoulder|press/.test(name) ? 'shoulder'
            : /三头|臂屈伸|triceps/.test(name) ? 'triceps'
              : /二头|弯举|biceps|curl/.test(name) ? 'biceps'
                : /臀|glute|臀推|髋推/.test(name) ? 'glute'
                  : /腘|腿弯举|hamstring/.test(name) ? 'hamstring'
                    : /髋|hip/.test(name) ? 'hip'
                      : /蹲|腿举|腿屈伸|quad|股四/.test(name) ? 'quad'
                        : 'core'
  const movementPattern: MovementPattern =
    /蹲|腿举|squat/.test(name) ? 'squat'
      : /硬拉|臀推|髋推|hinge|deadlift/.test(name) ? 'hip_hinge'
        : /卧推|俯卧撑|夹胸|horizontal.*push/.test(name) ? 'horizontal_push'
          : /推举|实力推|肩推|press/.test(name) ? 'vertical_push'
            : /划船|row/.test(name) ? 'horizontal_pull'
              : /下拉|引体|pulldown|pull.?up/.test(name) ? 'vertical_pull'
                : /热身|激活|warm/.test(name) ? 'warm_up'
                  : 'other'
  return { muscleGroup, equipment, movementPattern }
}

const fieldWrap: React.CSSProperties = { display: 'grid', gap: 7 }
const label: React.CSSProperties = { color: 'var(--fg-tertiary)', fontSize: 12, fontWeight: 600 }
const input: React.CSSProperties = {
  height: 40,
  borderRadius: 8,
  border: '1px solid var(--border-strong)',
  background: 'var(--surface-1)',
  color: 'var(--fg-primary)',
  padding: '0 11px',
  font: 'inherit',
  outline: 'none',
}

export function CustomExerciseDialog({ open, initialName, saving, error, onClose, onSubmit }: Props) {
  const [name, setName] = useState('')
  const [muscleGroup, setMuscleGroup] = useState<MuscleGroup>('core')
  const [equipment, setEquipment] = useState<Equipment>('bodyweight')
  const [movementPattern, setMovementPattern] = useState<MovementPattern>('other')
  const nameRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!open) return
    const trimmed = initialName.trim()
    const guessed = guessFields(trimmed)
    setName(trimmed)
    setMuscleGroup(guessed.muscleGroup ?? 'core')
    setEquipment(guessed.equipment ?? 'bodyweight')
    setMovementPattern(guessed.movementPattern ?? 'other')
    window.setTimeout(() => nameRef.current?.focus(), 0)
  }, [initialName, open])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !saving) onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose, open, saving])

  if (!open) return null
  const trimmed = name.trim()

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
          void onSubmit({ name: trimmed, muscleGroup, equipment, movementPattern })
        }}
        style={{
          width: 420,
          maxWidth: 'calc(100vw - 32px)',
          borderRadius: 8,
          border: '1px solid var(--border-strong)',
          background: 'var(--surface-2)',
          boxShadow: 'var(--elev-modal)',
          padding: 18,
          display: 'grid',
          gap: 14,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--fg-primary)' }}>新建动作</div>
          <span style={{ color: 'var(--fg-tertiary)', fontFamily: 'var(--font-mono)', fontSize: 10 }}>CUSTOM</span>
        </div>

        <label style={fieldWrap}>
          <span style={label}>动作名称</span>
          <input
            ref={nameRef}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="例如：平板侧支撑"
            style={input}
          />
        </label>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <label style={fieldWrap}>
            <span style={label}>目标部位</span>
            <select value={muscleGroup} onChange={(e) => setMuscleGroup(e.target.value as MuscleGroup)} style={input}>
              {muscleOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </label>
          <label style={fieldWrap}>
            <span style={label}>器械</span>
            <select value={equipment} onChange={(e) => setEquipment(e.target.value as Equipment)} style={input}>
              {equipmentOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </label>
        </div>

        <label style={fieldWrap}>
          <span style={label}>动作模式</span>
          <select value={movementPattern} onChange={(e) => setMovementPattern(e.target.value as MovementPattern)} style={input}>
            {movementOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </label>

        {error && <div style={{ color: 'var(--brand-red)', fontSize: 12, fontWeight: 600 }}>{error}</div>}

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, paddingTop: 2 }}>
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            style={{
              border: '1px solid var(--border-strong)',
              background: 'transparent',
              color: 'var(--fg-secondary)',
              borderRadius: 8,
              padding: '9px 14px',
              fontWeight: 700,
              cursor: saving ? 'default' : 'pointer',
            }}
          >
            取消
          </button>
          <button
            type="submit"
            disabled={!trimmed || saving}
            style={{
              border: '1px solid var(--ink)',
              background: 'var(--ink)',
              color: 'var(--white)',
              borderRadius: 8,
              padding: '9px 16px',
              fontWeight: 800,
              cursor: !trimmed || saving ? 'default' : 'pointer',
              opacity: !trimmed || saving ? 0.6 : 1,
            }}
          >
            {saving ? '创建中…' : '创建'}
          </button>
        </div>
      </form>
    </div>
  )
}
