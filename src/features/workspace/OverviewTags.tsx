import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { overviewTagLabel, splitOverviewTags, type OverviewTag } from './overviewBoard'

function TagText({ tag }: { tag: OverviewTag }) {
  return <>{overviewTagLabel(tag).split(/(\d+)/).map((part, i) => /^\d+$/.test(part) ? <b key={i}>{part}</b> : part)}</>
}

export function OverviewTags({ tags, onOpen }: { tags: readonly OverviewTag[]; onOpen: (tag: OverviewTag) => void }) {
  const ref = useRef<HTMLDivElement>(null)
  const overflowRef = useRef<HTMLButtonElement>(null)
  const popoverRef = useRef<HTMLSpanElement>(null)
  const [visibleCount, setVisibleCount] = useState(tags.length)
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null)
  const closeTimer = useRef(0)
  const close = () => setPosition(null)
  const cancelClose = () => window.clearTimeout(closeTimer.current)
  const deferClose = () => { cancelClose(); closeTimer.current = window.setTimeout(close, 120) }
  const show = () => {
    cancelClose()
    const rect = overflowRef.current?.getBoundingClientRect()
    if (!rect) return
    const height = Math.min(tags.length * 28 + 16, window.innerHeight - 16)
    setPosition({ top: Math.max(8, rect.bottom + height > window.innerHeight - 8 ? rect.top - height : rect.bottom), left: Math.max(8, Math.min(rect.left, window.innerWidth - 240)) })
  }
  useEffect(() => () => window.clearTimeout(closeTimer.current), [])
  useEffect(() => {
    if (!position) return
    const onScroll = (event: Event) => { if (!popoverRef.current?.contains(event.target as Node)) close() }
    window.addEventListener('scroll', onScroll, true)
    window.addEventListener('resize', close)
    return () => { window.removeEventListener('scroll', onScroll, true); window.removeEventListener('resize', close) }
  }, [position])
  useLayoutEffect(() => {
    const element = ref.current
    if (!element) return
    const measure = () => {
      const widths = [...element.querySelectorAll<HTMLElement>('.overview-tags-measure > span')].map(el => el.getBoundingClientRect().width)
      // jsdom has no layout; browsers measure the full label in the active locale.
      setVisibleCount(element.clientWidth > 0 ? splitOverviewTags(tags, widths, element.clientWidth).visible.length : tags.length)
    }
    measure()
    const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(measure) : null
    observer?.observe(element)
    return () => observer?.disconnect()
  }, [tags])
  const button = (tag: OverviewTag) => <button key={tag.kind} type="button" className={`overview-tag ${tag.tone}`} data-alert-kind={tag.kind}
    onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') event.stopPropagation() }}
    onDoubleClick={event => event.stopPropagation()} onClick={event => { event.stopPropagation(); close(); onOpen(tag) }}><TagText tag={tag} /></button>
  return <div className="overview-tags" ref={ref}>
    <span className="overview-tags-measure" aria-hidden="true">{tags.map(tag => <span key={tag.kind} className={`overview-tag ${tag.tone}`}><TagText tag={tag} /></span>)}</span>
    {tags.slice(0, visibleCount).map(button)}
    {visibleCount < tags.length && <span className="overview-overflow" onMouseEnter={show} onMouseLeave={deferClose} onDoubleClick={event => event.stopPropagation()}>
      <button ref={overflowRef} type="button" className="overview-tag white" title={tags.map(overviewTagLabel).join(' · ')}
        onKeyDown={event => { if (event.key === 'Escape') { event.stopPropagation(); close() } else if (event.key === 'Enter' || event.key === ' ') event.stopPropagation() }}
        onFocus={show} onBlur={deferClose} onClick={event => { event.stopPropagation(); show() }}>+{tags.length - visibleCount}</button>
      {position && createPortal(<span ref={popoverRef} className="overview-tag-popover" style={position}
        onMouseEnter={cancelClose} onMouseLeave={deferClose} onFocus={cancelClose} onBlur={deferClose}
        onKeyDown={event => { if (event.key === 'Escape') { event.stopPropagation(); overflowRef.current?.focus(); close() } }}>
        {tags.map(button)}
      </span>, document.body)}
    </span>}
  </div>
}
