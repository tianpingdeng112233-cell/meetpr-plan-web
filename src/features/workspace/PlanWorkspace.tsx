import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { AuthUser, ChatConversation, ChatReadState, CoachBindRequest, CoachStudent, ExerciseResponse, ExerciseStatsOverview, PlanResponse, PlanWithChildren, StudentOnboardingProfile, StudentVideo } from '../../api/types'
import {
  getCoachStudents, getStudentPlans, getPlan, publishPlan, createPlan, patchPlan, getStudentOnboarding,
  markImportedHistory, renameCoachStudent, deletePlan,
} from '../../api/plans'
import { listExercises, createCustomExercise, getExerciseUsageStats } from '../../api/exercises'
import type { CreateCustomExerciseInput } from '../../api/exercises'
import { ApiException } from '../../api/client'
import { deriveStudentPlanCursor, mapPlanToWeeks, type Catalog } from '../plan-editor/mapping'
import { displayExerciseName, ExerciseIndex } from '../plan-editor/exerciseIndex'
import { reconcilePlan, reconcileImportedPlan, resizeServerPlanWeeks } from '../plan-editor/reconcile'
import { PlanEditor } from '../plan-editor/PlanEditor'
import { buildWeeks as buildSampleWeeks } from '../plan-editor/sampleData'
import { SamplePreviewBanner } from './SamplePreviewBanner'
import type { Week } from '../plan-editor/types'
import { planEndISO, todayISO } from '../plan-editor/components/PlanCalendarControls'
import { BackfillHistoryDialog, CompletePlanDialog, DeletePlanDialog, NewPlanDialog } from './PlanDialogs'
import { getBindRequests, getExerciseStatsOverview, getStudentVideos, refreshCoachStudents } from '../../api/coach'
import { CoachShell, type CoachView } from './CoachShell'
import { StudentBoard } from './StatsViews'
import { StudentHubPage } from './StudentHubPage'
import { REQUEST_POLL_INTERVAL_MS, RequestsPage } from './RequestsPage'
import { CatalogPage } from '../catalog/CatalogPage'
import { navigateCoachView } from './coachViewNavigation'
import { TrackingDashboard } from './TrackingDashboard'
import { clearDraftMirror } from '../plan-editor/draftMirror'
import { listConversations } from '../../api/chat'
import { isSessionExpired } from '../../api/errors'
import { unreadTotal } from '../chat/chatModel'
import { useVisiblePolling } from '../chat/useVisiblePolling'
import { chatOutbox } from '../chat/chatOutbox'
import { fmt, resolveLocale, S } from '../../i18n/strings'
import { createKeyedRequestVersions } from './requestVersions'
import {
  currentPublishedWeekTonnage,
  deriveRosterCounts,
  deriveRosterRows,
  FAILED_ROSTER_DATUM,
  filterRosterRows,
  isFailedRosterDatum,
  type RosterDataByStudent,
} from './rosterOverview'

interface Props { onLogout: () => void | Promise<void>; me: AuthUser }
type Loaded = { plan: PlanWithChildren; weeks: Week[]; weeksCount: number }
type WorkspaceRetry =
  | { kind: 'boot'; fallback: string }
  | { kind: 'student'; id: string; fallback: string; openEditor: boolean }
  | { kind: 'plan'; id: string; fallback: string }
type WorkspaceError = { message: string; retry: WorkspaceRetry }
const LAST_PLAN_PREFIX = 'mpw.lastPlan.'
const BIND_REQUESTS_KEY = 'bind-requests'
const sortedPlans = (list: PlanResponse[]) => [...list].sort((a, b) => (
  new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
))

function rejectsCreateAnchorWeekday(error: unknown): error is ApiException {
  if (!(error instanceof ApiException) || error.status !== 400) return false
  const issues = error.details.issues
  return Array.isArray(issues) && issues.some((issue) => {
    if (typeof issue !== 'object' || issue === null) return false
    const path = Reflect.get(issue, 'path')
    return Array.isArray(path) && path.includes('anchor_weekday')
  })
}

export function PlanWorkspace({ onLogout, me }: Props) {
  const [catalog, setCatalog] = useState<Catalog | null>(null)
  const [exerciseList, setExerciseList] = useState<ExerciseResponse[]>([])
  const [index, setIndex] = useState<ExerciseIndex | null>(null)
  const [students, setStudents] = useState<CoachStudent[]>([])
  const [studentId, setStudentId] = useState<string>('')
  const [onboarding, setOnboarding] = useState<StudentOnboardingProfile | null | undefined>(undefined)
  const [view, setView] = useState<CoachView>('editor')
  const [bindRequests, setBindRequests] = useState<CoachBindRequest[]>([])
  const [conversations, setConversations] = useState<ChatConversation[] | null>(null)
  const [sessionDead, setSessionDead] = useState(false)
  const [bindLostIds, setBindLostIds] = useState<Set<string>>(() => new Set())
  const [chatActiveId, setChatActiveId] = useState<string | null>(null)
  const [chatDrafts, setChatDrafts] = useState<Record<string, string>>({})
  const [commandExerciseId, setCommandExerciseId] = useState<string | null>(null)
  const [plans, setPlans] = useState<PlanResponse[]>([])
  const [plansByStudent, setPlansByStudent] = useState<Record<string, PlanResponse[]>>({})
  const [rosterDataByStudent, setRosterDataByStudent] = useState<RosterDataByStudent>({})
  // Same three-state convention as TrackingDashboard:
  // undefined = loading/not fetched, null = failed, array = successful (including empty).
  const [videosByStudent, setVideosByStudent] = useState<Record<string, StudentVideo[] | null | undefined>>({})
  const [lastSyncedAt, setLastSyncedAt] = useState<Date | null>(null)
  const [planId, setPlanId] = useState<string>('')
  const [loaded, setLoaded] = useState<Loaded | null>(null)
  const [error, setError] = useState<WorkspaceError | null>(null)
  const [booting, setBooting] = useState(true)
  const [bootAttempt, setBootAttempt] = useState(0)
  const [studentSwitching, setStudentSwitching] = useState(false)
  const [errorRetrying, setErrorRetrying] = useState(false)
  const [newPlanOpen, setNewPlanOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState('')
  const [completeOpen, setCompleteOpen] = useState(false)
  const [backfillOpen, setBackfillOpen] = useState(false)
  const [backfilling, setBackfilling] = useState(false)
  const [backfillError, setBackfillError] = useState('')
  const [completing, setCompleting] = useState(false)
  const [completeError, setCompleteError] = useState('')
  // Student and plan requests can resolve out of order when a coach switches
  // quickly. A single generation covers both levels so an old response can
  // never pair one student's label with another student's editable plan.
  const loadGeneration = useRef(0)
  const inboxRequest = useRef(0)
  const rosterBackgroundGeneration = useRef(0)
  const planRequestVersions = useRef(createKeyedRequestVersions())
  const videoRequestVersions = useRef(createKeyedRequestVersions())
  const rosterDataRequestVersions = useRef(createKeyedRequestVersions())
  const rosterOverviewRequests = useRef(new Map<string, {
    version: number
    promise: Promise<ExerciseStatsOverview>
  }>())
  const bindRequestVersions = useRef(createKeyedRequestVersions())
  const plansByStudentRef = useRef<Record<string, PlanResponse[]>>({})
  const rosterDataByStudentRef = useRef<RosterDataByStudent>({})
  // Shared across per-student ExerciseIndex instances so in-session picks keep
  // influencing ordering after the coach switches students.
  const exerciseUsage = useRef(new Map<string, number>())
  const leaveGuardRef = useRef<(() => Promise<boolean>) | null>(null)
  const viewTransitioning = useRef(false)
  // Mirrors viewTransitioning for rendering: while a guarded view switch is in
  // flight the editor stays mounted but must not accept further edits.
  const [viewSwitching, setViewSwitching] = useState(false)
  // `inert` (set via effect — not in React 18's JSX types) freezes the whole
  // editor subtree: no Tab focus, no clicks on menus/dialogs above the shield.
  const editorShellRef = useRef<HTMLDivElement | null>(null)
  useEffect(() => {
    const el = editorShellRef.current
    if (!el) return
    if (viewSwitching) el.setAttribute('inert', '')
    else el.removeAttribute('inert')
  }, [viewSwitching])

  const errText = (e: unknown, fb: string) => (e instanceof ApiException ? `${fb}（${e.code}）` : fb)
  const refreshBindRequests = useCallback(async () => {
    const version = bindRequestVersions.current.issue(BIND_REQUESTS_KEY)
    try {
      const rows = await getBindRequests()
      if (!bindRequestVersions.current.isLatest(BIND_REQUESTS_KEY, version)) return
      setBindRequests(rows)
    } catch (caught) {
      if (isSessionExpired(caught)) setSessionDead(true)
    }
  }, [])
  const applyBindRequests = useCallback((rows: CoachBindRequest[]) => {
    // A successful accept/reject is newer authority than every list request
    // already in flight, so those responses must not resurrect the card/badge.
    bindRequestVersions.current.invalidate(BIND_REQUESTS_KEY)
    setBindRequests(rows)
  }, [])

  const updateRosterData = useCallback((id: string, patch: RosterDataByStudent[string]) => {
    const next = {
      ...rosterDataByStudentRef.current,
      [id]: { ...rosterDataByStudentRef.current[id], ...patch },
    }
    rosterDataByStudentRef.current = next
    setRosterDataByStudent(next)
  }, [])

  const fetchStudentPlans = useCallback(async (id: string, canApply: () => boolean = () => true) => {
    const version = planRequestVersions.current.issue(id)
    try {
      const rows = sortedPlans(await getStudentPlans(id))
      if (!canApply() || !planRequestVersions.current.isLatest(id, version)) return null
      const next = { ...plansByStudentRef.current, [id]: rows }
      plansByStudentRef.current = next
      setPlansByStudent(next)
      updateRosterData(id, { plansError: false })
      return rows
    } catch (caught) {
      if (canApply() && planRequestVersions.current.isLatest(id, version)) {
        updateRosterData(id, { plansError: true })
      }
      throw caught
    }
  }, [updateRosterData])

  const refreshStudentVideos = useCallback(async (id: string, canApply: () => boolean = () => true) => {
    const version = videoRequestVersions.current.issue(id)
    // Keep a successful list mounted during an in-place refresh (feedback,
    // viewed state, calibration). First load and failure retries still expose
    // the loading state instead of a misleading empty array.
    setVideosByStudent((prev) => (
      Array.isArray(prev[id]) ? prev : { ...prev, [id]: undefined }
    ))
    try {
      const rows = await getStudentVideos(id)
      if (!canApply() || !videoRequestVersions.current.isLatest(id, version)) return
      setVideosByStudent((prev) => ({ ...prev, [id]: rows }))
    } catch {
      if (!canApply() || !videoRequestVersions.current.isLatest(id, version)) return
      setVideosByStudent((prev) => ({ ...prev, [id]: null }))
    }
  }, [])

  const fetchRosterOverview = useCallback(async (
    id: string,
    canApply: () => boolean = () => true,
    force = false,
  ) => {
    const cached = rosterDataByStudentRef.current[id]?.overview
    if (!force && cached !== undefined) return
    const key = `overview:${id}`
    let request = rosterOverviewRequests.current.get(id)
    if (!request) {
      const version = rosterDataRequestVersions.current.issue(key)
      const promise = getExerciseStatsOverview(id)
      request = { version, promise }
      rosterOverviewRequests.current.set(id, request)
      const clearRequest = () => {
        if (rosterOverviewRequests.current.get(id) === request) {
          rosterOverviewRequests.current.delete(id)
        }
      }
      void promise.then(clearRequest, clearRequest)
    }
    try {
      const overview = await request.promise
      if (!canApply() || !rosterDataRequestVersions.current.isLatest(key, request.version)) return
      updateRosterData(id, { overview })
    } catch {
      if (!canApply() || !rosterDataRequestVersions.current.isLatest(key, request.version)) return
      updateRosterData(id, { overview: FAILED_ROSTER_DATUM })
    }
  }, [updateRosterData])

  const refreshRosterOverview = useCallback((id: string) => {
    updateRosterData(id, { overview: undefined })
    void fetchRosterOverview(id, () => true, true)
  }, [fetchRosterOverview, updateRosterData])

  // Tracking tab reuses the roster overview cache — one GET per student, ever (rate-limit budget).
  const ensureTrackingOverview = useCallback((id: string) => {
    void fetchRosterOverview(id, () => true, isFailedRosterDatum(rosterDataByStudentRef.current[id]?.overview))
  }, [fetchRosterOverview])

  const fetchRosterProfile = useCallback(async (
    id: string,
    canApply: () => boolean = () => true,
  ): Promise<StudentOnboardingProfile | null | undefined> => {
    const key = `profile:${id}`
    const version = rosterDataRequestVersions.current.issue(key)
    try {
      const profile = await getStudentOnboarding(id)
      if (!canApply() || !rosterDataRequestVersions.current.isLatest(key, version)) return undefined
      updateRosterData(id, { profile, profileError: false })
      return profile
    } catch {
      if (!canApply() || !rosterDataRequestVersions.current.isLatest(key, version)) return undefined
      updateRosterData(id, { profile: undefined, profileError: true })
      return undefined
    }
  }, [updateRosterData])

  const refreshRosterProfile = useCallback((id: string) => {
    updateRosterData(id, { profile: undefined, profileError: false })
    void fetchRosterProfile(id)
  }, [fetchRosterProfile, updateRosterData])

  const fetchRosterWeekTonnage = useCallback(async (
    id: string,
    studentPlans: PlanResponse[],
    canApply: () => boolean = () => true,
  ) => {
    const key = `week-tonnage:${id}`
    const version = rosterDataRequestVersions.current.issue(key)
    const current = [...studentPlans]
      .filter((plan) => plan.status === 'published')
      .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime())[0]
    let weekTonnageKg: RosterDataByStudent[string]['weekTonnageKg'] = null
    let planCursor: RosterDataByStudent[string]['planCursor'] = null
    if (current) {
      try {
        const plan = await getPlan(current.id)
        weekTonnageKg = currentPublishedWeekTonnage(plan)
        planCursor = deriveStudentPlanCursor(plan)
      } catch {
        weekTonnageKg = FAILED_ROSTER_DATUM
        planCursor = null
      }
    }
    if (!canApply() || !rosterDataRequestVersions.current.isLatest(key, version)) return
    updateRosterData(id, { weekTonnageKg, planCursor })
  }, [updateRosterData])

  const refreshRosterWeekTonnage = useCallback((
    id: string,
    studentPlans: PlanResponse[],
    showLoadingState = false,
  ) => {
    const key = `week-tonnage:${id}`
    rosterDataRequestVersions.current.invalidate(key)
    if (showLoadingState || isFailedRosterDatum(rosterDataByStudentRef.current[id]?.weekTonnageKg)) {
      updateRosterData(id, { weekTonnageKg: undefined, planCursor: undefined })
    }
    void fetchRosterWeekTonnage(id, studentPlans)
  }, [fetchRosterWeekTonnage, updateRosterData])

  const refreshRosterPlans = useCallback((id: string) => {
    updateRosterData(id, { plansError: false })
    void fetchStudentPlans(id).then((studentPlans) => {
      if (studentPlans && rosterDataByStudentRef.current[id]?.weekTonnageKg === undefined) {
        void fetchRosterWeekTonnage(id, studentPlans)
      }
    }).catch(() => undefined)
  }, [fetchRosterWeekTonnage, fetchStudentPlans, updateRosterData])

  const updateStudentPlans = useCallback((
    id: string,
    update: (current: PlanResponse[]) => PlanResponse[],
  ) => {
    // A mutation response is newer authority than any list or tonnage request
    // already in flight for this student.
    planRequestVersions.current.invalidate(id)
    setPlans(update)
    const studentPlans = update(plansByStudentRef.current[id] ?? [])
    const next = {
      ...plansByStudentRef.current,
      [id]: studentPlans,
    }
    plansByStudentRef.current = next
    setPlansByStudent(next)
    refreshRosterWeekTonnage(id, studentPlans)
  }, [refreshRosterWeekTonnage])

  const loadPlan = useCallback(async (id: string, cat: Catalog, generation = ++loadGeneration.current) => {
    try {
      const full = await getPlan(id)
      if (generation !== loadGeneration.current) return false
      // Set loaded + planId together (after the fetch) so the keyed PlanEditor
      // remounts once with the real weeks — not an empty mount on an early key change.
      setLoaded({ plan: full, weeks: mapPlanToWeeks(full, cat), weeksCount: full.plan_weeks })
      setPlanId(id)
      localStorage.setItem(`${LAST_PLAN_PREFIX}${full.trainee_id}`, id)
      return true
    } catch (e) {
      // A rejected request from a student/plan that is no longer selected is
      // just stale work, not an error for the current workspace.
      if (generation !== loadGeneration.current) return false
      throw e
    }
  }, [])

  const loadStudent = useCallback(async (id: string, cat: Catalog, exercises: ExerciseResponse[] = exerciseList) => {
    const generation = ++loadGeneration.current
    // Invalidate any background fetch for this student before exposing the new
    // selection, and remove both the current list and its cached mount in the
    // same render. Until the foreground response wins, this student is unknown.
    planRequestVersions.current.invalidate(id)
    setStudentSwitching(true)
    setStudentId(id); setOnboarding(undefined); setLoaded(null); setPlanId('')
    setPlans([])
    if (Object.hasOwn(plansByStudentRef.current, id)) {
      const next = { ...plansByStudentRef.current }
      delete next[id]
      plansByStudentRef.current = next
      setPlansByStudent(next)
    }
    try {
      const [list, onboarding] = await Promise.all([
        fetchStudentPlans(id),
        fetchRosterProfile(id),
        Object.hasOwn(rosterDataByStudentRef.current[id] ?? {}, 'overview')
          ? Promise.resolve()
          : fetchRosterOverview(id),
      ])
      if (generation !== loadGeneration.current) return false
      setOnboarding(onboarding)
      setIndex(new ExerciseIndex(exercises, { deadliftStyle: onboarding?.deadlift_style }, exerciseUsage.current))
      if (!list) return false
      setPlans(list)
      const remembered = localStorage.getItem(`${LAST_PLAN_PREFIX}${id}`)
      const initial = list.find((plan) => plan.id === remembered) ?? list[0]
      if (initial) return await loadPlan(initial.id, cat, generation)
      return true
    } catch (e) {
      if (generation !== loadGeneration.current) return false
      throw e
    } finally {
      if (generation === loadGeneration.current) setStudentSwitching(false)
    }
  }, [exerciseList, fetchRosterOverview, fetchRosterProfile, fetchStudentPlans, loadPlan])

  const loadRosterBackground = useCallback(async (roster: CoachStudent[], skipPlanStudentId?: string) => {
    const generation = ++rosterBackgroundGeneration.current

    // Keep every roster-wide request deliberately serial. These secondary
    // signals must not burst through the backend's per-minute request budget.
    for (const student of roster) {
      let studentPlans: PlanResponse[] | undefined = plansByStudentRef.current[student.id]
      if (student.id !== skipPlanStudentId || !studentPlans) {
        try {
          studentPlans = await fetchStudentPlans(
            student.id,
            () => generation === rosterBackgroundGeneration.current,
          ) ?? undefined
        } catch {
          // A missing queue badge is preferable to taking down the workspace.
        }
      }
      if (generation !== rosterBackgroundGeneration.current) return

      // Foreground loading and roster hydration share this cache. A background
      // pass must neither wait on nor duplicate an in-flight overview, and a
      // completed null result still counts as authoritative for this pass.
      if (
        !Object.hasOwn(rosterDataByStudentRef.current[student.id] ?? {}, 'overview')
        && !rosterOverviewRequests.current.has(student.id)
      ) {
        await fetchRosterOverview(
          student.id,
          () => generation === rosterBackgroundGeneration.current,
        )
      }
      if (generation !== rosterBackgroundGeneration.current) return

      if (!Object.hasOwn(rosterDataByStudentRef.current[student.id] ?? {}, 'profile')) {
        await fetchRosterProfile(
          student.id,
          () => generation === rosterBackgroundGeneration.current,
        )
      }
      if (generation !== rosterBackgroundGeneration.current) return

      if (studentPlans) {
        await fetchRosterWeekTonnage(
          student.id,
          studentPlans,
          () => generation === rosterBackgroundGeneration.current,
        )
      }
      if (generation !== rosterBackgroundGeneration.current) return

      await refreshStudentVideos(
        student.id,
        () => generation === rosterBackgroundGeneration.current,
      )
      if (generation !== rosterBackgroundGeneration.current) return
    }
  }, [
    fetchRosterOverview,
    fetchRosterProfile,
    fetchRosterWeekTonnage,
    fetchStudentPlans,
    refreshStudentVideos,
  ])

  const refreshInbox = useCallback(async () => {
    const generation = inboxRequest.current
    try {
      const next = await listConversations()
      if (generation === inboxRequest.current) {
        setConversations(next)
        setLastSyncedAt(new Date())
      }
    } catch (caught) {
      if (isSessionExpired(caught)) setSessionDead(true)
    }
  }, [])

  const applyConversations = useCallback((update: (prev: ChatConversation[]) => ChatConversation[]) => {
    inboxRequest.current += 1
    setConversations((prev) => update(prev ?? []))
  }, [])

  const applyReadState = useCallback((conversationId: string, state: ChatReadState) => {
    applyConversations((prev) => prev.map((conversation) => conversation.id === conversationId
      ? { ...conversation, unread_count: state.unread_count, my_last_read: state.my_last_read }
      : conversation))
  }, [applyConversations])

  const updateChatDraft = useCallback((conversationId: string, text: string) => {
    setChatDrafts((prev) => {
      if (prev[conversationId] === text) return prev
      if (text === '') {
        const { [conversationId]: _removed, ...rest } = prev
        return rest
      }
      return { ...prev, [conversationId]: text }
    })
  }, [])

  useEffect(() => {
    chatOutbox.setErrorSink((caught) => {
      if (isSessionExpired(caught)) setSessionDead(true)
    })
    return () => chatOutbox.setErrorSink(null)
  }, [])

  // boot: catalog + roster + first student + first plan. Roster-wide badge
  // data is intentionally excluded from this critical path.
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const [ex, usage, st] = await Promise.all([
          listExercises(),
          getExerciseUsageStats().catch(() => []),
          getCoachStudents(),
          refreshBindRequests(),
        ])
        exerciseUsage.current = new Map(usage.map((stat) => [stat.exercise_id, stat.plan_count]))
        const cat: Catalog = new Map(ex.map((e) => [e.id, { name: displayExerciseName(e.name), nameEn: e.name_en, custom: e.created_by_coach_id != null }]))
        setExerciseList(ex); setCatalog(cat); setIndex(new ExerciseIndex(ex, {}, exerciseUsage.current)); setStudents(st)
        if (st.length > 0) {
          await loadStudent(st[0].id, cat, ex)
          if (!alive) return
          void refreshInbox()
          void loadRosterBackground(st, st[0].id)
        }
        setLastSyncedAt(new Date())
      } catch (e) {
        if (alive) {
          const fallback = S.workspace.plan.backendUnavailable
          setError({ message: errText(e, fallback), retry: { kind: 'boot', fallback } })
        }
      } finally {
        if (alive) setBooting(false)
      }
    })()
    return () => {
      alive = false
      rosterBackgroundGeneration.current += 1
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bootAttempt])

  useVisiblePolling(refreshBindRequests, REQUEST_POLL_INTERVAL_MS, {
    enabled: !sessionDead,
    immediate: false,
  })

  useVisiblePolling(refreshInbox, view === 'messages' ? 30_000 : 60_000, {
    enabled: !sessionDead && students.length > 0,
    immediate: false,
  })

  useEffect(() => {
    if (view === 'messages' && students.length > 0 && !sessionDead) void refreshInbox()
  }, [refreshInbox, sessionDead, students.length, view])

  const switchStudent = async (id: string) => {
    if (!catalog || id === studentId) return
    try {
      await loadStudent(id, catalog)
    } catch (e) {
      const fallback = S.workspace.plan.switchStudentFailed
      setError({ message: errText(e, fallback), retry: { kind: 'student', id, fallback, openEditor: false } })
    }
  }
  const selectBoardStudent = (id: string) => {
    if (id === studentId) return
    setStudentId(id)
  }
  const refreshStudentsAfterAccept = async () => {
    const previousIds = new Set(students.map((student) => student.id))
    const [next] = await Promise.all([
      refreshCoachStudents().catch(() => null),
      refreshBindRequests(),
    ])
    if (!next) return
    setStudents(next)
    const firstStudentId = !studentId ? next[0]?.id : undefined
    if (firstStudentId && catalog) await loadStudent(firstStudentId, catalog)
    const addedStudents = next.filter((student) => !previousIds.has(student.id))
    if (addedStudents.length > 0) {
      void loadRosterBackground(next, firstStudentId ?? studentId)
    }
    setLastSyncedAt(new Date())
  }
  const switchPlan = async (id: string) => {
    if (!catalog || id === planId) return
    try {
      await loadPlan(id, catalog)
    } catch (e) {
      const fallback = S.workspace.plan.openPlanFailed
      setError({ message: errText(e, fallback), retry: { kind: 'plan', id, fallback } })
    }
  }
  const newPlan = () => {
    if (!catalog || !studentId) return
    setNewPlanOpen(true)
  }
  const createNewPlan = async (name: string, weeks: number, startDate: string, anchorWeekday: number) => {
    if (!catalog || !studentId) throw new Error('PLAN_CONTEXT_MISSING')
    const generation = ++loadGeneration.current
    const targetStudentId = studentId
    try {
      const body = {
        trainee_id: targetStudentId, name, start_date: startDate, end_date: planEndISO(startDate, weeks),
        plan_weeks: weeks, anchor_weekday: anchorWeekday, source: 'coach' as const, kind: 'regular' as const,
      }
      let created: PlanResponse
      try {
        created = await createPlan(body)
      } catch (error) {
        if (!rejectsCreateAnchorWeekday(error)) throw error
        const { anchor_weekday: _unsupported, ...legacyBody } = body
        const legacyCreated = await createPlan(legacyBody)
        const patched = await patchPlan(legacyCreated.id, { anchor_weekday: anchorWeekday })
        created = { ...legacyCreated, ...patched, anchor_weekday: patched.anchor_weekday ?? anchorWeekday }
      }
      if (generation !== loadGeneration.current) return
      updateStudentPlans(targetStudentId, (prev) => [created, ...prev])
      await loadPlan(created.id, catalog, generation)
      setNewPlanOpen(false)
    } catch (e) {
      if (generation === loadGeneration.current) throw e
    }
  }

  const deleteCurrentPlan = async () => {
    if (!loaded || loaded.plan.status !== 'draft' || !catalog || deleting) return
    setDeleting(true)
    setDeleteError('')
    const deletedId = loaded.plan.id
    const generation = ++loadGeneration.current
    try {
      await deletePlan(deletedId)
      // The backend deletion is authoritative even if a newer load superseded
      // this UI request while it was in flight.
      clearDraftMirror(deletedId)
      if (generation !== loadGeneration.current) return
      const remaining = sortedPlans(plans.filter((plan) => plan.id !== deletedId))
      updateStudentPlans(studentId, () => remaining)
      setDeleteOpen(false)
      if (remaining[0]) {
        await loadPlan(remaining[0].id, catalog, generation)
      } else {
        setLoaded(null)
        setPlanId('')
        localStorage.removeItem(`${LAST_PLAN_PREFIX}${studentId}`)
      }
    } catch (e) {
      if (generation === loadGeneration.current) setDeleteError(errText(e, S.workspace.plan.deleteFailed))
    } finally {
      if (generation === loadGeneration.current) setDeleting(false)
    }
  }

  const backfillHistory = async () => {
    if (!loaded || backfilling) return
    setBackfilling(true)
    setBackfillError('')
    try {
      const result = await markImportedHistory(loaded.plan.id)
      setBackfillOpen(false)
      window.alert(result.created_set_logs > 0
        ? S.workspace.plan.backfillSuccess(result.created_set_logs)
        : S.workspace.plan.noPastToBackfill)
    } catch (e) {
      setBackfillError(errText(e, S.workspace.plan.backfillFailed))
    } finally {
      setBackfilling(false)
    }
  }

  const markCurrentComplete = async () => {
    if (!loaded || loaded.plan.status !== 'published' || completing) return
    setCompleting(true)
    setCompleteError('')
    try {
      const updated = await patchPlan(loaded.plan.id, { status: 'completed' })
      updateStudentPlans(updated.trainee_id, (prev) => prev.map((plan) => plan.id === updated.id ? updated : plan))
      setLoaded((prev) => prev && prev.plan.id === updated.id
        ? { ...prev, plan: { ...prev.plan, ...updated } }
        : prev)
      setCompleteOpen(false)
    } catch (e) {
      setCompleteError(errText(e, S.workspace.plan.completeFailed))
    } finally {
      setCompleting(false)
    }
  }

  const handleCreateExercise = async (input: CreateCustomExerciseInput) => {
    const exercise = await createCustomExercise(input)
    const custom = exercise.created_by_coach_id != null
    setExerciseList((prev) => (prev.some((item) => item.id === exercise.id) ? prev : [...prev, exercise]))
    setCatalog((prev) => {
      const next = new Map(prev ?? [])
      next.set(exercise.id, { name: displayExerciseName(exercise.name), nameEn: exercise.name_en, custom })
      return next
    })
    setIndex((prev) => (prev ? prev.withAdded(exercise) : new ExerciseIndex([exercise], {}, exerciseUsage.current)))
    return { id: exercise.id, name: exercise.name }
  }

  const setLeaveGuard = useCallback((guard: (() => Promise<boolean>) | null) => {
    leaveGuardRef.current = guard
  }, [])
  const confirmWorkspaceLeave = useCallback(async () => (
    leaveGuardRef.current ? leaveGuardRef.current() : true
  ), [])

  const changeView = async (nextView: CoachView): Promise<boolean> => {
    if (nextView === view) return true
    if (viewTransitioning.current) return false
    viewTransitioning.current = true
    // The guard's flush can take a while on big plans; blur + overlay (below)
    // close the window where the still-mounted editor could accept edits that
    // would only get the fire-and-forget unmount flush.
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur()
    setViewSwitching(true)
    try {
      return await navigateCoachView({
        currentView: view,
        nextView,
        guardLeave: leaveGuardRef.current ?? undefined,
        refreshEditor: async () => {
          if (!catalog || !studentId) return true
          if (loaded?.plan.trainee_id !== studentId) {
            await loadStudent(studentId, catalog)
            return true
          }
          if (!planId) return true
          // false = superseded by a newer load (e.g. concurrent student switch),
          // which owns `loaded` and has already reset it — committing the view
          // then shows that fresh state, never a stale snapshot. Only a thrown
          // error should keep the user where they are.
          await loadPlan(planId, catalog)
          return true
        },
        commitView: setView,
      })
    } catch (e) {
      window.alert(errText(e, S.workspace.plan.reloadFailed))
      return false
    } finally {
      viewTransitioning.current = false
      setViewSwitching(false)
    }
  }

  const rosterRows = useMemo(() => deriveRosterRows({
    students,
    dataByStudent: rosterDataByStudent,
    plansByStudent,
    conversations,
  }), [conversations, plansByStudent, rosterDataByStudent, students])
  const rosterCounts = useMemo(() => deriveRosterCounts(rosterRows), [rosterRows])
  const pendingStudents = useMemo(() => (
    filterRosterRows(rosterRows, 'pending').map((row) => row.student)
  ), [rosterRows])

  const retryWorkspace = async () => {
    if (!error || errorRetrying) return
    const action = error.retry
    if (action.kind === 'boot') {
      setError(null)
      setBooting(true)
      setBootAttempt((attempt) => attempt + 1)
      return
    }
    if (!catalog) return
    setErrorRetrying(true)
    try {
      if (action.kind === 'student') {
        await loadStudent(action.id, catalog)
        if (action.openEditor) setView('editor')
      } else {
        await loadPlan(action.id, catalog)
      }
      setError(null)
    } catch (caught) {
      setError({ message: errText(caught, action.fallback), retry: action })
    } finally {
      setErrorRetrying(false)
    }
  }

  if (error) {
    return (
      <Centered>
        <div style={{ color: 'var(--brand-red)', marginBottom: 14 }}>{error.message}</div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button type="button" onClick={() => { void retryWorkspace() }} disabled={errorRetrying} style={{ ...btn, background: 'var(--ink)', color: 'var(--white)' }}>
            {errorRetrying ? S.common.loadingEllipsis : S.common.retry}
          </button>
          <button type="button" onClick={onLogout} style={btn}>{S.workspace.plan.signInAgain}</button>
        </div>
      </Centered>
    )
  }
  if (booting) return <Centered><span style={{ color: 'var(--fg-tertiary)' }}>{S.common.loadingEllipsis}</span></Centered>

  const hasStudents = students.length > 0
  const sampleWeeks = hasStudents ? [] : buildSampleWeeks()
  const studentName = students.find((s) => s.id === studentId)?.display_name ?? ''
  const studentOpts = students.map((s) => ({ id: s.id, label: s.display_name, tag: s.status === 'in_evaluation' ? S.workspace.plan.assessment : undefined }))
  const hasEveryVideoArray = students.every((student) => Array.isArray(videosByStudent[student.id]))
  const videoCount = hasEveryVideoArray
    ? students.reduce((total, student) => (
        total + (videosByStudent[student.id] ?? []).filter((video) => video.viewed_at == null).length
      ), 0)
    : null
  const unreadCount = unreadTotal(conversations)
  const openStudentEditor = async (id: string) => {
    if (!catalog || (view === 'editor' && id === studentId)) return
    if (view === 'editor' && leaveGuardRef.current && !(await leaveGuardRef.current())) return
    try {
      await loadStudent(id, catalog)
      if (view !== 'editor') setView('editor')
    } catch (e) {
      const fallback = S.workspace.plan.openStudentPlanFailed
      setError({ message: errText(e, fallback), retry: { kind: 'student', id, fallback, openEditor: true } })
    }
  }
  const openExerciseFromCommand = async (id: string) => {
    setCommandExerciseId(null)
    const navigated = view === 'catalog' || await changeView('catalog')
    if (navigated) setCommandExerciseId(id)
  }
  // "M/D 起 · N 周" so same-named plans stay tellable-apart in the switcher.
  const fmtStart = (iso: string) => { const [y, m, d] = iso.split('-').map(Number); return fmt.monthDay(new Date(y, m - 1, d), () => `${m}/${d}`) }
  const statusTag = (status: PlanResponse['status']) => ({ draft: S.common.draft, published: S.common.published, completed: S.common.completed, paused: S.common.paused })[status]
  const planOpts = plans.map((p) => ({
    id: p.id,
    label: p.name,
    sub: S.workspace.plan.startSummary(fmtStart(p.start_date), p.plan_weeks),
    tag: statusTag(p.status),
  }))
  const historicalReadOnly = loaded?.plan.status === 'completed' || loaded?.plan.status === 'paused'
  const planContentEditable = loaded?.plan.status === 'draft' || loaded?.plan.status === 'published'
  const activePublishedPlanId = plans.find((plan) => plan.status === 'published')?.id
  const studentPlanCursor = loaded?.plan.trainee_id === studentId && loaded.plan.id === activePublishedPlanId
    ? deriveStudentPlanCursor(loaded.plan)
    : rosterDataByStudent[studentId]?.planCursor

  return (
    <CoachShell
      view={view}
      onChange={(next) => { void changeView(next) }}
      me={me}
      exerciseCount={exerciseList.length}
      pendingStudents={pendingStudents}
      pendingCount={rosterCounts.pending}
      unreadCount={unreadCount}
      requestCount={bindRequests.length}
      videoCount={videoCount}
      onPickPending={(id) => { void openStudentEditor(id) }}
      lastSyncedAt={lastSyncedAt}
      onLogout={onLogout}
      onConfirmLeave={confirmWorkspaceLeave}
      commandStudents={students.map((student) => ({ id: student.id, label: student.display_name }))}
      commandExercises={exerciseList.map((exercise) => ({
        id: exercise.id,
        label: fmt.exerciseName({ name: catalog?.get(exercise.id)?.name ?? displayExerciseName(exercise.name), name_en: exercise.name_en }),
        secondary: resolveLocale() === 'zh' ? exercise.name_en : null,
      }))}
      onCommandStudent={(id) => openStudentEditor(id)}
      onCommandExercise={openExerciseFromCommand}
    >
      {sessionDead && <div className="chat-session-banner">{S.workspace.plan.sessionExpired}</div>}
      {view === 'editor' && !hasStudents && (
        <div style={{ position: 'relative', height: '100%' }}>
          <PlanEditor
            key="sample-preview"
            initialWeeks={sampleWeeks}
            weeksCount={sampleWeeks.length}
            studentName={S.workspace.plan.sampleStudent}
            planName={S.workspace.plan.samplePlan}
            exerciseIndex={index}
            onBackToBoard={() => { void changeView('board') }}
          />
          <SamplePreviewBanner onRefresh={() => window.location.reload()} />
        </div>
      )}
    {view === 'editor' && hasStudents && <div ref={editorShellRef} style={{ position: 'relative', height: '100%' }}>
      <PlanEditor
        key={planId || `empty-${studentId}`}
        initialWeeks={loaded?.weeks ?? []}
        weeksCount={loaded?.weeksCount ?? 0}
        studentName={studentName}
        studentId={studentId}
        onboardingProfile={onboarding}
        exerciseStatsOverview={isFailedRosterDatum(rosterDataByStudent[studentId]?.overview) ? null : rosterDataByStudent[studentId]?.overview}
        planName={loaded?.plan.name ?? S.workspace.plan.noPlanParenthesized}
        planStartDate={loaded?.plan.start_date}
        planStatus={loaded?.plan.status}
        totalShiftDays={loaded?.plan.total_shift_days}
        studentPlanCursor={studentPlanCursor}
        readOnly={historicalReadOnly}
        initialPublished={loaded?.plan.status === 'published'}
        onPublish={loaded?.plan.status === 'draft' ? async () => {
          const updated = await publishPlan(loaded.plan.id)
          // Reflect the now-live status in the parent-owned list + loaded plan, so the plan
          // switcher's「草稿/已发布」tag can't contradict the editor — no UI shows「草稿」for a
          // plan the student is already seeing. (publishPlan returns the updated plan.)
          updateStudentPlans(updated.trainee_id, (prev) => prev.map((p) => (p.id === updated.id ? updated : p)))
          setLoaded((prev) => (prev && prev.plan.id === updated.id ? { ...prev, plan: { ...prev.plan, ...updated } } : prev))
        } : undefined}
        onSave={loaded && planContentEditable ? async (weeks, importStart, markPastAsAssumedComplete, onProgress) => {
          const reconcileOptions = {
            published: loaded.plan.status === 'published',
            catalog: catalog ?? undefined,
          }
          const result = importStart
            ? await reconcileImportedPlan(loaded.plan.id, weeks, importStart, onProgress, reconcileOptions)
            : await reconcilePlan(loaded.plan.id, weeks, onProgress, reconcileOptions)
          if (importStart && markPastAsAssumedComplete) {
            // The plan itself is already reconciled at this point. History
            // marking rides a backend endpoint that may not be deployed yet
            // (feat/043-plan-import-backend); failing the whole save here would
            // put the editor in a permanent retry loop over an optional extra.
            try {
              await markImportedHistory(loaded.plan.id)
            } catch {
              window.alert(S.workspace.plan.importBackfillFailed)
            }
          }
          if (result.planStartDate && result.planEndDate && result.planWeeks != null) {
            const calendar = {
              start_date: result.planStartDate,
              end_date: result.planEndDate,
              plan_weeks: result.planWeeks,
            }
            // The editor remains mounted after an import/date shift. Update the
            // parent-owned plan too, otherwise the next shift/undo would derive
            // from stale metadata even though the backend already accepted it.
            updateStudentPlans(loaded.plan.trainee_id, (prev) => prev.map((plan) => (
              plan.id === loaded.plan.id ? { ...plan, ...calendar } : plan
            )))
            setLoaded((prev) => (
              prev && prev.plan.id === loaded.plan.id
                ? { ...prev, plan: { ...prev.plan, ...calendar }, weeksCount: calendar.plan_weeks }
                : prev
            ))
          } else {
            refreshRosterWeekTonnage(
              loaded.plan.trainee_id,
              plansByStudentRef.current[loaded.plan.trainee_id] ?? [],
            )
          }
          return result
        } : undefined}
        onRename={loaded && planContentEditable ? async (name) => {
          const updated = await patchPlan(loaded.plan.id, { name })
          // Keep the switcher list + the loaded plan in sync so the new name shows everywhere.
          updateStudentPlans(updated.trainee_id, (prev) => prev.map((p) => (p.id === updated.id ? updated : p)))
          setLoaded((prev) => (prev && prev.plan.id === updated.id ? { ...prev, plan: { ...prev.plan, ...updated } } : prev))
        } : undefined}
        onChangeStartDate={loaded && planContentEditable ? async (startDate) => {
          const calendar = {
            start_date: startDate,
            end_date: planEndISO(startDate, loaded.plan.plan_weeks),
          }
          const updated = await patchPlan(loaded.plan.id, calendar)
          const nextPlan = { ...updated, ...calendar }
          updateStudentPlans(loaded.plan.trainee_id, (prev) => prev.map((plan) => (
            plan.id === loaded.plan.id ? { ...plan, ...nextPlan } : plan
          )))
          setLoaded((prev) => prev && prev.plan.id === loaded.plan.id
            ? { ...prev, plan: { ...prev.plan, ...nextPlan } }
            : prev)
        } : undefined}
        onChangePlanWeeks={loaded ? async (planWeeks) => {
          if (loaded.plan.status !== 'draft') throw new Error('PLAN_NOT_DRAFT')
          await resizeServerPlanWeeks(loaded.plan.id, planWeeks)
          updateStudentPlans(loaded.plan.trainee_id, (prev) => prev.map((plan) => plan.id === loaded.plan.id ? { ...plan, plan_weeks: planWeeks } : plan))
          setLoaded((prev) => prev && prev.plan.id === loaded.plan.id
            ? {
                ...prev,
                plan: {
                  ...prev.plan,
                  plan_weeks: planWeeks,
                  days: prev.plan.days.filter((day) => day.week_number <= planWeeks),
                },
                weeksCount: planWeeks,
              }
            : prev)
        } : undefined}
        onRenameStudent={studentId ? async (name) => {
          const updated = await renameCoachStudent(studentId, name)
          setStudents((prev) => prev.map((student) => (
            student.id === updated.id ? { ...student, display_name: updated.display_name } : student
          )))
        } : undefined}
        exerciseIndex={index}
        onCreateExercise={handleCreateExercise}
        students={studentOpts}
        currentStudentId={studentId}
        onSwitchStudent={switchStudent}
        plans={planOpts}
        currentPlanId={planId}
        onSwitchPlan={switchPlan}
        onNewPlan={newPlan}
        onDeleteCurrentDraft={loaded?.plan.status === 'draft' ? () => { setDeleteError(''); setDeleteOpen(true) } : undefined}
        onMarkComplete={loaded?.plan.status === 'published' ? () => { setCompleteError(''); setCompleteOpen(true) } : undefined}
        onBackfillHistory={loaded && loaded.plan.status !== 'draft' && loaded.plan.start_date < todayISO()
          ? () => { setBackfillError(''); setBackfillOpen(true) }
          : undefined}
        onBackToBoard={() => { void changeView('board') }}
        onLeaveGuardChange={setLeaveGuard}
        suspended={viewSwitching}
      />
      {viewSwitching && (
        <div
          data-testid="view-switch-shield"
          style={{ position: 'absolute', inset: 0, zIndex: 200, cursor: 'wait' }}
          onMouseDown={(e) => e.preventDefault()}
        />
      )}
      {!loaded && (
        <div style={{ position: 'absolute', inset: '120px 0 0', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-start', paddingTop: 80, pointerEvents: 'none' }}>
          {studentSwitching
            ? <div style={{ color: 'var(--fg-tertiary)' }}>{S.common.loadingEllipsis}</div>
            : <>
                <div style={{ color: 'var(--fg-secondary)', marginBottom: 14 }}>{S.workspace.plan.studentNoPlan(studentName)}</div>
                <button onClick={newPlan} style={{ ...btn, pointerEvents: 'auto' }}>{S.workspace.plan.newPlan}</button>
              </>}
        </div>
      )}
      <BackfillHistoryDialog
        open={backfillOpen && !!loaded}
        name={loaded?.plan.name ?? ''}
        weeks={loaded?.plan.plan_weeks ?? 0}
        busy={backfilling}
        error={backfillError}
        onClose={() => { if (!backfilling) setBackfillOpen(false) }}
        onConfirm={() => { void backfillHistory() }}
      />
      <NewPlanDialog open={newPlanOpen} studentName={studentName} onClose={() => setNewPlanOpen(false)} onCreate={createNewPlan} />
      <DeletePlanDialog
        open={deleteOpen && loaded?.plan.status === 'draft'}
        name={loaded?.plan.name ?? ''}
        weeks={loaded?.plan.plan_weeks ?? 0}
        trainingDays={loaded?.plan.days.length ?? 0}
        deleting={deleting}
        error={deleteError}
        onClose={() => { if (!deleting) setDeleteOpen(false) }}
        onDelete={() => { void deleteCurrentPlan() }}
      />
      <CompletePlanDialog
        open={completeOpen && loaded?.plan.status === 'published'}
        name={loaded?.plan.name ?? ''}
        weeks={loaded?.plan.plan_weeks ?? 0}
        completing={completing}
        error={completeError}
        onClose={() => { if (!completing) setCompleteOpen(false) }}
        onComplete={() => { void markCurrentComplete() }}
      />
    </div>}
    {view === 'catalog' && <CatalogPage
      exerciseList={exerciseList}
      catalog={catalog}
      index={index}
      onCreateExercise={handleCreateExercise}
      onUseExercise={() => { void changeView('editor') }}
      commandExerciseId={commandExerciseId}
      onCommandExerciseHandled={() => setCommandExerciseId(null)}
    />}
    {view === 'board' && (hasStudents
      ? <StudentBoard
          students={students}
          selectedStudentId={studentId}
          dataByStudent={rosterDataByStudent}
          plansByStudent={plansByStudent}
          conversations={conversations}
          rows={rosterRows}
          counts={rosterCounts}
          onSelect={selectBoardStudent}
          onOpen={(id) => { void openStudentEditor(id) }}
          onRetryOverview={refreshRosterOverview}
          onRetryProfile={refreshRosterProfile}
          onRetryWeekTonnage={(id) => refreshRosterWeekTonnage(id, plansByStudentRef.current[id] ?? [], true)}
          onRetryPlans={refreshRosterPlans}
        />
      : <div className="empty-page">{S.workspace.plan.acceptForOverview}</div>)}
    {view === 'requests' && <RequestsPage requests={bindRequests} onRequestsChanged={applyBindRequests} onAccepted={refreshStudentsAfterAccept} />}
    {view === 'tracking' && (hasStudents
      ? <TrackingDashboard
          students={students}
          selectedStudentId={studentId}
          onStudentChange={setStudentId}
          overview={isFailedRosterDatum(rosterDataByStudent[studentId]?.overview) ? null : rosterDataByStudent[studentId]?.overview}
          onEnsureOverview={ensureTrackingOverview}
        />
      : <div className="empty-page">{S.workspace.plan.acceptForTracking}</div>)}
    {view === 'messages' && (hasStudents
      ? <StudentHubPage
          me={me}
          students={students}
          selectedStudentId={studentId}
          videosByStudent={videosByStudent}
          onRefreshVideos={refreshStudentVideos}
          conversations={conversations}
          bindLostIds={bindLostIds}
          sessionDead={sessionDead}
          activeId={chatActiveId}
          drafts={chatDrafts}
          onActiveIdChange={setChatActiveId}
          onStudentChange={setStudentId}
          onOpenPlan={(id) => { void openStudentEditor(id) }}
          onDraftChange={updateChatDraft}
          onConversationsChanged={applyConversations}
          onReadStateApplied={applyReadState}
          onBindLost={(conversationId) => setBindLostIds((prev) => new Set(prev).add(conversationId))}
          onSessionExpired={() => setSessionDead(true)}
        />
      : <div className="empty-page">{S.workspace.plan.acceptForMessages}</div>)}
    </CoachShell>
  )
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ height: '100vh', background: 'var(--bg)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
      {children}
    </div>
  )
}
const btn: React.CSSProperties = {
  background: 'var(--card-bg)', color: 'var(--txt)', border: '1px solid var(--bd)', borderRadius: 'var(--r-md)', padding: '9px 16px', fontWeight: 600, fontSize: 13, cursor: 'pointer',
}
