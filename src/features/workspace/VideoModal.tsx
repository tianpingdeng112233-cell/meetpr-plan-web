import { useEffect, useRef, useState, type ReactNode } from 'react'

interface VideoModalNavigation {
  hasPrevious: boolean
  hasNext: boolean
  onPrevious: () => void
  onNext: () => void
}

export interface VideoModalProps {
  title: string
  detail?: string
  url: string
  loadingText?: string
  navigation?: VideoModalNavigation
  onClose: () => void
  onPlaybackError: () => void
  children?: ReactNode
}

export function VideoModal({
  title,
  detail,
  url,
  loadingText = '正在获取播放链接…',
  navigation,
  onClose,
  onPlaybackError,
  children,
}: VideoModalProps) {
  const [rate, setRate] = useState(1)
  const videoRef = useRef<HTMLVideoElement>(null)

  useEffect(() => {
    if (videoRef.current) videoRef.current.playbackRate = rate
  }, [rate, url])

  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return
      const element = event.target instanceof HTMLElement ? event.target : null
      const typing = !!element && (
        element instanceof HTMLInputElement
        || element instanceof HTMLTextAreaElement
        || element.isContentEditable
      )
      if (event.key === 'Escape') {
        if (element && typing) {
          element.blur()
          return
        }
        event.preventDefault()
        onClose()
        return
      }
      if (!navigation || typing || element instanceof HTMLVideoElement) return
      if (event.key === 'ArrowLeft') {
        event.preventDefault()
        navigation.onPrevious()
      }
      if (event.key === 'ArrowRight') {
        event.preventDefault()
        navigation.onNext()
      }
    }
    window.addEventListener('keydown', keydown)
    return () => window.removeEventListener('keydown', keydown)
  }, [navigation, onClose])

  return <div className="video-modal" onMouseDown={onClose}>
    <div role="dialog" aria-modal="true" aria-label={title} onMouseDown={(event) => event.stopPropagation()}>
      <header>
        <span>
          <b>{title}</b>
          {detail && <small>{detail}</small>}
        </span>
        <button type="button" onClick={onClose} aria-label="关闭">✕</button>
      </header>
      <div className="video-stage">
        {url
          ? <video ref={videoRef} src={url} controls autoPlay onError={onPlaybackError} />
          : <div className="video-loading">{loadingText}</div>}
        {navigation && <>
          <button
            type="button"
            className="video-nav prev"
            onClick={navigation.onPrevious}
            disabled={!navigation.hasPrevious}
            aria-label="上一条视频"
          >‹</button>
          <button
            type="button"
            className="video-nav next"
            onClick={navigation.onNext}
            disabled={!navigation.hasNext}
            aria-label="下一条视频"
          >›</button>
        </>}
      </div>
      <footer>
        {[0.5, 1, 1.5, 2].map((value) => <button
          type="button"
          className={rate === value ? 'active' : ''}
          onClick={() => setRate(value)}
          key={value}
        >{value}×</button>)}
      </footer>
      {children}
    </div>
  </div>
}
