import { S } from '../../i18n/strings'
import { VIDEO_SPEEDS } from './videoPlayback'

/** Shared controls for the video page and the editor's inline history player. */
export function VideoFrameButtons({ duration, onStep }: { duration: number; onStep: (direction: -1 | 1) => void }) {
  return <>
    <button type="button" className="video-frame-step" aria-label={S.video.previousFrame} disabled={duration <= 0} onClick={() => onStep(-1)}>⏮ᶠ</button>
    <button type="button" className="video-frame-step" aria-label={S.video.nextFrame} disabled={duration <= 0} onClick={() => onStep(1)}>⏭ᶠ</button>
  </>
}
export function VideoSpeedButtons({ rate, onRate, compact = false }: { rate: number; onRate: (rate: number) => void; compact?: boolean }) {
  return <span className="video-speeds" aria-label={S.video.playbackSpeed}>
    {(compact ? [0.5, 1, 2] : VIDEO_SPEEDS).map(speed => <button type="button" className={rate === speed ? 'active' : ''} aria-pressed={rate === speed} onClick={() => onRate(speed)} key={speed}>{speed}×</button>)}
  </span>
}
