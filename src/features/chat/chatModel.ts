import type { ChatConversation, ChatMessage, ChatReadCursor } from '../../api/types'

export function mergeMessages(...groups: ChatMessage[][]): ChatMessage[] {
  const bySeq = new Map<number, ChatMessage>()
  for (const group of groups) {
    for (const message of group) bySeq.set(message.seq, message)
  }
  return [...bySeq.values()].sort((left, right) => left.seq - right.seq)
}

export function maxSeq(messages: ChatMessage[]): number {
  return messages.reduce((result, message) => Math.max(result, message.seq), 0)
}

export function minSeq(messages: ChatMessage[]): number {
  return messages.reduce(
    (result, message) => Math.min(result, message.seq),
    messages[0]?.seq ?? 0,
  )
}

export function latestIncomingSeq(messages: ChatMessage[], myUserId: string): number {
  return messages.reduce(
    (result, message) => message.sender_id === myUserId ? result : Math.max(result, message.seq),
    0,
  )
}

export function readReceiptFor(
  messages: ChatMessage[],
  myUserId: string,
  otherLastRead: ChatReadCursor | null,
): { messageId: string; status: '已送达' | '已读' } | null {
  const mine = [...messages].reverse().find((message) => message.sender_id === myUserId)
  if (!mine) return null
  return {
    messageId: mine.id,
    status: (otherLastRead?.seq ?? 0) >= mine.seq ? '已读' : '已送达',
  }
}

export function unreadTotal(conversations: ChatConversation[] | null): number {
  return conversations?.reduce((total, conversation) => total + conversation.unread_count, 0) ?? 0
}

export function chatRelativeTime(iso: string | null, now: number): string {
  if (!iso) return ''
  const then = Date.parse(iso)
  if (!Number.isFinite(then)) return ''
  const seconds = Math.max(0, Math.floor((now - then) / 1000))
  if (seconds < 60) return '刚刚'
  if (seconds < 60 * 60) return `${Math.floor(seconds / 60)} 分钟前`
  if (seconds < 24 * 60 * 60) return `${Math.floor(seconds / (60 * 60))} 小时前`
  if (seconds < 30 * 24 * 60 * 60) return `${Math.floor(seconds / (24 * 60 * 60))} 天前`
  if (seconds < 365 * 24 * 60 * 60) return `${Math.floor(seconds / (30 * 24 * 60 * 60))} 个月前`
  return `${Math.floor(seconds / (365 * 24 * 60 * 60))} 年前`
}

export function conversationPreview(conversation: ChatConversation): string {
  return conversation.last_message?.preview ?? '还没有消息'
}

export function newClientId(): string {
  const bytes = new Uint8Array(16)
  const cryptoProvider = globalThis.crypto
  if (cryptoProvider && typeof cryptoProvider.getRandomValues === 'function') {
    cryptoProvider.getRandomValues(bytes)
  } else {
    for (let index = 0; index < bytes.length; index += 1) {
      bytes[index] = Math.floor(Math.random() * 256)
    }
  }
  let hex = ''
  for (const byte of bytes) hex += byte.toString(16).padStart(2, '0')
  return `web-${Date.now().toString(36)}-${hex}`
}
