import { api } from './client'
import type { CreateVideoMarkerPayload, VideoMarker } from './types'

type MarkerListResponse = VideoMarker[] | { markers: VideoMarker[] }
type VideoViewedResponse = { viewed_at: string }

export const getVideoMarkers = (videoId: string) =>
  api.get<MarkerListResponse>(`/videos/${videoId}/markers`)
    .then((response) => Array.isArray(response) ? response : response.markers)

export const createVideoMarker = (videoId: string, payload: CreateVideoMarkerPayload) =>
  api.post<VideoMarker>(`/videos/${videoId}/markers`, payload)

export const deleteVideoMarker = (videoId: string, markerId: string) =>
  api.del<void>(`/videos/${videoId}/markers/${markerId}`)

export const markVideoViewed = (videoId: string) =>
  api.post<VideoViewedResponse>(`/videos/${videoId}/viewed`)
