import { useLayoutEffect, useState, type ReactNode, type RefObject } from 'react'
import { S } from '../../../i18n/strings'

/** One anchored portrait window for history playback and feedback. */
export function PortraitVideoWindow({ title, positionLabel, anchor, onClose, children }: {
  title: string; positionLabel?: string; anchor: RefObject<HTMLElement>; onClose: () => void; children: ReactNode
}) {
  const [position, setPosition] = useState({ top: 66, left: 8, width: 405 })
  useLayoutEffect(() => {
    const place = () => {
      const rect = anchor.current?.getBoundingClientRect()
      const top = Math.max(8, Math.min((rect?.top ?? 56) + 10, window.innerHeight - 120))
      const right = Math.max(16, Math.min((rect?.left ?? window.innerWidth) - 8, window.innerWidth - 8))
      const width = Math.max(1, Math.min(405, right - 8, (window.innerHeight - top - 112) * 9 / 16))
      setPosition({ top, left: right - width, width })
    }
    place()
    window.addEventListener('resize', place); window.addEventListener('scroll', place, true)
    return () => { window.removeEventListener('resize', place); window.removeEventListener('scroll', place, true) }
  }, [anchor])
  return <div className="history-player" role="dialog" aria-label={S.video.trainingVideo} style={{ ...position, maxHeight: `calc(100vh - ${position.top + 8}px)`, overflowY: 'auto' }}
    onMouseDown={event => {
      if ((event.target as HTMLElement).closest('button')) event.preventDefault()
      event.stopPropagation()
    }}>
    <header><b>{title}</b>{positionLabel && <small>{positionLabel}</small>}<button onClick={onClose} aria-label={S.video.closePlayer}><kbd>Esc</kbd> ×</button></header>
    {children}
  </div>
}
