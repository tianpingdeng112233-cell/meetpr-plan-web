import { ApiException, api } from './client'
import type { DraftMirror } from '../features/plan-editor/draftMirror'

export interface PendingRevisionResponse {
  plan_id: string
  version: number
  content_hash: string
  content: unknown
  saved_at: string
}

export interface PutPendingRevisionResponse {
  plan_id: string
  version: number
  content_hash: string
  saved_at: string
}

const pathFor = (planId: string) => `/plans/${encodeURIComponent(planId)}/pending-revision`

export async function getPendingRevision(planId: string): Promise<PendingRevisionResponse | null> {
  try {
    return await api.get<PendingRevisionResponse>(pathFor(planId), { retryRateLimit: false })
  } catch (error) {
    if (error instanceof ApiException && (error.status === 404 || error.status === 405)) return null
    throw error
  }
}

export function putPendingRevision(
  planId: string,
  mirror: DraftMirror,
  options: { keepalive?: boolean } = {},
): Promise<PutPendingRevisionResponse> {
  return api.put<PutPendingRevisionResponse>(pathFor(planId), {
    version: mirror.version,
    content_hash: mirror.contentHash,
    content: mirror.content,
  }, { retryRateLimit: false, keepalive: options.keepalive })
}

export function deletePendingRevision(planId: string): Promise<void> {
  return api.del<void>(pathFor(planId))
}
