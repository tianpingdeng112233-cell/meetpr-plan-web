import { request } from '../../api/client'

type WebEvent = 'coach_application_submitted' | 'coach_application_approved' | 'coach_password_set' | 'invite_landing_open' | 'install_clicked'
let session: string | undefined
let seq = 0
// getRandomValues also works on the current HTTP staging origin, where randomUUID
// and navigator.clipboard may be unavailable. Analytics never blocks onboarding.
function uuid() {
  const bytes = crypto.getRandomValues(new Uint8Array(16))
  bytes[6] = (bytes[6] & 15) | 64; bytes[8] = (bytes[8] & 63) | 128
  const hex = Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}
export function trackOnboarding(name: WebEvent, props: Record<string, string | boolean> = {}) {
  try {
    session ??= uuid()
    let anon = localStorage.getItem('mpw.analyticsAnon')
    if (!anon) { anon = uuid(); localStorage.setItem('mpw.analyticsAnon', anon) }
    void request('/events', { method: 'POST', retryRateLimit: false, keepalive: true, body: {
      anon_id: anon, platform: 'web', app_version: '0.1.0', events: [{ event_id: uuid(), session_id: session, seq: seq++, schema_version: 1, ts_client: new Date().toISOString(), name, props }],
    } }).catch(() => { /* optional analytics */ })
  } catch { /* storage / crypto unavailable */ }
}
