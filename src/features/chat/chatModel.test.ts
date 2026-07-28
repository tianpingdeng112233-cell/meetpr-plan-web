import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ChatConversation, ChatMessage } from '../../api/types'
import {
  chatRelativeTime,
  conversationPreview,
  maxSeq,
  mergeMessages,
  minSeq,
  newClientId,
  readReceiptFor,
  unreadTotal,
} from './chatModel'

const message = (seq: number, senderId = 'student', overrides: Partial<ChatMessage> = {}): ChatMessage => ({
  id: `m-${seq}`,
  conversation_id: 'c-1',
  seq,
  sender_id: senderId,
  kind: 'text',
  body: `message ${seq}`,
  attachment_id: null,
  image_url: null,
  image_expires_in: null,
  set_ref: null,
  video_url: null,
  video_expires_in: null,
  client_id: `client-${seq}`,
  created_at: '2026-07-22T10:00:00.000Z',
  ...overrides,
})

const conversation = (unreadCount: number): ChatConversation => ({
  id: `c-${unreadCount}`,
  other_party: { id: 'student', display_name: '学员' },
  last_message: null,
  last_message_at: null,
  unread_count: unreadCount,
  my_last_read: null,
  other_last_read: null,
})

afterEach(() => vi.unstubAllGlobals())

describe('chat message model', () => {
  it('按 seq 去重排序，后到的版本覆盖先到的版本', () => {
    const merged = mergeMessages(
      [message(3), message(1), message(2, 'student', { body: 'old' })],
      [message(2, 'student', { body: 'new' })],
    )
    expect(merged.map((item) => item.seq)).toEqual([1, 2, 3])
    expect(merged[1]?.body).toBe('new')
    expect(maxSeq(merged)).toBe(3)
    expect(minSeq(merged)).toBe(1)
  })

  it.each([
    [9, '已送达'],
    [10, '已读'],
    [11, '已读'],
  ] as const)('回执使用闭区间：对方游标 %i → %s', (seq, status) => {
    const messages = [message(8, 'coach'), message(10, 'coach')]
    expect(readReceiptFor(messages, 'coach', { message_id: 'cursor', seq }))
      .toEqual({ messageId: 'm-10', status })
  })

  it('只给我发的最后一条消息挂回执', () => {
    expect(readReceiptFor([message(1), message(2, 'coach'), message(3)], 'coach', null))
      .toEqual({ messageId: 'm-2', status: '已送达' })
    expect(readReceiptFor([message(1)], 'coach', null)).toBeNull()
  })

  it('未加载会话时未读总数为零，并原样采用服务端预览', () => {
    expect(unreadTotal(null)).toBe(0)
    expect(unreadTotal([conversation(2), conversation(3)])).toBe(5)
    expect(conversationPreview(conversation(0))).toBe('还没有消息')
    const setRefConversation = conversation(0)
    setRefConversation.last_message = {
      id: 'set-ref',
      seq: 1,
      kind: 'text',
      preview: '[训练分享]',
      created_at: '2026-07-27T10:00:00.000Z',
      sender_id: 'student',
    }
    expect(conversationPreview(setRefConversation)).toBe('[训练分享]')
  })
})

describe('chatRelativeTime', () => {
  const now = Date.parse('2026-07-22T12:00:00.000Z')
  const ago = (seconds: number) => new Date(now - seconds * 1000).toISOString()

  it.each([
    [59, '刚刚'],
    [60, '1 分钟前'],
    [3599, '59 分钟前'],
    [24 * 60 * 60, '1 天前'],
    [30 * 24 * 60 * 60, '1 个月前'],
    [365 * 24 * 60 * 60, '1 年前'],
  ] as const)('%i 秒前渲染为 %s', (seconds, expected) => {
    expect(chatRelativeTime(ago(seconds), now)).toBe(expected)
  })
})

describe('newClientId', () => {
  it('不依赖 randomUUID，长度满足后端约束且一千次无重复', () => {
    const getRandomValues = globalThis.crypto.getRandomValues.bind(globalThis.crypto)
    vi.stubGlobal('crypto', { getRandomValues, randomUUID: undefined })
    const ids = Array.from({ length: 1000 }, () => newClientId())
    expect(new Set(ids).size).toBe(1000)
    expect(ids.every((id) => id.length >= 1 && id.length <= 64)).toBe(true)
  })

  it('crypto 整体不可用时仍生成合法且不同的幂等键', () => {
    vi.stubGlobal('crypto', undefined)
    const ids = Array.from({ length: 1000 }, () => newClientId())
    expect(new Set(ids).size).toBe(1000)
    expect(ids.every((id) => id.length >= 1 && id.length <= 64)).toBe(true)
  })
})
