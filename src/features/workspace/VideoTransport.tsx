import { S } from '../../i18n/strings'
import { VIDEO_SPEEDS } from './videoPlayback'

/** Shared controls for the video page and the editor's floating history player. */
export function VideoFrameButtons({ duration, onStep, compact = false }: { duration: number; onStep: (direction: -1 | 1) => void; compact?: boolean }) {
  return <>
    <button type="button" className="video-frame-step" aria-label={S.video.previousFrame} disabled={duration <= 0} onClick={() => onStep(-1)}>{compact ? S.block.previousFrame : '⏮ᶠ'}</button>
    <button type="button" className="video-frame-step" aria-label={S.video.nextFrame} disabled={duration <= 0} onClick={() => onStep(1)}>{compact ? S.block.nextFrame : '⏭ᶠ'}</button>
  </>
}
export function VideoSpeedButtons({ rate, onRate, compact = false }: { rate: number; onRate: (rate: number) => void; compact?: boolean }) {
  return <span className="video-speeds" aria-label={S.video.playbackSpeed}>
    {(compact ? [0.25, 0.5, 1, 2] : VIDEO_SPEEDS).map(speed => <button type="button" className={rate === speed ? 'active' : ''} aria-pressed={rate === speed} onClick={() => onRate(speed)} key={speed}>{speed}×</button>)}
  </span>
}
