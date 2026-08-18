// Exercise binding index = backend catalog (GET /exercises) + the coach alias
// table (synced from iOS CoachKit Resources/exercise-aliases.json, spec 043).
// Resolves a coach-written name (possibly an alias) to a real exercise id and
// powers the name-cell typeahead.

import aliasesData from '../../data/exercise-aliases.json'
import type { ExerciseResponse } from '../../api/types'
import type { ExerciseUsageStat } from '../../api/exercises'
import type { CatalogClassification } from './weeklySummary'
import { STABLE_ZH } from '../../i18n/stable-zh'

interface AliasEntry { alias: string; canonical: string }
const ALIASES: AliasEntry[] = (aliasesData as { aliases: AliasEntry[] }).aliases

export type DeadliftStylePreference = 'conventional' | 'sumo' | null | undefined

export function displayExerciseName(name: string): string {
  return name === STABLE_ZH.aliases.dumbbellBench ? STABLE_ZH.aliases.flatDumbbellBench : name
}

function normalizeLookupName(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[·・\s_\-‐‑–—]/g, '')
}

export interface ExerciseHit { id: string; name: string; name_en?: string | null; via?: string }

export class ExerciseIndex {
  private byName = new Map<string, ExerciseResponse>()
  private byId = new Map<string, ExerciseResponse>()
  private aliasToCanonical = new Map<string, string>()
  private usage: Map<string, number>

  constructor(
    private catalog: ExerciseResponse[],
    private opts: { deadliftStyle?: DeadliftStylePreference } = {},
    usage: Map<string, number> | ExerciseUsageStat[] = [],
  ) {
    this.usage = usage instanceof Map
      ? usage
      : new Map(usage.map((stat) => [stat.exercise_id, stat.plan_count]))
    for (const e of catalog) {
      const display = { ...e, name: displayExerciseName(e.name) }
      this.byId.set(e.id, display)
      this.byName.set(e.name, display)
      this.byName.set(display.name, display)
      this.byName.set(normalizeLookupName(e.name), display)
      this.byName.set(normalizeLookupName(display.name), display)
    }
    for (const a of ALIASES) {
      this.aliasToCanonical.set(a.alias, a.canonical)
      this.aliasToCanonical.set(normalizeLookupName(a.alias), a.canonical)
    }
    const names = STABLE_ZH.aliases
    this.aliasToCanonical.set(names.dumbbellBench, names.dumbbellBench)
    this.aliasToCanonical.set(names.flatDumbbellBench, names.dumbbellBench)
    this.aliasToCanonical.set(names.lyingDumbbellBench, names.dumbbellBench)
    this.aliasToCanonical.set(names.anyBicepsCurl, names.dumbbellCurl)
    this.aliasToCanonical.set(names.anyBiceps, names.dumbbellCurl)
    this.aliasToCanonical.set(names.biceps, names.dumbbellCurl)
    this.aliasToCanonical.set(names.pauseDeadlift, opts.deadliftStyle === 'sumo' ? names.sumoPauseDeadlift : names.conventionalPauseDeadlift)
  }

  /** Strict resolve: exact catalog name or exact alias only — safe for auto-binding on blur. */
  resolveExact(input: string): ExerciseResponse | null {
    const t = input.trim()
    if (!t) return null
    if (this.byName.has(t)) return this.byName.get(t)!
    const normalized = normalizeLookupName(t)
    if (this.byName.has(normalized)) return this.byName.get(normalized)!
    const canon = this.aliasToCanonical.get(t) ?? this.aliasToCanonical.get(normalized)
    if (canon && this.byName.has(canon)) return this.byName.get(canon)!
    return null
  }

  /** Lenient resolve for import/paste paths: exact first, then fuzzy inference. */
  resolve(input: string): ExerciseResponse | null {
    const exact = this.resolveExact(input)
    if (exact) return exact
    const normalized = normalizeLookupName(input.trim())
    if (STABLE_ZH.patterns.curl.test(normalized)) {
      const curl = this.byName.get(STABLE_ZH.aliases.dumbbellCurl)
      if (curl) return curl
    }
    return null
  }

  /** Typeahead: alias matches first (show the canonical they map to), then catalog substring.
   *  Usage reorders the complete result set stably, preserving that baseline order on ties. */
  search(query: string, limit = 8): ExerciseHit[] {
    const q = query.trim()
    if (!q) return []
    const hits: ExerciseHit[] = []
    const seen = new Set<string>()
    const push = (e: ExerciseResponse, via?: string) => {
      if (seen.has(e.id)) return
      seen.add(e.id); hits.push({ id: e.id, name: e.name, name_en: e.name_en, via })
    }
    const normalized = normalizeLookupName(q)
    const aliases = [
      ...ALIASES,
      { alias: STABLE_ZH.aliases.dumbbellBench, canonical: STABLE_ZH.aliases.dumbbellBench },
      { alias: STABLE_ZH.aliases.flatDumbbellBench, canonical: STABLE_ZH.aliases.dumbbellBench },
      { alias: STABLE_ZH.aliases.anyBicepsCurl, canonical: STABLE_ZH.aliases.dumbbellCurl },
      { alias: STABLE_ZH.aliases.pauseDeadlift, canonical: this.opts.deadliftStyle === 'sumo' ? STABLE_ZH.aliases.sumoPauseDeadlift : STABLE_ZH.aliases.conventionalPauseDeadlift },
    ]
    for (const a of aliases) {
      if (a.alias.includes(q) || normalizeLookupName(a.alias).includes(normalized)) {
        const e = this.byName.get(a.canonical)
        if (e) push(e, a.alias)
      }
    }
    for (const e of this.catalog) {
      const displayName = displayExerciseName(e.name)
      if (
        e.name.includes(q)
        || displayName.includes(q)
        || normalizeLookupName(displayName).includes(normalized)
        || (e.name_en?.toLowerCase().includes(q.toLowerCase()) ?? false)
      ) push({ ...e, name: displayName })
    }
    return hits
      .map((hit, baseIndex) => ({ hit, baseIndex }))
      .sort((a, b) => (this.usage.get(b.hit.id) ?? 0) - (this.usage.get(a.hit.id) ?? 0)
        || a.baseIndex - b.baseIndex)
      .slice(0, limit)
      .map(({ hit }) => hit)
  }

  bump(id: string): void {
    this.usage.set(id, (this.usage.get(id) ?? 0) + 1)
  }

  add(e: ExerciseResponse) {
    if (!this.catalog.some((item) => item.id === e.id)) this.catalog.push(e)
    this.byName.set(e.name, e)
    this.byId.set(e.id, e)
  }

  /** Catalog tier for a bound exercise id; null when unknown (e.g. custom before reload). */
  typeById(id: string): ExerciseResponse['exercise_type'] | null {
    return this.byId.get(id)?.exercise_type ?? null
  }

  /** Canonical catalog names for locale-aware display; binding still uses `name`. */
  namesById(id: string): Pick<ExerciseResponse, 'name' | 'name_en'> | null {
    const exercise = this.byId.get(id)
    return exercise ? { name: exercise.name, name_en: exercise.name_en } : null
  }

  /** Exact catalog metadata used by derived weekly capacity summaries. */
  classificationById(id: string): CatalogClassification | null {
    const exercise = this.byId.get(id)
    return exercise ? {
      exerciseType: exercise.exercise_type,
      mainLiftFamily: exercise.main_lift_family,
    } : null
  }

  /** Catalog fields used by the badge attached to week-band action names. */
  bandMetadataById(id: string): Pick<ExerciseResponse, 'exercise_type' | 'main_lift_family' | 'muscle_groups'> | null {
    const exercise = this.byId.get(id)
    return exercise ? {
      exercise_type: exercise.exercise_type,
      main_lift_family: exercise.main_lift_family,
      muscle_groups: exercise.muscle_groups,
    } : null
  }

  /** Metadata needed by the editor's inline history/e1RM information row. */
  infoMetadataById(id: string): {
    mainLiftFamily: ExerciseResponse['main_lift_family']
    isCompetitionLift: boolean
  } | null {
    const exercise = this.byId.get(id)
    return exercise ? {
      mainLiftFamily: exercise.main_lift_family,
      isCompetitionLift: exercise.is_competition_lift,
    } : null
  }

  withAdded(e: ExerciseResponse): ExerciseIndex {
    return new ExerciseIndex(
      this.catalog.some((item) => item.id === e.id) ? this.catalog : [...this.catalog, e],
      this.opts,
      this.usage,
    )
  }
}
