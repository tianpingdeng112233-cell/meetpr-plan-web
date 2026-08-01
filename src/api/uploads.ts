import { api } from './client'
import type { ChatMessage } from './types'

const CHAT_IMAGE_MAX_BYTES = 10 * 1024 * 1024

interface UploadInitiateResponse {
  attachment_id: string
  upload_id: string
  part_urls: Array<{ part_number: number; url: string }>
}

/**
 * Mutable per-annotation send state. Completed stages are recorded so a retry
 * resumes instead of re-running them: the fixed clientId makes the message
 * POST idempotent server-side (UNIQUE conversation_id+sender_id+client_id),
 * and a half-uploaded attachment is reused rather than leaked.
 */
export interface ChatImageSendSession {
  clientId: string
  attachmentId?: string
  partUrl?: string
  etag?: string
  completed?: boolean
}

export async function sendChatImage(
  conversationId: string,
  image: Blob,
  session: ChatImageSendSession,
): Promise<ChatMessage> {
  if (image.type !== 'image/jpeg' || image.size <= 0 || image.size > CHAT_IMAGE_MAX_BYTES) {
    throw new Error('CHAT_IMAGE_INVALID')
  }

  if (!session.attachmentId || !session.partUrl) {
    const initiated = await api.post<UploadInitiateResponse>('/uploads/initiate', {
      kind: 'chat_image',
      size_bytes: image.size,
      content_type: 'image/jpeg',
      part_count: 1,
    })
    const part = initiated.part_urls.find((candidate) => candidate.part_number === 1)
    if (!part) throw new Error('CHAT_IMAGE_PART_URL_MISSING')
    session.attachmentId = initiated.attachment_id
    session.partUrl = part.url
  }

  if (!session.etag) {
    // The presigned part URL is signed WITHOUT a Content-Type header (iOS
    // part PUTs never send one). fetch auto-appends a typed Blob's MIME and
    // breaks the signature (403 SignatureDoesNotMatch) — wrap the bytes in a
    // typeless Blob so no header is sent. The object's MIME type was fixed
    // server-side at initiate.
    const uploaded = await fetch(session.partUrl, {
      method: 'PUT',
      body: new Blob([image]),
    })
    if (!uploaded.ok) throw new Error(`CHAT_IMAGE_UPLOAD_${uploaded.status}`)
    const etag = uploaded.headers.get('ETag') ?? uploaded.headers.get('etag')
    if (!etag) throw new Error('CHAT_IMAGE_ETAG_MISSING')
    session.etag = etag
  }

  if (!session.completed) {
    await api.post(`/uploads/${session.attachmentId}/complete`, {
      parts: [{ part_number: 1, etag: session.etag }],
    })
    session.completed = true
  }

  return api.post<{ message: ChatMessage }>(`/conversations/${conversationId}/messages`, {
    kind: 'image',
    attachment_id: session.attachmentId,
    client_id: session.clientId,
  }).then((response) => response.message)
}

/**
 * Best-effort cleanup for an initiated-but-never-sent annotation upload.
 * Attempted even after complete (the message may never have been posted);
 * a server that rejects aborting a completed upload is silently ignored.
 */
export function abortChatImage(session: ChatImageSendSession): void {
  if (!session.attachmentId) return
  void api.post(`/uploads/${session.attachmentId}/abort`, {}).catch(() => {})
}
