import { api } from './client'
import type {
  ChatConversation,
  ChatMessage,
  ChatMessagePage,
  ChatReadState,
  MessagesQuery,
} from './types'

const polling = { retryRateLimit: false } as const

export const listConversations = () =>
  api.get<{ conversations: ChatConversation[] }>('/conversations', polling)
    .then((response) => response.conversations)

export const openConversation = (otherUserId: string) =>
  api.post<{ conversation: ChatConversation }>('/conversations', { other_user_id: otherUserId })
    .then((response) => response.conversation)

export const getMessages = (conversationId: string, query: MessagesQuery) => {
  const params = new URLSearchParams()
  if (query.limit !== undefined) params.set('limit', String(query.limit))
  if (query.mode === 'since') params.set('since_seq', String(query.seq))
  if (query.mode === 'before') params.set('before_seq', String(query.seq))
  const suffix = params.size > 0 ? `?${params.toString()}` : ''
  return api.get<ChatMessagePage>(`/conversations/${conversationId}/messages${suffix}`, polling)
}

export const sendTextMessage = (conversationId: string, body: string, clientId: string) =>
  api.post<{ message: ChatMessage }>(`/conversations/${conversationId}/messages`, {
    kind: 'text',
    body,
    client_id: clientId,
  }).then((response) => response.message)

export const markConversationRead = (conversationId: string, messageId: string) =>
  api.post<ChatReadState>(`/conversations/${conversationId}/read`, { message_id: messageId })
