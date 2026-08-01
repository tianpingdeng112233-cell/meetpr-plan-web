import { sendTextMessage } from '../../api/chat'
import { ApiException } from '../../api/client'
import { isBindLost } from '../../api/errors'
import type { ChatMessage } from '../../api/types'
import { newClientId } from './chatModel'

export type OutboxState =
  | { state: 'sending' }
  | { state: 'failed'; code?: string; retryable: boolean }
  | { state: 'confirmed'; message: ChatMessage }

export interface OutboxItem {
  clientId: string
  conversationId: string
  body: string
  status: OutboxState
}

export interface ChatOutbox {
  itemsFor(conversationId: string): OutboxItem[]
  enqueue(conversationId: string, body: string): void
  publishConfirmed(message: ChatMessage): void
  retry(clientId: string): void
  discard(clientId: string): void
  reconcile(conversationId: string, messages: ChatMessage[], myUserId: string): void
  acknowledgeConfirmed(clientId: string): void
  subscribe(listener: () => void): () => void
  setErrorSink(sink: ((error: unknown) => void) | null): void
  reset(): void
}

export function createChatOutbox({ send }: {
  send: (conversationId: string, body: string, clientId: string) => Promise<ChatMessage>
}): ChatOutbox {
  let items: OutboxItem[] = []
  let errorSink: ((error: unknown) => void) | null = null
  const listeners = new Set<() => void>()
  const draining = new Set<string>()
  const notify = () => listeners.forEach((listener) => listener())

  const replace = (clientId: string, update: (item: OutboxItem) => OutboxItem) => {
    const index = items.findIndex((item) => item.clientId === clientId)
    if (index < 0) return false
    items = items.map((item, itemIndex) => itemIndex === index ? update(item) : item)
    notify()
    return true
  }

  const drain = async (conversationId: string) => {
    if (draining.has(conversationId)) return
    draining.add(conversationId)
    try {
      while (true) {
        const pending = items.find((item) => (
          item.conversationId === conversationId && item.status.state !== 'confirmed'
        ))
        if (!pending) return
        // Never let a later message overtake an earlier failed one. Retrying
        // (or discarding) the head resumes this conversation's queue.
        if (pending.status.state === 'failed') return

        try {
          let message: ChatMessage
          try {
            message = await send(pending.conversationId, pending.body, pending.clientId)
          } catch (caught) {
            if (!(caught instanceof ApiException && caught.status === 409 && caught.code === 'CHAT_SEQUENCE_CONFLICT')) {
              throw caught
            }
            message = await send(pending.conversationId, pending.body, pending.clientId)
          }
          // A poll can reconcile this clientId while POST is still in flight.
          // In that case the server message is already rendered; never resurrect it.
          replace(pending.clientId, (current) => ({
            ...current,
            status: { state: 'confirmed', message },
          }))
        } catch (caught) {
          const missing = caught instanceof ApiException && caught.status === 404
          const bindLost = isBindLost(caught)
          const status: OutboxState = {
            state: 'failed',
            code: caught instanceof ApiException ? caught.code : undefined,
            retryable: !bindLost && !missing,
          }
          if (bindLost || missing) {
            const stillExists = items.some((item) => item.clientId === pending.clientId)
            if (stillExists) {
              items = items.map((item) => (
                item.conversationId === conversationId && item.status.state === 'sending'
                  ? { ...item, status }
                  : item
              ))
              notify()
            }
          } else {
            replace(pending.clientId, (current) => ({ ...current, status }))
          }
          errorSink?.(caught)
        }
      }
    } finally {
      draining.delete(conversationId)
    }
  }

  return {
    itemsFor: (conversationId) => items.filter((item) => item.conversationId === conversationId),
    enqueue: (conversationId, body) => {
      items = [...items, {
        clientId: newClientId(),
        conversationId,
        body,
        status: { state: 'sending' },
      }]
      notify()
      void drain(conversationId)
    },
    publishConfirmed: (message) => {
      if (items.some((item) => item.clientId === message.client_id)) return
      items = [...items, {
        clientId: message.client_id,
        conversationId: message.conversation_id,
        body: message.body ?? '',
        status: { state: 'confirmed', message },
      }]
      notify()
    },
    retry: (clientId) => {
      let conversationId: string | null = null
      const changed = replace(clientId, (item) => {
        if (item.status.state !== 'failed' || !item.status.retryable) return item
        conversationId = item.conversationId
        return { ...item, status: { state: 'sending' } }
      })
      if (changed && conversationId) void drain(conversationId)
    },
    discard: (clientId) => {
      const conversationId = items.find((item) => item.clientId === clientId)?.conversationId
      const next = items.filter((item) => item.clientId !== clientId)
      if (next.length === items.length) return
      items = next
      notify()
      if (conversationId) void drain(conversationId)
    },
    reconcile: (conversationId, messages, myUserId) => {
      const confirmedIds = new Set(messages
        .filter((message) => message.sender_id === myUserId)
        .map((message) => message.client_id))
      const next = items.filter((item) => (
        item.conversationId !== conversationId || !confirmedIds.has(item.clientId)
      ))
      if (next.length === items.length) return
      items = next
      notify()
    },
    acknowledgeConfirmed: (clientId) => {
      const item = items.find((candidate) => candidate.clientId === clientId)
      if (item?.status.state !== 'confirmed') return
      items = items.filter((candidate) => candidate.clientId !== clientId)
      notify()
    },
    subscribe: (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    setErrorSink: (sink) => { errorSink = sink },
    reset: () => {
      items = []
      errorSink = null
      notify()
    },
  }
}

export const chatOutbox = createChatOutbox({ send: sendTextMessage })
