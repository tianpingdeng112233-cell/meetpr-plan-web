// Exercise binding index = backend catalog (GET /exercises) + the coach alias
// table (synced from iOS CoachKit Resources/exercise-aliases.json, spec 043).
// Resolves a coach-written name (possibly an alias) to a real exercise id and
// powers the name-cell typeahead.

import aliasesData from '../../data/exercise-aliases.json'
import type { ExerciseResponse } from '../../api/types'

interface AliasEntry { alias: string; canonical: string }
const ALIASES: AliasEntry[] = (aliasesData as { aliases: AliasEntry[] }).aliases

export interface ExerciseHit { id: string; name: string; via?: string }

export class ExerciseIndex {
  private byName = new Map<string, ExerciseResponse>()
  private aliasToCanonical = new Map<string, string>()

  constructor(private catalog: ExerciseResponse[]) {
    for (const e of catalog) this.byName.set(e.name, e)
    for (const a of ALIASES) this.aliasToCanonical.set(a.alias, a.canonical)
  }

  /** Exact resolve: a catalog name, or an alias -> canonical -> catalog. */
  resolve(input: string): ExerciseResponse | null {
    const t = input.trim()
    if (!t) return null
    if (this.byName.has(t)) return this.byName.get(t)!
    const canon = this.aliasToCanonical.get(t)
    if (canon && this.byName.has(canon)) return this.byName.get(canon)!
    return null
  }

  /** Typeahead: alias matches first (show the canonical they map to), then catalog substring. */
  search(query: string, limit = 8): ExerciseHit[] {
    const q = query.trim()
    if (!q) return []
    const hits: ExerciseHit[] = []
    const seen = new Set<string>()
    const push = (e: ExerciseResponse, via?: string) => {
      if (seen.has(e.id)) return
      seen.add(e.id); hits.push({ id: e.id, name: e.name, via })
    }
    for (const a of ALIASES) {
      if (a.alias.includes(q)) { const e = this.byName.get(a.canonical); if (e) push(e, a.alias) }
    }
    for (const e of this.catalog) {
      if (hits.length >= limit) break
      if (e.name.includes(q) || (e.name_en?.toLowerCase().includes(q.toLowerCase()) ?? false)) push(e)
    }
    return hits.slice(0, limit)
  }

  add(e: ExerciseResponse) {
    if (!this.catalog.some((item) => item.id === e.id)) this.catalog.push(e)
    this.byName.set(e.name, e)
  }

  withAdded(e: ExerciseResponse): ExerciseIndex {
    return new ExerciseIndex(this.catalog.some((item) => item.id === e.id) ? this.catalog : [...this.catalog, e])
  }
}
