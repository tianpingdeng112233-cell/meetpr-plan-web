export interface FeedbackSession {
  videoId: string | null
  playerOpen: boolean
  includeViewed: boolean
}
/** Card B: use this editor ref for overview and chat video links. Omit id for first pending. */
export interface EditorFeedbackHandle {
  openFeedbackVideo: (videoId?: string) => void
}
