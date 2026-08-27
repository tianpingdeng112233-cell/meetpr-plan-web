type ReloadBlocker = () => boolean

const blockers = new Set<ReloadBlocker>()

export function registerReloadBlocker(blocker: ReloadBlocker): () => void {
  blockers.add(blocker)
  return () => blockers.delete(blocker)
}

export function isReloadBlocked(): boolean {
  for (const blocker of blockers) {
    if (blocker()) return true
  }
  return false
}
