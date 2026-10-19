import { S } from '../../../i18n/strings'
import { firstGroupVideo, type VideoGroup } from '../feedbackModel'

export function VideoMarker({ group, onOpen }: { group?: VideoGroup; onOpen: (videoId: string) => void }) {
  if (!group?.total) return null
  const hint = S.block.videoHint(group.total, group.pending)
  return <button type="button" data-video-marker="" className={`block-video-marker ${group.pending ? 'pending' : 'viewed'}`} aria-label={hint} title={hint} data-hint={hint}
    onMouseDown={event => { event.preventDefault(); event.stopPropagation() }}
    onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') event.stopPropagation() }}
    onClick={event => { event.stopPropagation(); const video = firstGroupVideo(group); if (video) onOpen(video.id) }}>
    <span aria-hidden="true">▶</span>{group.pending > 0 && <span>{group.pending}</span>}
  </button>
}
