const BUILD_META_NAME = 'meetpr-build-id'
export const BUILD_UPDATE_CHECK_INTERVAL_MS = 2 * 60 * 1000
export const BUILD_UPDATE_CONFIRM_DELAY_MS = 15 * 1000
export const BUILD_UPDATE_CONFIRMATIONS = 3

type FetchLike = (input: RequestInfo | URL, init?: RequestInit) => Promise<Pick<Response, 'ok' | 'text'>>

function parseBuildId(raw: string | undefined): number | null {
  if (!raw || !/^\d+$/.test(raw)) return null
  const value = Number(raw)
  return Number.isSafeInteger(value) ? value : null
}

export function buildIdFromHtml(html: string): number | null {
  const document = new DOMParser().parseFromString(html, 'text/html')
  return parseBuildId(document.querySelector<HTMLMetaElement>(`meta[name="${BUILD_META_NAME}"]`)?.content)
}

export function currentBuildId(document: Document = window.document): number | null {
  return parseBuildId(document.querySelector<HTMLMetaElement>(`meta[name="${BUILD_META_NAME}"]`)?.content)
}

export async function fetchDeployedBuildId(fetcher: FetchLike = window.fetch.bind(window)): Promise<number | null> {
  const url = new URL(window.location.href)
  url.pathname = '/'
  url.search = ''
  url.hash = ''
  url.searchParams.set('_meetpr_build_check', String(Date.now()))
  try {
    const response = await fetcher(url, {
      cache: 'no-store',
      headers: { Accept: 'text/html' },
    })
    if (!response.ok) return null
    return buildIdFromHtml(await response.text())
  } catch {
    // Advisory only: a failed check must never interrupt ordinary work.
    return null
  }
}

export function monitorBuildUpdates(
  onNewBuild: () => void,
  options: {
    fetchBuildId?: () => Promise<number | null>
    currentId?: number | null
    intervalMs?: number
    confirmDelayMs?: number
  } = {},
): () => void {
  const loadedId = options.currentId ?? currentBuildId()
  if (loadedId === null) return () => {}
  const fetchBuildId = options.fetchBuildId ?? (() => fetchDeployedBuildId())
  const intervalMs = options.intervalMs ?? BUILD_UPDATE_CHECK_INTERVAL_MS
  const confirmDelayMs = options.confirmDelayMs ?? BUILD_UPDATE_CONFIRM_DELAY_MS
  let stopped = false
  let checking = false
  let confirmTimer: number | null = null
  let notified = false

  const confirmNewBuild = (candidate: number, observations = 1) => {
    if (confirmTimer !== null || notified || stopped) return
    confirmTimer = window.setTimeout(async () => {
      confirmTimer = null
      const confirmed = await fetchBuildId()
      if (stopped || notified || confirmed !== candidate) return
      const nextObservations = observations + 1
      if (nextObservations < BUILD_UPDATE_CONFIRMATIONS) {
        confirmNewBuild(candidate, nextObservations)
        return
      }
      notified = true
      onNewBuild()
    }, confirmDelayMs)
  }
  const check = async () => {
    if (checking || stopped || notified) return
    checking = true
    try {
      const deployedId = await fetchBuildId()
      if (deployedId !== null && deployedId !== loadedId) confirmNewBuild(deployedId)
    } finally {
      checking = false
    }
  }
  const onVisible = () => { if (document.visibilityState === 'visible') void check() }
  const onFocus = () => { void check() }
  const interval = window.setInterval(() => { void check() }, intervalMs)
  document.addEventListener('visibilitychange', onVisible)
  window.addEventListener('focus', onFocus)
  void check()

  return () => {
    stopped = true
    window.clearInterval(interval)
    if (confirmTimer !== null) window.clearTimeout(confirmTimer)
    document.removeEventListener('visibilitychange', onVisible)
    window.removeEventListener('focus', onFocus)
  }
}
