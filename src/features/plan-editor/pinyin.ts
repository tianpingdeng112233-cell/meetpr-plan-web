import charPinyinData from '../../data/char-pinyin.json'

const CHAR_PINYIN = charPinyinData as Record<string, string[]>
const ASCII_QUERY = /^[a-z0-9]+$/
const HAN_CHARACTER = /^\p{Script=Han}$/u
// Only explicit separators may be skipped; ASCII runs ("RDL", "3D") must be
// consumed literally (queries accept [a-z0-9]), so a query can never treat them as a free subsequence.
const SEPARATOR = /^[\s\-_/·•()（）[\]【】,，.。:：+]$/

/** Minimum query length before pinyin matching kicks in (a lone initial matches too much). */
export const PINYIN_MIN_QUERY = 2

/**
 * Single-pass DP over the name: `offsets` maps "query chars consumed so far" →
 * earliest name index where that partial match started. Every character seeds a
 * fresh start (offset 0), so the match may begin anywhere, and each Han
 * character may consume any full reading or that reading's initial. Complexity
 * is O(name length × query length) per name — no per-start rescans.
 *
 * Returns the character offset where the match starts (0 = prefix), or null.
 */
export function pinyinMatchScore(name: string, query: string): number | null {
  const normalizedQuery = query.trim().toLowerCase()
  if (normalizedQuery.length < PINYIN_MIN_QUERY || !ASCII_QUERY.test(normalizedQuery)) return null
  const target = normalizedQuery.length

  const characters = [...name]
  let offsets = new Map<number, number>()
  for (let index = 0; index < characters.length; index += 1) {
    const char = characters[index]
    if (!offsets.has(0)) offsets.set(0, index)
    const next = new Map<number, number>()
    const advance = (offset: number, start: number) => {
      const existing = next.get(offset)
      if (existing === undefined || start < existing) next.set(offset, start)
    }

    if (HAN_CHARACTER.test(char)) {
      const readings = CHAR_PINYIN[char] ?? []
      for (const [offset, start] of offsets) {
        for (const reading of readings) {
          if (reading.length === 0) continue
          if (normalizedQuery.startsWith(reading, offset)) advance(offset + reading.length, start)
          if (normalizedQuery[offset] === reading[0]) advance(offset + 1, start)
          // The query's final syllable may still be half-typed ("chu" for 传):
          // a remaining tail that is a proper prefix of this reading completes the match.
          if (tailIsProperPrefix(normalizedQuery, offset, reading)) advance(target, start)
        }
      }
    } else if (SEPARATOR.test(char)) {
      for (const [offset, start] of offsets) advance(offset, start)
    } else {
      const literal = char.toLowerCase()
      for (const [offset, start] of offsets) {
        if (normalizedQuery.startsWith(literal, offset)) advance(offset + literal.length, start)
      }
    }

    const done = next.get(target)
    if (done !== undefined) return done
    offsets = next
  }

  return null
}

/** True when query[offset..] is a non-empty proper prefix of `reading` — no string allocation. */
function tailIsProperPrefix(query: string, offset: number, reading: string): boolean {
  const length = query.length - offset
  if (length <= 0 || length >= reading.length) return false
  for (let i = 0; i < length; i += 1) {
    if (query.charCodeAt(offset + i) !== reading.charCodeAt(i)) return false
  }
  return true
}

export function matchesPinyin(name: string, query: string): boolean {
  return pinyinMatchScore(name, query) !== null
}
