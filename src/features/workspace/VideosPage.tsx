import { useEffect, useMemo, useRef, useState } from 'react'
import { getStudentVideos, getUploadUrl } from '../../api/coach'
import type { CoachStudent, StudentVideo } from '../../api/types'
import { PageTop, kg, shortDate } from './WorkspaceCommon'

const size = (bytes: number) => bytes < 1024 * 1024 ? `${Math.round(bytes / 1024)} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`
export function VideosPage({ students, studentId, onStudent }: { students: CoachStudent[]; studentId: string; onStudent: (id: string) => void }) {
  const [videos, setVideos] = useState<StudentVideo[]>([]), [active, setActive] = useState<StudentVideo | null>(null), [url, setUrl] = useState(''), [rate, setRate] = useState(1), [error, setError] = useState('')
  const retried = useRef(false), videoRef = useRef<HTMLVideoElement>(null)
  useEffect(() => { setVideos([]); if (studentId) void getStudentVideos(studentId).then(setVideos).catch(() => setVideos([])) }, [studentId])
  const grouped = useMemo(() => Object.entries(videos.reduce<Record<string, StudentVideo[]>>((acc, video) => { const d = (video.logged_at ?? video.created_at).slice(0, 10); (acc[d] ??= []).push(video); return acc }, {})), [videos])
  const sign = async (video: StudentVideo) => { setError(''); const signed = await getUploadUrl(video.id); setUrl(signed.url) }
  const open = (video: StudentVideo) => { setActive(video); setUrl(''); setRate(1); retried.current = false; void sign(video).catch(() => setError('视频链接获取失败')) }
  useEffect(() => { if (videoRef.current) videoRef.current.playbackRate = rate }, [rate, url])
  const playbackFailed = () => { if (!active || retried.current) { setError('视频播放失败'); return } retried.current = true; void sign(active).catch(() => setError('视频链接已过期，续签失败')) }
  return <main className="data-page"><PageTop title="训练视频" students={students} studentId={studentId} onStudent={onStudent} tail={<span className="page-status">最近 {videos.length} 条</span>} />
    <div className="video-wall">{grouped.length === 0 && <div className="empty-state">暂无训练视频</div>}{grouped.map(([date, rows]) => <section key={date}><h3>{shortDate(date)}</h3><div className="video-tiles">{rows.map((v) => <button key={v.id} onClick={() => open(v)}><span className="play">▶</span><span><b>{v.exercise_name || v.filename || '训练视频'}{v.set_index != null ? ` · 第 ${v.set_index} 组` : ''}</b><small>{v.weight_kg != null && v.reps != null ? `${kg(v.weight_kg)}kg × ${v.reps} · ` : ''}{size(v.size_bytes)}</small></span></button>)}</div></section>)}</div>
    {active && <div className="video-modal" onMouseDown={() => setActive(null)}><div onMouseDown={(e) => e.stopPropagation()}><header><b>{active.exercise_name || active.filename}</b><button onClick={() => setActive(null)}>✕</button></header>{url ? <video ref={videoRef} src={url} controls autoPlay onError={playbackFailed} /> : <div className="video-loading">{error || '正在获取播放链接…'}</div>}<footer>{[0.5, 1, 1.5, 2].map((x) => <button className={rate === x ? 'active' : ''} onClick={() => setRate(x)} key={x}>{x}×</button>)}</footer></div></div>}
  </main>
}
