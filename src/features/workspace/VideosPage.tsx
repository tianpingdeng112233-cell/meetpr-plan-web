import { useEffect, useMemo, useRef, useState } from 'react'
import { getStudentVideos, getUploadUrl, postCoachFeedback } from '../../api/coach'
import type { CoachStudent, StudentVideo } from '../../api/types'
import { VideoModal } from './VideoModal'
import { PageTop, kg, shortDate } from './WorkspaceCommon'

const size = (bytes: number) => bytes < 1024 * 1024 ? `${Math.round(bytes / 1024)} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`
export const moveVideoIndex = (index: number, direction: -1 | 1, total: number) => Math.max(0, Math.min(total - 1, index + direction))
export const videoAssociation = (video: { logged_at: string | null; created_at: string | null; exercise_name?: string | null; set_index?: number | null }) => { const day = video.logged_at ?? video.created_at; return [day ? shortDate(day.slice(0, 10)) : null, video.exercise_name, video.set_index != null ? `第 ${video.set_index} 组` : null].filter(Boolean).join(' · ') }
export function VideosPage({ students, studentId, onStudent }: { students: CoachStudent[]; studentId: string; onStudent: (id: string) => void }) {
  const [videos, setVideos] = useState<StudentVideo[]>([]), [activeIndex, setActiveIndex] = useState<number | null>(null), [url, setUrl] = useState(''), [error, setError] = useState('')
  const [feedback, setFeedback] = useState(''), [feedbackState, setFeedbackState] = useState<'idle' | 'sending' | 'sent'>('idle'), [feedbackError, setFeedbackError] = useState('')
  const retried = useRef(false), videosRequest = useRef(0), urlRequest = useRef(0), feedbackRequest = useRef(0), sentTimer = useRef<number>(), draftRef = useRef('')
  // 草稿的实时值:发送在途时教练可以继续改,成功回调要拿当前值判断该不该清空(setState 闭包里的是旧值)。
  const writeFeedback = (value: string) => { draftRef.current = value; setFeedback(value) }
  useEffect(() => { const request = ++videosRequest.current; setVideos([]); setActiveIndex(null); urlRequest.current += 1; feedbackRequest.current += 1; if (studentId) void getStudentVideos(studentId).then((rows) => { if (request === videosRequest.current) setVideos(rows) }).catch(() => { if (request === videosRequest.current) setVideos([]) }) }, [studentId])
  const grouped = useMemo(() => Object.entries(videos.reduce<Record<string, StudentVideo[]>>((acc, video) => { const d = (video.logged_at ?? video.created_at).slice(0, 10); (acc[d] ??= []).push(video); return acc }, {})), [videos])
  const ordered = useMemo(() => grouped.flatMap(([, rows]) => rows), [grouped]), active = activeIndex == null ? null : ordered[activeIndex] ?? null
  const sign = async (video: StudentVideo, failure: string) => { const request = ++urlRequest.current; setError(''); try { const signed = await getUploadUrl(video.id); if (request === urlRequest.current) setUrl(signed.url) } catch { if (request === urlRequest.current) setError(failure) } }
  const resetFeedback = () => { feedbackRequest.current += 1; if (sentTimer.current != null) window.clearTimeout(sentTimer.current); writeFeedback(''); setFeedbackState('idle'); setFeedbackError('') }
  const open = (index: number) => { const video = ordered[index]; if (!video) return; setActiveIndex(index); setUrl(''); setError(''); retried.current = false; resetFeedback(); void sign(video, '视频链接获取失败') }
  const close = () => { urlRequest.current += 1; feedbackRequest.current += 1; if (sentTimer.current != null) window.clearTimeout(sentTimer.current); setActiveIndex(null) }
  const move = (direction: -1 | 1) => { if (activeIndex == null) return; const index = moveVideoIndex(activeIndex, direction, ordered.length); if (index !== activeIndex) open(index) }
  useEffect(() => () => { if (sentTimer.current != null) window.clearTimeout(sentTimer.current) }, [])
  const playbackFailed = () => { if (!active || retried.current) { setError('视频播放失败'); return } retried.current = true; setUrl(''); void sign(active, '视频链接已过期，续签失败') }
  const sendFeedback = async () => { if (!active || feedbackState === 'sending') return; const draft = feedback, text = draft.trim(); if (!text || text.length > 2000) return; const request = ++feedbackRequest.current; setFeedbackState('sending'); setFeedbackError(''); try { await postCoachFeedback({ student_id: studentId, day_date: (active.logged_at ?? active.created_at).slice(0, 10), plan_exercise_id: active.plan_exercise_id, video_id: active.id, text }); if (request !== feedbackRequest.current) return; if (draftRef.current !== draft) { setFeedbackState('idle'); return } writeFeedback(''); setFeedbackState('sent'); sentTimer.current = window.setTimeout(() => { if (request === feedbackRequest.current) setFeedbackState('idle') }, 2000) } catch { if (request === feedbackRequest.current) { setFeedbackState('idle'); setFeedbackError('反馈发送失败，请稍后重试') } } }
  const association = active ? videoAssociation(active) : '', detail = active ? [active.weight_kg != null && active.reps != null ? `${kg(active.weight_kg)}kg × ${active.reps}` : active.weight_kg != null ? `${kg(active.weight_kg)}kg` : active.reps != null ? `${active.reps} 次` : null, shortDate(active.logged_at ?? active.created_at), activeIndex != null ? `${activeIndex + 1}/${ordered.length}` : null].filter(Boolean).join(' · ') : ''
  return <main className="data-page"><PageTop title="训练视频" students={students} studentId={studentId} onStudent={onStudent} tail={<span className="page-status">最近 {videos.length} 条</span>} />
    <div className="video-wall">{grouped.length === 0 && <div className="empty-state">暂无训练视频</div>}{grouped.map(([date, rows]) => <section key={date}><h3>{shortDate(date)}</h3><div className="video-tiles">{rows.map((v) => <button key={v.id} onClick={() => open(ordered.findIndex((item) => item.id === v.id))}><span className="play">▶</span><span><b>{v.exercise_name || v.filename || '训练视频'}{v.set_index != null ? ` · 第 ${v.set_index} 组` : ''}</b><small>{v.weight_kg != null && v.reps != null ? `${kg(v.weight_kg)}kg × ${v.reps} · ` : ''}{size(v.size_bytes)}</small></span></button>)}</div></section>)}</div>
    {active && <VideoModal
      key={active.id}
      title={`${active.exercise_name || active.filename || '训练视频'}${active.set_index != null ? ` · 第 ${active.set_index} 组` : ''}`}
      detail={detail}
      url={url}
      loadingText={error || '正在获取播放链接…'}
      navigation={{
        hasPrevious: activeIndex !== 0,
        hasNext: activeIndex !== ordered.length - 1,
        onPrevious: () => move(-1),
        onNext: () => move(1),
      }}
      onClose={close}
      onPlaybackError={playbackFailed}
    >
      <section className="video-feedback">{association && <small>关联：{association}</small>}<div><input value={feedback} maxLength={2000} placeholder="给学员写反馈…" onChange={(e) => { writeFeedback(e.target.value); setFeedbackError(''); if (feedbackState === 'sent') setFeedbackState('idle') }} onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); void sendFeedback() } }} /><button onClick={() => void sendFeedback()} disabled={!feedback.trim() || feedback.length > 2000 || feedbackState === 'sending'}>{feedbackState === 'sending' ? '发送中…' : feedbackState === 'sent' ? '已发送 ✓' : '发送'}</button></div>{feedbackError && <em>{feedbackError}</em>}</section>
    </VideoModal>}
  </main>
}
