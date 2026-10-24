import type { CoachView } from './CoachShell'

// Retired persisted view names are accepted only at this compatibility boundary.
export function normalizeCoachView(value: string | null): CoachView {
  if (value === 'requests') return 'board'
  return value === 'board' || value === 'catalog' || value === 'tracking' ? value : 'editor'
}

export function legacyStudentFromLocation(): string | null {
  const params = new URLSearchParams(window.location.search || window.location.hash.slice(1))
  const view = params.get('view')
  return view === 'messages' || view === 'feedback'
    ? params.get('studentId') ?? params.get('student') : null
}

interface CoachViewNavigation {
  currentView: CoachView
  nextView: CoachView
  guardLeave?: () => Promise<boolean>
  refreshEditor: () => Promise<boolean>
  commitView: (view: CoachView) => void
}

/**
 * Keep workspace navigation ordered around editor persistence:
 * leave guard first, then (when returning) a fresh server snapshot, then commit.
 */
export async function navigateCoachView({
  currentView,
  nextView,
  guardLeave,
  refreshEditor,
  commitView,
}: CoachViewNavigation): Promise<boolean> {
  if (nextView === currentView) return true
  if (currentView === 'editor' && guardLeave && !(await guardLeave())) return false
  if (nextView === 'editor' && !(await refreshEditor())) return false
  commitView(nextView)
  return true
}
