import { useMemo, useRef, useState } from 'react'
import type { StudentVideo } from '../../api/types'
import MessagesPage, { type MessagesPageProps } from '../chat/MessagesPage'
import { VideosPage, type VideoTarget } from './VideosPage'

interface StudentHubPageProps extends Omit<MessagesPageProps, 'pendingVideoCounts' | 'onPlayVideo'> {
  videosByStudent: Readonly<Record<string, StudentVideo[]>>
  onRefreshVideos: (studentId: string) => Promise<void>
}

export function StudentHubPage({
  selectedStudentId,
  videosByStudent,
  onRefreshVideos,
  ...messagesProps
}: StudentHubPageProps) {
  const targetRequest = useRef(0)
  const [videoTarget, setVideoTarget] = useState<(VideoTarget & { studentId: string }) | null>(null)
  const pendingVideoCounts = useMemo(() => Object.fromEntries(
    Object.entries(videosByStudent).map(([studentId, videos]) => [
      studentId,
      videos.filter((video) => video.viewed_at == null).length,
    ]),
  ), [videosByStudent])

  return (
    <main className="student-hub-page">
      <MessagesPage
        {...messagesProps}
        selectedStudentId={selectedStudentId}
        pendingVideoCounts={pendingVideoCounts}
        onPlayVideo={(studentId, target) => {
          targetRequest.current += 1
          setVideoTarget({ ...target, studentId, requestId: targetRequest.current })
        }}
      />
      <VideosPage
        studentId={selectedStudentId}
        videos={videosByStudent[selectedStudentId] ?? []}
        onRefreshVideos={onRefreshVideos}
        target={videoTarget?.studentId === selectedStudentId ? videoTarget : null}
      />
    </main>
  )
}
