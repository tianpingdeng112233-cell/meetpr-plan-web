import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ChatMessage } from './types'

const client = vi.hoisted(() => ({ post: vi.fn() }))
vi.mock('./client', () => ({ api: { post: client.post } }))

import { abortChatImage, sendChatImage } from './uploads'

const message: ChatMessage = {
  id: 'message', conversation_id: 'conversation', seq: 1, sender_id: 'coach', kind: 'image', body: null,
  attachment_id: 'attachment', image_url: 'https://oss.test/image.jpg', image_expires_in: 900,
  set_ref: null, video_url: null, video_expires_in: null, client_id: 'client', created_at: '2026-08-01T12:00:00Z',
}

describe('chat image upload pipeline', () => {
  beforeEach(() => {
    client.post.mockReset()
    client.post
      .mockResolvedValueOnce({
        attachment_id: 'attachment', upload_id: 'upload',
        part_urls: [{ part_number: 1, url: 'https://oss.test/part' }],
      })
      .mockResolvedValueOnce({ id: 'attachment', status: 'ready' })
      .mockResolvedValueOnce({ message })
  })

  it('runs initiate, OSS PUT, complete, then image message with exact payloads', async () => {
    const put = vi.fn().mockResolvedValue(new Response(null, {
      status: 200,
      headers: { ETag: '"part-etag"' },
    }))
    vi.stubGlobal('fetch', put)
    const image = new Blob(['jpeg'], { type: 'image/jpeg' })

    await expect(
      sendChatImage('conversation', image, { clientId: 'client' }),
    ).resolves.toEqual(message)
    expect(client.post).toHaveBeenNthCalledWith(1, '/uploads/initiate', {
      kind: 'chat_image', size_bytes: image.size, content_type: 'image/jpeg', part_count: 1,
    })
    expect(put).toHaveBeenCalledWith('https://oss.test/part', {
      method: 'PUT', headers: { 'Content-Type': 'image/jpeg' }, body: image,
    })
    expect(client.post).toHaveBeenNthCalledWith(2, '/uploads/attachment/complete', {
      parts: [{ part_number: 1, etag: '"part-etag"' }],
    })
    expect(client.post).toHaveBeenNthCalledWith(3, '/conversations/conversation/messages', {
      kind: 'image', attachment_id: 'attachment', client_id: 'client',
    })
    expect(put.mock.invocationCallOrder[0]).toBeGreaterThan(client.post.mock.invocationCallOrder[0]!)
    expect(client.post.mock.invocationCallOrder[1]).toBeGreaterThan(put.mock.invocationCallOrder[0]!)
  })
})

describe('chat image send session', () => {
  beforeEach(() => { client.post.mockReset() })

  it('resumes a failed send from the recorded stage with the same client_id and attachment', async () => {
  const put = vi.fn().mockResolvedValue(new Response(null, {
    status: 200,
    headers: { ETag: '"part-etag"' },
  }))
  vi.stubGlobal('fetch', put)
  const image = new Blob(['jpeg'], { type: 'image/jpeg' })
  const session = { clientId: 'client' }

  // First attempt dies at the message step.
  client.post
    .mockResolvedValueOnce({
      attachment_id: 'attachment', upload_id: 'upload',
      part_urls: [{ part_number: 1, url: 'https://oss.test/part' }],
    })
    .mockResolvedValueOnce({})
    .mockRejectedValueOnce(new Error('NETWORK'))
  await expect(sendChatImage('conversation', image, session)).rejects.toThrow('NETWORK')
  expect(client.post).toHaveBeenCalledTimes(3)
  expect(put).toHaveBeenCalledTimes(1)

  // The retry must only replay the message POST: no new initiate, PUT, or
  // complete, and the identical client_id keeps the server side idempotent.
  client.post.mockResolvedValueOnce({ message })
  await expect(sendChatImage('conversation', image, session)).resolves.toEqual(message)
  expect(client.post).toHaveBeenCalledTimes(4)
  expect(put).toHaveBeenCalledTimes(1)
  expect(client.post).toHaveBeenLastCalledWith('/conversations/conversation/messages', {
    kind: 'image', attachment_id: 'attachment', client_id: 'client',
  })
})

  it('abort cleans up any initiated upload, completed or not, and skips uninitiated ones', async () => {
    client.post.mockResolvedValue({})
    abortChatImage({ clientId: 'client' })
    expect(client.post).not.toHaveBeenCalled()
    // Completed-but-never-posted uploads leak too: abort is attempted and a
    // server-side rejection is silently ignored.
    abortChatImage({ clientId: 'client', attachmentId: 'attachment', completed: true })
    expect(client.post).toHaveBeenCalledWith('/uploads/attachment/abort', {})
    abortChatImage({ clientId: 'client', attachmentId: 'attachment-2' })
    expect(client.post).toHaveBeenCalledWith('/uploads/attachment-2/abort', {})
  })
})
