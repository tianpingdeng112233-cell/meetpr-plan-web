import { ApiException } from '../../api/client'
import { errorText } from '../onboarding/text'
import { AdoptDialog } from './AdoptDialog'
import { useRef, useState, type ReactNode } from 'react'
import { getAdminCustomExercises, unadoptCustomExercises, type AdoptedExerciseRow, type PendingExerciseGroup } from '../../api/admin'
import { listExercises } from '../../api/exercises'
import { EmptyState, ErrorState, SkeletonRows } from '../../components/states'
import { fmt, S } from '../../i18n/strings'
import { useResource } from './useAdminResource'

export function CustomExercisesPage({ children, refreshUsage, onToast }: { children: ReactNode; refreshUsage: () => void; onToast: (message: string) => void }) {
  const custom = useResource('custom', getAdminCustomExercises)
  const catalog = useResource('official', listExercises)
  const [source, setSource] = useState('official')
  const [status, setStatus] = useState('pending')
  const [search, setSearch] = useState('')
  const [adopting, setAdopting] = useState<PendingExerciseGroup | null>(null)
  const [undoBusy, setUndoBusy] = useState(false)
  const undoInFlight = useRef(false)
  const labels = S.admin.adoption
  const refresh = () => { custom.retry(); catalog.retry(); refreshUsage() }
  async function undo(row: AdoptedExerciseRow) {
    if (undoInFlight.current) return
    undoInFlight.current = true
    setUndoBusy(true)
    try {
      await unadoptCustomExercises([row.exercise_id])
      onToast(labels.undone(row.coach_name || S.admin.unnamed, row.name))
      refresh()
    } catch (error) {
      if (error instanceof ApiException && error.status === 409 && error.code === 'EXERCISE_ADOPTION_CONFLICT') {
        onToast(labels.conflict)
        refresh()
      } else onToast(errorText(error))
    } finally {
      undoInFlight.current = false
      setUndoBusy(false)
    }
  }
  const pending = custom.data?.pending ?? []
  const adopted = custom.data?.adopted ?? []
  const query = search.trim().toLowerCase()
  const matches = (...values: (string | null)[]) => values.some(value => value?.toLowerCase().includes(query))
  const pendingRows = pending.filter(group => !query || matches(group.display_name, ...group.rows.flatMap(row => [row.name, row.coach_name])))
  const adoptedGroups = adopted.map(group => ({ ...group, rows: group.rows.filter(row => !query || matches(group.official.name, group.official.name_en, row.name, row.coach_name)) })).filter(group => group.rows.length)
  return <div className="flex flex-col gap-5">
    <header className="flex flex-wrap items-end justify-between gap-4"><div><h1 className="text-[26px] font-bold">{S.admin.page.exercises}</h1><p className="mt-1 text-[13px] text-fg-tertiary">{labels.subtitle}</p></div><button type="button" className="admin-secondary" disabled={custom.loading || catalog.loading} onClick={refresh}>{S.admin.refresh}</button></header>
    <div className="flex flex-wrap items-center gap-3">
      <Segments label={labels.source} value={source} onChange={setSource} options={[
        ['official', `${labels.official} ${catalog.data ? catalog.data.filter(row => row.created_by_coach_id == null).length : '—'}`],
        ['custom', `${labels.custom} ${custom.data ? pending.length + adopted.length : '—'}`],
      ]}/>
      {source === 'custom' && <><Segments label={labels.status} value={status} onChange={setStatus} options={[
        ['pending', `${labels.pending} ${custom.data ? pending.length : '—'}`], ['adopted', `${labels.adopted} ${custom.data ? adopted.length : '—'}`],
      ]}/><input aria-label={labels.search} placeholder={labels.search} value={search} onChange={event => setSearch(event.target.value)} className="h-9 w-full max-w-[280px] rounded-md border border-border bg-s1 px-3 text-[13px]"/></>}
    </div>
    {source === 'custom' && catalog.error && <ErrorState retry={catalog.retry}/>}
    {source === 'official' ? children : <>
      <section aria-label={status === 'pending' ? labels.pendingList : labels.adoptedList} className="overflow-x-auto rounded-[10px] border border-border bg-s1">
        {custom.loading ? <SkeletonRows/> : custom.error ? <ErrorState retry={custom.retry}/> : status === 'pending' ? <div className="min-w-[820px]">
          <div className="grid h-10 grid-cols-[minmax(260px,2fr)_minmax(160px,1.2fr)_80px_120px] items-center gap-4 border-b border-border px-5 font-mono text-[10.5px] text-fg-tertiary"><span>{S.admin.exercises.name}</span><span>{labels.coaches}</span><span>{labels.plans} ▼</span><span className="text-right">{labels.actions}</span></div>
          {pendingRows.map(group => <div key={group.key} className="grid min-h-16 grid-cols-[minmax(260px,2fr)_minmax(160px,1.2fr)_80px_120px] items-center gap-4 border-b border-[#EEF0F3] px-5 py-2.5 last:border-0 hover:bg-s2">
            <div className="min-w-0"><div className="font-semibold">{group.display_name}</div><div className="mt-0.5 text-xs text-fg-tertiary">{labels.spellings([...new Set(group.rows.map(row => row.name))])}</div></div>
            <span className="text-[13px] text-fg-secondary">{labels.coachNames([...new Map(group.rows.map(row => [row.coach_id, row.coach_name || S.admin.unnamed])).values()], group.coach_count)}</span><span className="font-mono text-[13px]">{group.plan_count}</span><div className="text-right"><button type="button" className="admin-primary" disabled={catalog.loading || catalog.error} onClick={() => setAdopting(group)}>{labels.adopt}</button></div>
          </div>)}
          {!pendingRows.length && <EmptyState text={query ? S.admin.exercises.noMatch : labels.emptyPending}/>}
        </div> : <div className="min-w-[820px]">
          <div className="grid h-10 grid-cols-[minmax(200px,1.4fr)_minmax(200px,1.4fr)_80px_110px_100px] items-center gap-4 border-b border-border pl-9 pr-5 font-mono text-[10.5px] text-fg-tertiary"><span>{labels.coach}</span><span>{labels.alias}</span><span>{labels.plans}</span><span>{labels.adoptedAt}</span><span className="text-right">{labels.actions}</span></div>
          {adoptedGroups.map(group => <div key={group.official.id}>
            <div className="flex items-baseline gap-2.5 border-b border-[#EEF0F3] bg-s2 px-5 pb-2 pt-3.5"><b>{fmt.exerciseName(group.official)}</b><span className="rounded border border-[#B7D4CC] bg-[#E7F1EE] px-1.5 py-px text-[11px] text-[#10715A]">{labels.official}</span><span className="text-xs text-fg-tertiary">{labels.linkedCoaches(new Set(group.rows.map(row => row.coach_id)).size)}</span></div>
            {group.rows.map(row => <div key={row.exercise_id} className="grid min-h-[52px] grid-cols-[minmax(200px,1.4fr)_minmax(200px,1.4fr)_80px_110px_100px] items-center gap-4 border-b border-[#EEF0F3] py-2 pl-9 pr-5 text-[13px] last:border-0 hover:bg-s2"><span>{row.coach_name || S.admin.unnamed}</span><span className="text-fg-secondary">{labels.called(row.name)}</span><span className="font-mono">{row.plan_count}</span><time className="font-mono text-xs text-fg-tertiary">{adoptionTime(row.adopted_at)}</time><div className="text-right"><button type="button" className="admin-secondary" disabled={undoBusy} onClick={() => void undo(row)}>{labels.unadopt}</button></div></div>)}
          </div>)}
          {!adoptedGroups.length && <EmptyState text={query ? S.admin.exercises.noMatch : labels.emptyAdopted}/>}
        </div>}
      </section>
      <p className="text-xs text-fg-tertiary">{status === 'pending' ? labels.pendingHint : labels.adoptedHint}</p>
    </>}
    {adopting && <AdoptDialog group={pending.find(group => group.key === adopting.key) ?? { ...adopting, rows: [] }} refreshing={custom.loading || catalog.loading} refreshError={custom.error || catalog.error} onRetryRefresh={refresh} catalog={catalog.data ?? []} onClose={() => setAdopting(null)} onConflict={() => { onToast(labels.conflict); refresh() }} onSuccess={message => { setAdopting(null); setStatus('adopted'); setSearch(''); onToast(message); refresh() }}/>}
  </div>
}

function Segments({ label, value, options, onChange }: { label: string; value: string; options: [string, string][]; onChange: (value: string) => void }) {
  return <div role="group" aria-label={label} className="flex gap-0.5 rounded-md border border-border bg-s1 p-0.5">{options.map(([key, text]) => <button type="button" key={key} aria-pressed={value === key} onClick={() => onChange(key)} className={`whitespace-nowrap rounded px-3 py-1.5 text-[12.5px] ${value === key ? 'bg-[#111827] font-semibold text-white' : 'text-fg-tertiary'}`}>{text}</button>)}</div>
}

function adoptionTime(value: string): string {
  const date = new Date(value)
  const two = (n: number) => String(n).padStart(2, '0')
  return `${two(date.getMonth() + 1)}-${two(date.getDate())} ${two(date.getHours())}:${two(date.getMinutes())}`
}
