import { api } from './client'

// Coach invite codes (backend GET/POST /coach/invite-codes). A coach shares their
// permanent code; the student enters it in the MeetPR app to request a bond.
export interface InviteCode {
  id: string
  coach_id: string
  code: string
  type: 'personal_permanent' | 'single_use' | 'time_limited'
  max_uses: number | null
  used_count: number
  expires_at: string | null
  revoked_at: string | null
  label: string | null
  created_at: string
}

export const getInviteCodes = () =>
  api.get<{ invite_codes: InviteCode[] }>('/coach/invite-codes').then((r) => r.invite_codes)

/** Create (or regenerate) the coach's permanent invite code; server revokes the prior one. */
export const createPermanentInviteCode = () =>
  api.post<InviteCode>('/coach/invite-codes', { type: 'personal_permanent' })

/** The coach's currently-active permanent code, if any. */
export function activePermanentCode(codes: InviteCode[]): InviteCode | null {
  return codes.find((c) => c.type === 'personal_permanent' && c.revoked_at === null) ?? null
}
