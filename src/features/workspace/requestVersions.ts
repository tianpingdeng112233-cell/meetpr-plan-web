export interface KeyedRequestVersions {
  issue: (key: string) => number
  invalidate: (key: string) => void
  isLatest: (key: string, version: number) => boolean
}

/**
 * A tiny per-key last-request-wins clock. Callers can share one clock across
 * every producer of the same cache so an earlier response cannot overwrite a
 * newer one.
 */
export function createKeyedRequestVersions(): KeyedRequestVersions {
  const versions = new Map<string, number>()
  const issue = (key: string) => {
    const next = (versions.get(key) ?? 0) + 1
    versions.set(key, next)
    return next
  }
  return {
    issue,
    invalidate: (key) => { issue(key) },
    isLatest: (key, version) => versions.get(key) === version,
  }
}
