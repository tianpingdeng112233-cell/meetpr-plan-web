import { useEffect, useState } from 'react'
import { LoginScreen } from './features/auth/LoginScreen'
import { PlanWorkspace } from './features/workspace/PlanWorkspace'
import { AdminWorkspace } from './features/admin/AdminWorkspace'
import { PlanEditor } from './features/plan-editor/PlanEditor'
import { buildWeeks } from './features/plan-editor/sampleData'
import { currentUser, logout } from './api/auth'
import type { AuthUser } from './api/types'
import { chatOutbox } from './features/chat/chatOutbox'

type View = 'login' | 'workspace' | 'sample'

export default function App() {
  const [user, setUser] = useState<AuthUser | null>(() => {
    const cached = currentUser()
    if (!cached || cached.role === 'coach' || cached.role === 'admin') return cached
    // Clear a stale student session written by an older client version rather
    // than entering the coach workspace with an unusable token.
    logout()
    return null
  })
  const [view, setView] = useState<View>(() => (user?.role === 'coach' || user?.role === 'admin' ? 'workspace' : 'login'))

  useEffect(() => {
    if (!user || user.role === 'coach' || user.role === 'admin') return
    logout()
    setUser(null)
    setView('login')
  }, [user])

  if (view === 'sample') {
    return (
      <div style={{ position: 'relative', height: '100vh' }}>
        <PlanEditor
          initialWeeks={buildWeeks()}
          weeksCount={12}
          studentName="吕子豪"
          planName="Monster · 力型兼备"
        />
        <button
          onClick={() => setView('login')}
          style={{ position: 'absolute', left: 12, bottom: 12, zIndex: 70, background: 'var(--card-bg)', color: 'var(--txt)', border: '1px solid var(--bd)', borderRadius: 'var(--r-sm)', padding: '7px 12px', fontSize: 12, cursor: 'pointer' }}
        >
          ← 退出样例
        </button>
      </div>
    )
  }

  if (view === 'workspace' && user) {
    const onLogout = () => { chatOutbox.reset(); logout(); setUser(null); setView('login') }
    if (user.role === 'admin') return <AdminWorkspace onLogout={onLogout} />
    if (user.role === 'coach') return <PlanWorkspace onLogout={onLogout} me={user} />
    return null
  }

  return (
    <LoginScreen
      onLogin={(u) => { setUser(u); setView('workspace') }}
      onSampleMode={() => setView('sample')}
    />
  )
}
