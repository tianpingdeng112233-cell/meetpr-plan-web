import aliases from '../../data/exercise-aliases.json'

type Candidate = { id: string; name: string; name_en: string | null; created_by_coach_id: string | null }

export function normalizeAdoptionName(name: string): string {
  return name.replace(/[！-～]/g, char => String.fromCharCode(char.charCodeAt(0) - 0xfee0)).replace(/\s/g, '').toLowerCase()
}

function dice(a: string, b: string): number {
  const left = new Set(a)
  const right = new Set(b)
  const overlap = [...left].filter(char => right.has(char)).length
  return 2 * overlap / (left.size + right.size)
}

/** Stable catalog order breaks ties; every spelling can contribute the best score. */
export function rankAdoptionCandidates<T extends Candidate>(spellings: readonly string[], catalog: readonly T[]): T[] {
  const names = spellings.map(normalizeAdoptionName).filter(Boolean)
  return catalog.filter(item => item.created_by_coach_id == null).map(item => {
    const officialNames = [item.name, item.name_en ?? ''].map(normalizeAdoptionName).filter(Boolean)
    let score = 0
    for (const name of names) {
      if (aliases.aliases.some(alias => normalizeAdoptionName(alias.alias) === name && officialNames.includes(normalizeAdoptionName(alias.canonical)))) score = Math.max(score, 3)
      for (const official of officialNames) {
        if (name.includes(official) || official.includes(name)) score = Math.max(score, 2)
        const similarity = dice(name, official)
        if (similarity >= 0.5) score = Math.max(score, similarity)
      }
    }
    return { item, score }
  }).filter(hit => hit.score > 0).sort((a, b) => b.score - a.score).slice(0, 3).map(hit => hit.item)
}
