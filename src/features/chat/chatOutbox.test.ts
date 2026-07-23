import { describe, expect, it, vi } from 'vitest'
import { ApiException } from '../../api/client'
import type { ChatMessage } from '../../api/types'
import { createChatOutbox } from './chatOutbox'

const message = (clientId: string, seq = 1): ChatMessage => ({
  id: `message-${seq}`,
  conversation_id: 'conversation',
  seq,
  sender_id: 'coach',
  kind: 'text',
  body: '收到',
  attachment_id: null,
  image_url: null,
  image_expires_in: null,
  client_id: clientId,
  created_at: '2026-07-22T10:00:00.000Z',
})

const deferred = <T,>() => {
  let resolve!: (value: T) => void
  let reject!: (reason: unknown) => void
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}

const settle = async () => {
  for (let index = 0; index < 8; index += 1) await Promise.resolve()
}

describe('chatOutbox', () => {
  it('失败后重试复用首次发送的 clientId', async () => {
    const send = vi.fn()
      .mockRejectedValueOnce(new TypeError('offline'))
      .mockImplementationOnce((_conversationId, _body, clientId) => Promise.resolve(message(clientId)))
    const outbox = createChatOutbox({ send })

    outbox.enqueue('conversation', '收到')
    await settle()
    const failed = outbox.itemsFor('conversation')[0]
    expect(failed?.status).toEqual({ state: 'failed', code: undefined, retryable: true })

    outbox.retry(failed!.clientId)
    await settle()
    expect(send).toHaveBeenCalledTimes(2)
    expect(send.mock.calls[1]?.[2]).toBe(send.mock.calls[0]?.[2])
  })

  it('成功先进入 confirmed 交接态，线程确认后才摘掉', async () => {
    const send = vi.fn((_conversationId, _body, clientId) => Promise.resolve(message(clientId)))
    const outbox = createChatOutbox({ send })
    outbox.enqueue('conversation', '收到')
    await settle()

    const confirmed = outbox.itemsFor('conversation')[0]
    expect(confirmed?.status.state).toBe('confirmed')
    if (confirmed?.status.state !== 'confirmed') throw new Error('expected confirmed item')
    expect(confirmed.status.message.client_id).toBe(confirmed.clientId)

    outbox.acknowledgeConfirmed(confirmed.clientId)
    expect(outbox.itemsFor('conversation')).toEqual([])
  })

  it('轮询先拉到正文时摘掉 pending，迟到的 POST 成功响应不会复活', async () => {
    const request = deferred<ChatMessage>()
    const outbox = createChatOutbox({ send: vi.fn(() => request.promise) })
    outbox.enqueue('conversation', '收到')
    const clientId = outbox.itemsFor('conversation')[0]!.clientId

    outbox.reconcile('conversation', [message(clientId)], 'coach')
    expect(outbox.itemsFor('conversation')).toEqual([])
    request.resolve(message(clientId))
    await settle()
    expect(outbox.itemsFor('conversation')).toEqual([])
  })

  it('同一会话串行发送，并以同一 clientId 自动重试一次 409', async () => {
    const first = deferred<ChatMessage>()
    const send = vi.fn()
      .mockImplementationOnce(() => first.promise)
      .mockRejectedValueOnce(new ApiException(409, 'CHAT_SEQUENCE_CONFLICT'))
      .mockImplementationOnce((_conversationId, _body, clientId) => Promise.resolve(message(clientId, 2)))
    const outbox = createChatOutbox({ send })

    outbox.enqueue('conversation', '第一条')
    outbox.enqueue('conversation', '第二条')
    expect(send).toHaveBeenCalledTimes(1)
    const firstClientId = send.mock.calls[0]?.[2]
    first.resolve(message(firstClientId))
    await settle()

    expect(send).toHaveBeenCalledTimes(3)
    expect(send.mock.calls[1]?.[2]).toBe(send.mock.calls[2]?.[2])
  })

  it('前一条失败时不让后一条越过，重试成功后才继续', async () => {
    const send = vi.fn()
      .mockRejectedValueOnce(new TypeError('offline'))
      .mockImplementation((_conversationId, _body, clientId) => Promise.resolve(message(clientId)))
    const outbox = createChatOutbox({ send })
    outbox.enqueue('conversation', '第一条')
    outbox.enqueue('conversation', '第二条')
    await settle()
    expect(send).toHaveBeenCalledTimes(1)

    const first = outbox.itemsFor('conversation')[0]!
    outbox.retry(first.clientId)
    await settle()
    expect(send).toHaveBeenCalledTimes(3)
    expect(send.mock.calls.map((call) => call[1])).toEqual(['第一条', '第一条', '第二条'])
  })

  it('403 绑定失效不可重试，并把错误送到上层', async () => {
    const error = new ApiException(403, 'CHAT_BIND_REQUIRED')
    const sink = vi.fn()
    const outbox = createChatOutbox({ send: vi.fn().mockRejectedValue(error) })
    outbox.setErrorSink(sink)
    outbox.enqueue('conversation', '还在吗')
    outbox.enqueue('conversation', '第二条')
    await settle()

    expect(outbox.itemsFor('conversation').map((item) => item.status))
      .toEqual([
        { state: 'failed', code: 'CHAT_BIND_REQUIRED', retryable: false },
        { state: 'failed', code: 'CHAT_BIND_REQUIRED', retryable: false },
      ])
    expect(sink).toHaveBeenCalledWith(error)
  })
})
