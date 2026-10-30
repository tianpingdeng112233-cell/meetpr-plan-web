import { request } from '../../api/client'
import { activePermanentCode, getInviteCodes } from '../../api/invite'
import { getPublicInvite } from '../../api/onboarding'
import { groupedCode } from './InviteLandingPage'
import { text, zhText } from './text'

// Mirrors RN RnExtras.json coach.invites.message, including the Paste button label.
export function invitationMessage(link: string, code: string, name?: string | null) {
  const coach = name?.trim() || text('教练', 'Coach')
  return text(zhText`我在用 MeetPR 给你排训练计划和看动作视频。\n1. 点这个链接安装 App：${link}\n2. 打开 App 注册账号\n3. 在「输入邀请码」页点「粘贴邀请码」，或输入：${groupedCode(code)}\n我这边确认后你就能看到训练计划了。—— ${coach}`, `I'm using MeetPR to plan your training and review your lift videos.\n1. Install the app: ${link}\n2. Open it and create an account\n3. On the invite code screen, tap Paste invite code, or enter: ${groupedCode(code)}\nOnce I accept, your plan will show up. — ${coach}`)
}

export const invitationLink = (code: string) => `${window.location.origin}/i/${code}`
export const noInvitationMessage = () => text('暂时没有有效的永久邀请码。请在 App 邀请码页面生成后回来刷新。', 'No active permanent invite is available. Generate one in the app, then refresh this page.')
export async function loadCoachInvitation() {
  const [me, codes] = await Promise.all([request<{ user: { email: string | null; role: string } }>('/me'), getInviteCodes()])
  if (me.user.role !== 'coach') throw new Error('NOT_COACH')
  const code = activePermanentCode(codes)?.code ?? null
  const invite = code ? await getPublicInvite(code) : null
  return { email: me.user.email, code: invite?.valid ? code : null, name: invite?.coach_display_name ?? null }
}
