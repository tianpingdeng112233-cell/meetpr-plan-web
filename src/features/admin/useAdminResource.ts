import { useEffect, useRef, useState } from 'react'
import { useDelayedLoading } from '../../components/states'

export type ResourceState<T> = { data: T | null; loading: boolean; error: boolean; retry: () => void; updatedAt: Date | null }

export function useResource<T>(key: string | null, load: () => Promise<T>): ResourceState<T> {
  const loader = useRef(load)
  loader.current = load
  const [attempt, setAttempt] = useState(0)
  const [state, setState] = useState<Omit<ResourceState<T>, 'retry'> & { key: string | null }>({
    key: null, data: null, loading: false, error: false, updatedAt: null,
  })

  useEffect(() => {
    if (!key) return
    let cancelled = false
    setState(previous => ({ key, data: previous.key === key ? previous.data : null, updatedAt: previous.key === key ? previous.updatedAt : null, loading: true, error: false }))
    void loader.current().then(
      (data) => { if (!cancelled) setState({ key, data, loading: false, error: false, updatedAt: new Date() }) },
      () => { if (!cancelled) setState(previous => ({ ...previous, loading: false, error: true })) },
    )
    return () => { cancelled = true }
  }, [key, attempt])

  const visibleSkeleton = useDelayedLoading(state.loading)
  return { ...state, data: state.key === key ? state.data : null, loading: !!key && (state.key !== key || state.loading || visibleSkeleton), retry: () => setAttempt((value) => value + 1) }
}

