import { useState } from 'react'
import { LoginScreen } from './features/auth/LoginScreen'
import { PlanWorkspace } from './features/workspace/PlanWorkspace'
import { PlanEditor } from './features/plan-editor/PlanEditor'
import { buildWeeks } from './features/plan-editor/sampleData'
import { currentUser, logout } from './api/auth'
import type { AuthUser } from './api/types'

type View = 'login' | 'workspace' | 'sample'

export default function App() {
  const [user, setUser] = useState<AuthUser | null>(() => {
    const cached = currentUser()
    if (!cached || cached.role === 'coach') return cached
    // Clear a stale student session written by an older client version rather
    // than entering the coach workspace with an unusable token.
    logout()
    return null
  })
  const [view, setView] = useState<View>(() => (currentUser()?.role === 'coach' ? 'workspace' : 'login'))

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
          style={{ position: 'absolute', left: 12, bottom: 12, zIndex: 70, background: 'var(--surface-2)', color: '#fff', border: '1px solid var(--border-strong)', borderRadius: 8, padding: '7px 12px', fontSize: 12, cursor: 'pointer' }}
        >
          ← 退出样例
        </button>
      </div>
    )
  }

  if (view === 'workspace' && user) {
    return <PlanWorkspace onLogout={() => { logout(); setUser(null); setView('login') }} />
  }

  return (
    <LoginScreen
      onLogin={(u) => { setUser(u); setView('workspace') }}
      onSampleMode={() => setView('sample')}
    />
  )
}
