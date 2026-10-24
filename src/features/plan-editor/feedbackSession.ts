export interface FeedbackSession {
  /** Keep an explicitly opened, already-viewed video visible until the next selection. */
  pinnedVideoId?: string | null
  historicalVideo?: import('../../api/types').StudentVideo
  dayId?: string | null
  videoId: string | null
  playerOpen: boolean
  includeViewed: boolean
}
/** Card B: use this editor ref for overview and chat video links. Omit id for first pending. */
export interface EditorFeedbackHandle {
  openFeedbackVideo: (videoId?: string) => void
}
