import { useEffect, useMemo, useState } from 'react'
import type { CreateCustomExerciseInput } from '../../api/exercises'
import type { Equipment, ExerciseResponse, MovementPattern, MuscleGroup } from '../../api/types'
import type { ExerciseIndex } from '../plan-editor/exerciseIndex'
import type { Catalog } from '../plan-editor/mapping'
import {
  EQUIPMENT_LABEL,
  EQUIPMENT_OPTIONS,
  EXERCISE_TYPE_LABEL,
  EXERCISE_TYPE_SHORT_LABEL,
  FAMILY_CATEGORIES,
  LIFT_FAMILY_LABEL,
  MOVEMENT_PATTERN_LABEL,
  MOVEMENT_PATTERN_OPTIONS,
  MUSCLE_LABEL,
  MUSCLE_OPTIONS,
  aliasesForExercise,
  availableMuscleRegions,
  filterExercises,
  guessCatalogFields,
  type CatalogCategory,
  type CatalogRefine,
} from './catalogModel'

interface Props {
  exerciseList: ExerciseResponse[]
  catalog: Catalog | null
  index: ExerciseIndex | null
  onCreateExercise: (input: CreateCustomExerciseInput) => Promise<{ id: string; name: string }>
  onUseExercise: (exercise: ExerciseResponse) => void
}

type DrawerMode = 'detail' | 'create' | null

function directSearchIds(exercises: ExerciseResponse[], query: string): Set<string> {
  const normalized = query.trim().toLowerCase()
  return new Set(exercises.filter((exercise) => (
    exercise.name.toLowerCase().includes(normalized)
    || (exercise.name_en?.toLowerCase().includes(normalized) ?? false)
  )).map((exercise) => exercise.id))
}

export function CatalogPage({ exerciseList, catalog, index, onCreateExercise, onUseExercise }: Props) {
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState<CatalogCategory>('all')
  const [refine, setRefine] = useState<CatalogRefine>('all')
  const [equipment, setEquipment] = useState<Equipment | 'all'>('all')
  const [sortDirection, setSortDirection] = useState<1 | -1>(1)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [drawer, setDrawer] = useState<DrawerMode>(null)
  const [createPrefill, setCreatePrefill] = useState('')
  const [toast, setToast] = useState('')
  const [creating, setCreating] = useState(false)

  const isCustom = (exercise: ExerciseResponse) => (
    catalog?.get(exercise.id)?.custom ?? exercise.created_by_coach_id != null
  )
  const displayName = (exercise: ExerciseResponse) => catalog?.get(exercise.id)?.name ?? exercise.name
  const trimmedQuery = query.trim()
  const searchIds = useMemo(() => {
    if (!trimmedQuery) return undefined
    const hits = index?.search(trimmedQuery, exerciseList.length)
    return hits ? new Set(hits.map((hit) => hit.id)) : directSearchIds(exerciseList, trimmedQuery)
  }, [exerciseList, index, trimmedQuery])

  const rows = useMemo(() => filterExercises(exerciseList, {
    category,
    refine,
    equipment,
    query: trimmedQuery,
    searchIds,
    isCustom: (exercise) => catalog?.get(exercise.id)?.custom ?? exercise.created_by_coach_id != null,
  }).sort((a, b) => displayName(a).localeCompare(displayName(b), 'zh-CN') * sortDirection),
  // Catalog entries only change together with exerciseList in the workspace.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  [catalog, category, equipment, exerciseList, refine, searchIds, sortDirection, trimmedQuery])

  const muscleRegions = useMemo(() => availableMuscleRegions(exerciseList), [exerciseList])
  const selected = selectedId ? exerciseList.find((exercise) => exercise.id === selectedId) ?? null : null

  useEffect(() => {
    if (!toast) return
    const id = window.setTimeout(() => setToast(''), 2600)
    return () => window.clearTimeout(id)
  }, [toast])

  useEffect(() => {
    if (!drawer) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !creating) setDrawer(null)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [drawer, creating])

  const facetCount = (nextCategory: CatalogCategory, nextRefine: CatalogRefine) => filterExercises(exerciseList, {
    category: nextCategory,
    refine: nextRefine,
    equipment,
    query: '',
    isCustom,
  }).length

  const chooseCategory = (next: CatalogCategory) => {
    setCategory(next)
    setQuery('')
  }
  const openDetail = (exercise: ExerciseResponse) => {
    setSelectedId(exercise.id)
    setDrawer('detail')
  }
  const openCreate = (prefill = '') => {
    setCreatePrefill(prefill.trim())
    setDrawer('create')
  }
  const closeDrawer = () => { if (creating) return; setDrawer(null) }

  const refineOptions: { id: CatalogRefine; label: string }[] = [
    { id: 'all', label: '全部' },
    { id: 'main_lift', label: '主项' },
    { id: 'main_lift_variation', label: '主项变式' },
    { id: 'accessory', label: '辅助' },
  ]

  const renderRow = (exercise: ExerciseResponse) => {
    const custom = isCustom(exercise)
    const primaryMuscle = exercise.muscle_groups[0]
    const open = () => openDetail(exercise)
    return <div
      key={exercise.id}
      className={`roster-row catalog-row${selectedId === exercise.id && drawer === 'detail' ? ' selected' : ''}`}
      role="row"
      tabIndex={0}
      onClick={open}
      onKeyDown={(event) => {
        if (event.key !== 'Enter' && event.key !== ' ') return
        event.preventDefault()
        open()
      }}
    >
      <div className="catalog-name-cell" role="cell">
        <div className="catalog-name">
          {displayName(exercise)}
          {exercise.is_competition_lift && <span className="catalog-competition-badge" title="比赛动作">赛</span>}
          {custom && <span className="catalog-tag mine">自建</span>}
        </div>
        <div className="catalog-name-en">{exercise.name_en || '—'}</div>
      </div>
      <div role="cell"><span className={`catalog-tag ${exercise.exercise_type}`}>{EXERCISE_TYPE_SHORT_LABEL[exercise.exercise_type]}</span></div>
      <div className="catalog-muted" role="cell">{exercise.equipment.length ? exercise.equipment.map((item) => EQUIPMENT_LABEL[item]).join(' · ') : '—'}</div>
      <div role="cell">{primaryMuscle
        ? <span className="catalog-meta-tag primary">{MUSCLE_LABEL[primaryMuscle]}</span>
        : <span className="catalog-muted">—</span>}</div>
    </div>
  }

  const primaryRows = rows.filter((exercise) => exercise.exercise_type !== 'accessory')
  const accessoryRows = rows.filter((exercise) => exercise.exercise_type === 'accessory')

  return <main className="data-page catalog-page">
    <div className="catalog-body">
      <aside className="catalog-categories" aria-label="动作分类">
        <CategoryButton id="all" label="全部动作" count={facetCount('all', refine)} active={!trimmedQuery && category === 'all'} onChoose={chooseCategory} />
        <CategoryButton id="mine" label="我的自建" count={facetCount('mine', refine)} active={!trimmedQuery && category === 'mine'} onChoose={chooseCategory} />
        <div className="catalog-category-heading">比赛三项 · 按项</div>
        {FAMILY_CATEGORIES.map((family) => <CategoryButton
          key={family}
          id={family}
          label={`${family === 'squat' ? 'S' : family === 'bench' ? 'B' : 'D'} ${LIFT_FAMILY_LABEL[family]}族`}
          count={facetCount(family, refine)}
          active={!trimmedQuery && category === family}
          onChoose={chooseCategory}
        />)}
        {muscleRegions.map((region) => <div key={region.id}>
          <div className="catalog-category-heading">{region.label}</div>
          {region.muscles.map((muscle) => <CategoryButton
            key={muscle}
            id={muscle}
            label={MUSCLE_LABEL[muscle]}
            count={facetCount(muscle, refine)}
            active={!trimmedQuery && category === muscle}
            onChoose={chooseCategory}
          />)}
        </div>)}
      </aside>

      <section className="catalog-table-area">
        <header className="catalog-toolbar">
          <label className="catalog-search">
            <span className="catalog-search-icon" aria-hidden="true" />
            <input
              value={query}
              onChange={(event) => {
                setQuery(event.target.value)
                if (event.target.value.trim()) setRefine('all')
              }}
              placeholder="搜动作名 / 英文 / 别名，回车直达"
              aria-label="搜索动作库"
            />
            {query && <button type="button" aria-label="清除搜索" onClick={() => setQuery('')}>✕</button>}
          </label>
          <select
            className={`catalog-equipment-select${equipment !== 'all' ? ' active' : ''}`}
            value={equipment}
            onChange={(event) => setEquipment(event.target.value as Equipment | 'all')}
            aria-label="按器械筛选"
          >
            <option value="all">器械 · 全部</option>
            {EQUIPMENT_OPTIONS.map((item) => <option key={item} value={item}>器械 · {EQUIPMENT_LABEL[item]}</option>)}
          </select>
          <span className="catalog-result-count">{rows.length} 个动作</span>
          <button type="button" className="catalog-create-button" onClick={() => openCreate()}>＋ 新建动作</button>
        </header>
        <div className="catalog-refine">
          <span>分类</span>
          {refineOptions.map((option) => <button
            type="button"
            key={option.id}
            className={refine === option.id ? 'active' : ''}
            onClick={() => {
              setQuery('')
              setRefine(option.id)
            }}
          >{option.label}<small>{facetCount(category, option.id)}</small></button>)}
        </div>
        <div className="catalog-table" role="table" aria-label="动作列表">
          <div className="catalog-table-head" role="row">
            <button
              type="button"
              role="columnheader"
              aria-sort={sortDirection === 1 ? 'ascending' : 'descending'}
              onClick={() => setSortDirection((value) => value === 1 ? -1 : 1)}
            >动作 <span className="catalog-sort-arrow">{sortDirection === 1 ? '↑' : '↓'}</span></button>
            <span role="columnheader">分类</span><span role="columnheader">器械</span><span role="columnheader">肌群</span>
          </div>
          <div className="catalog-table-wrap" role="rowgroup">
            {rows.length === 0
              ? <div className="catalog-empty">{trimmedQuery
                ? <>没有叫「{trimmedQuery}」的动作<br /><button type="button" onClick={() => openCreate(trimmedQuery)}>＋ 新建「{trimmedQuery}」</button></>
                : '这个分类下暂无动作'}</div>
              : !trimmedQuery && category === 'all'
                ? <>
                    {primaryRows.length > 0 && <><GroupRow label="比赛三项与变式" count={primaryRows.length} />{primaryRows.map(renderRow)}</>}
                    {accessoryRows.length > 0 && <><GroupRow label="辅助动作" count={accessoryRows.length} />{accessoryRows.map(renderRow)}</>}
                  </>
                : rows.map(renderRow)}
          </div>
        </div>
      </section>
    </div>

    <div className={`catalog-drawer-scrim${drawer ? ' visible' : ''}`} onMouseDown={closeDrawer} />
    {drawer === 'detail' && selected && <ExerciseDetailDrawer
      exercise={selected}
      displayName={displayName(selected)}
      custom={isCustom(selected)}
      onClose={closeDrawer}
      onUse={() => onUseExercise(selected)}
    />}
    {drawer === 'create' && <CreateExerciseDrawer
      key={createPrefill}
      initialName={createPrefill}
      onClose={closeDrawer}
      onCreate={async (input) => {
        setCreating(true)
        try {
          const created = await onCreateExercise(input)
          setCategory('mine')
          setRefine('all')
          setQuery('')
          setSelectedId(created.id)
          setDrawer('detail')
          setToast(`已创建「${created.name}」，现在就能写进计划`)
        } finally {
          setCreating(false)
        }
      }}
    />}
    {toast && <div className="catalog-toast"><span>✓</span>{toast}</div>}
  </main>
}

function CategoryButton({ id, label, count, active, onChoose }: {
  id: CatalogCategory
  label: string
  count: number
  active: boolean
  onChoose: (category: CatalogCategory) => void
}) {
  return <button type="button" className={`catalog-category${active ? ' active' : ''}`} aria-pressed={active} onClick={() => onChoose(id)}>
    <span>{label}</span><small>{count}</small>
  </button>
}

function GroupRow({ label, count }: { label: string; count: number }) {
  return <div className="catalog-group-row" role="row"><span role="cell">{label} · {count}</span></div>
}

function MetaTags<T extends string>({ values, labels, primary = false }: { values: T[]; labels: Record<T, string>; primary?: boolean }) {
  if (values.length === 0) return <span className="catalog-muted">无</span>
  return <>{values.map((value, index) => <span key={value} className={`catalog-meta-tag${primary && index === 0 ? ' primary' : ''}`}>{labels[value]}</span>)}</>
}

function ExerciseDetailDrawer({ exercise, displayName, custom, onClose, onUse }: {
  exercise: ExerciseResponse
  displayName: string
  custom: boolean
  onClose: () => void
  onUse: () => void
}) {
  const aliases = aliasesForExercise(exercise)
  const primaryMuscle = exercise.muscle_groups[0]
  const synergists = exercise.muscle_groups.slice(1)
  return <aside className="writing-panel catalog-drawer" role="dialog" aria-label={`${displayName}详情`}>
    <header className="catalog-drawer-header">
      <div><h2>{displayName}</h2>{exercise.name_en && <small>{exercise.name_en}</small>}</div>
      <button type="button" aria-label="关闭详情" onClick={onClose}>✕</button>
      <div className="catalog-drawer-badges">
        <span className={`catalog-tag ${exercise.exercise_type}`}>{EXERCISE_TYPE_LABEL[exercise.exercise_type]}</span>
        {exercise.main_lift_family && <span className="catalog-tag neutral">{LIFT_FAMILY_LABEL[exercise.main_lift_family]}族</span>}
        {exercise.is_competition_lift && <span className="catalog-tag main_lift">比赛动作</span>}
        {custom && <span className="catalog-tag mine">我的自建</span>}
      </div>
    </header>
    <div className="catalog-drawer-body">
      <dl className="catalog-fields">
        <div><dt>动作分类</dt><dd>{EXERCISE_TYPE_LABEL[exercise.exercise_type]}</dd></div>
        <div><dt>主项族</dt><dd>{exercise.main_lift_family ? LIFT_FAMILY_LABEL[exercise.main_lift_family] : '通用 / 无（辅助动作）'}</dd></div>
        <div><dt>动作模式</dt><dd><MetaTags values={exercise.movement_pattern} labels={MOVEMENT_PATTERN_LABEL} /></dd></div>
        <div><dt>器械</dt><dd><MetaTags values={exercise.equipment} labels={EQUIPMENT_LABEL} /></dd></div>
        <div><dt>主肌群</dt><dd>{primaryMuscle ? <span className="catalog-meta-tag primary">{MUSCLE_LABEL[primaryMuscle]}</span> : <span className="catalog-muted">无</span>}</dd></div>
        <div><dt>协同肌群</dt><dd><MetaTags values={synergists} labels={MUSCLE_LABEL} /></dd></div>
        <div><dt>别名</dt><dd>{aliases.length ? aliases.map((alias) => <span key={alias} className="catalog-meta-tag">{alias}</span>) : <span className="catalog-muted">无</span>}</dd></div>
      </dl>
      <div className="catalog-drawer-note">{custom
        ? <><b>我的自建动作</b>：已可在你的所有计划中使用。编辑和删除需后端端点支持。</>
        : '系统内置动作，参数由 MeetPR 统一维护。'}</div>
    </div>
    <footer className="catalog-drawer-footer">{custom
      ? <><button type="button" className="catalog-disabled-action" disabled>删除 · 暂不支持</button><button type="button" className="catalog-disabled-action" disabled>编辑 · 暂不支持</button></>
      : <button type="button" className="catalog-white-action" onClick={onUse}>＋ 在计划中使用</button>}</footer>
  </aside>
}

interface CreateDraft {
  name: string
  primaryMuscle: MuscleGroup | null
  synergists: MuscleGroup[]
  equipment: Equipment[]
  movementPattern: MovementPattern
}

function initialCreateDraft(initialName: string): CreateDraft {
  if (!initialName.trim()) return { name: '', primaryMuscle: null, synergists: [], equipment: [], movementPattern: 'other' }
  const guessed = guessCatalogFields(initialName)
  return { name: initialName, primaryMuscle: guessed.primaryMuscle, synergists: [], equipment: [guessed.equipment], movementPattern: guessed.movementPattern }
}

function CreateExerciseDrawer({ initialName, onClose, onCreate }: {
  initialName: string
  onClose: () => void
  onCreate: (input: CreateCustomExerciseInput) => Promise<void>
}) {
  const [draft, setDraft] = useState<CreateDraft>(() => initialCreateDraft(initialName))
  const [autoGuess, setAutoGuess] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const updateName = (name: string) => {
    if (!autoGuess || !name.trim()) {
      setDraft((current) => ({ ...current, name }))
      return
    }
    const guessed = guessCatalogFields(name)
    setDraft((current) => ({
      ...current,
      name,
      primaryMuscle: guessed.primaryMuscle,
      synergists: current.synergists.filter((muscle) => muscle !== guessed.primaryMuscle),
      equipment: [guessed.equipment],
      movementPattern: guessed.movementPattern,
    }))
  }
  const choosePrimary = (primaryMuscle: MuscleGroup) => {
    setAutoGuess(false)
    setDraft((current) => ({
      ...current,
      primaryMuscle,
      synergists: current.synergists.filter((muscle) => muscle !== primaryMuscle),
    }))
  }
  const toggleSynergist = (muscle: MuscleGroup) => {
    if (muscle === draft.primaryMuscle) return
    setDraft((current) => ({
      ...current,
      synergists: current.synergists.includes(muscle)
        ? current.synergists.filter((item) => item !== muscle)
        : [...current.synergists, muscle],
    }))
  }
  const toggleEquipment = (item: Equipment) => {
    setAutoGuess(false)
    setDraft((current) => ({
      ...current,
      equipment: current.equipment.includes(item)
        ? current.equipment.filter((value) => value !== item)
        : [...current.equipment, item],
    }))
  }
  const canSubmit = draft.name.trim().length > 0 && draft.primaryMuscle != null && !saving

  return <aside className="writing-panel catalog-drawer" role="dialog" aria-label="新建动作">
    <header className="catalog-drawer-header">
      <div><h2>新建动作</h2><small>CUSTOM · 归为辅助动作 · 建完即可用</small></div>
      <button type="button" aria-label="关闭新建动作" disabled={saving} onClick={onClose}>✕</button>
    </header>
    <form
      className="catalog-create-form"
      onSubmit={(event) => {
        event.preventDefault()
        if (!canSubmit || !draft.primaryMuscle) return
        setSaving(true)
        setError('')
        void onCreate({
          name: draft.name.trim(),
          muscleGroups: [draft.primaryMuscle, ...draft.synergists],
          equipmentList: draft.equipment,
          movementPattern: draft.movementPattern,
        }).catch(() => {
          setError('创建失败，请稍后重试')
          setSaving(false)
        })
      }}
    >
      <label className="catalog-form-field"><span>动作名称</span><input autoFocus type="text" value={draft.name} onChange={(event) => updateName(event.target.value)} placeholder="例如：史密斯箭步蹲" /></label>
      <div className="catalog-form-field"><span>动作分类</span><div className="catalog-locked-field"><small>LOCKED</small>辅助动作 · 三大项与主项变式由系统维护</div></div>
      <ChipField label="主肌群" hint="单选 · 决定它归到哪个部位分类">
        {MUSCLE_OPTIONS.map((muscle) => <ChoiceChip key={muscle} active={draft.primaryMuscle === muscle} onClick={() => choosePrimary(muscle)}>{MUSCLE_LABEL[muscle]}</ChoiceChip>)}
      </ChipField>
      <ChipField label="协同肌群" hint="可多选">
        {MUSCLE_OPTIONS.map((muscle) => <ChoiceChip key={muscle} active={draft.synergists.includes(muscle)} disabled={draft.primaryMuscle === muscle} onClick={() => toggleSynergist(muscle)}>{MUSCLE_LABEL[muscle]}</ChoiceChip>)}
      </ChipField>
      <ChipField label="器械" hint="可多选">
        {EQUIPMENT_OPTIONS.map((item) => <ChoiceChip key={item} active={draft.equipment.includes(item)} onClick={() => toggleEquipment(item)}>{EQUIPMENT_LABEL[item]}</ChoiceChip>)}
      </ChipField>
      <ChipField label="动作模式" hint="单选">
        {MOVEMENT_PATTERN_OPTIONS.map((pattern) => <ChoiceChip key={pattern} active={draft.movementPattern === pattern} onClick={() => {
          setAutoGuess(false)
          setDraft((current) => ({ ...current, movementPattern: pattern }))
        }}>{MOVEMENT_PATTERN_LABEL[pattern]}</ChoiceChip>)}
      </ChipField>
      {error && <div className="catalog-form-error">{error}</div>}
      <footer className="catalog-drawer-footer catalog-create-footer">
        <button type="button" className="catalog-ghost-action" disabled={saving} onClick={onClose}>取消</button>
        <button type="submit" className="catalog-white-action" disabled={!canSubmit}>{saving ? '创建中…' : '创建'}</button>
      </footer>
    </form>
  </aside>
}

function ChipField({ label, hint, children }: { label: string; hint: string; children: React.ReactNode }) {
  return <div className="catalog-form-field"><span>{label} <small>{hint}</small></span><div className="catalog-choice-wrap">{children}</div></div>
}

function ChoiceChip({ active, disabled, onClick, children }: { active: boolean; disabled?: boolean; onClick: () => void; children: React.ReactNode }) {
  return <button type="button" className={`catalog-choice${active ? ' active' : ''}`} disabled={disabled} onClick={onClick}>{children}</button>
}
