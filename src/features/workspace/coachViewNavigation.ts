import type { CoachView } from './CoachRail'

interface CoachViewNavigation {
  currentView: CoachView
  nextView: CoachView
  guardLeave?: () => Promise<boolean>
  refreshEditor: () => Promise<boolean>
  commitView: (view: CoachView) => void
}

/**
 * Keep rail navigation ordered around editor persistence:
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
