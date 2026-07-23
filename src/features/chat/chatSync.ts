import type { ChatMessage, ChatMessagePage } from '../../api/types'
import { maxSeq, mergeMessages } from './chatModel'

export async function catchUpSince(
  fetchPage: (afterSeq: number) => Promise<ChatMessagePage>,
  fromSeq: number,
  maxPages = 10,
): Promise<{ messages: ChatMessage[]; pagesFetched: number }> {
  let cursor = fromSeq
  let messages: ChatMessage[] = []
  let pagesFetched = 0

  while (pagesFetched < maxPages) {
    const page = await fetchPage(cursor)
    pagesFetched += 1
    messages = mergeMessages(messages, page.messages)
    const nextCursor = Math.max(cursor, maxSeq(page.messages))
    if (!page.meta.has_more || nextCursor <= cursor) break
    cursor = nextCursor
  }

  return { messages, pagesFetched }
}
