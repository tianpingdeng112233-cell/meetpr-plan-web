import { describe, expect, it, vi } from 'vitest'
import type { ChatMessage, ChatMessagePage } from '../../api/types'
import { catchUpSince } from './chatSync'

const message = (seq: number): ChatMessage => ({
  id: `m-${seq}`,
  conversation_id: 'c-1',
  seq,
  sender_id: 'student',
  kind: 'text',
  body: String(seq),
  attachment_id: null,
  image_url: null,
  image_expires_in: null,
  client_id: `client-${seq}`,
  created_at: '2026-07-22T10:00:00.000Z',
})

const page = (seqs: number[], hasMore: boolean): ChatMessagePage => ({
  messages: seqs.map(message),
  meta: { other_last_read: null, has_more: hasMore },
})

describe('catchUpSince', () => {
  it('一次 tick 排空三页积压，has_more=false 后不发第四次', async () => {
    const fetchPage = vi.fn()
      .mockResolvedValueOnce(page([11, 12], true))
      .mockResolvedValueOnce(page([13, 14], true))
      .mockResolvedValueOnce(page([15], false))
    const result = await catchUpSince(fetchPage, 10)
    expect(fetchPage.mock.calls).toEqual([[10], [12], [14]])
    expect(result.messages.map((item) => item.seq)).toEqual([11, 12, 13, 14, 15])
    expect(result.pagesFetched).toBe(3)
  })

  it('seq 没有前进时停止，防止 has_more 坏响应打转', async () => {
    const fetchPage = vi.fn().mockResolvedValue(page([10], true))
    const result = await catchUpSince(fetchPage, 10)
    expect(fetchPage).toHaveBeenCalledTimes(1)
    expect(result.pagesFetched).toBe(1)
  })

  it('遵守 maxPages 硬上限', async () => {
    const fetchPage = vi.fn(async (cursor: number) => page([cursor + 1], true))
    const result = await catchUpSince(fetchPage, 0, 3)
    expect(fetchPage).toHaveBeenCalledTimes(3)
    expect(result.messages.map((item) => item.seq)).toEqual([1, 2, 3])
    expect(result.pagesFetched).toBe(3)
  })
})
