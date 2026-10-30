import { createPortal } from 'react-dom'
import { useEffect, useState } from 'react'
import QRCode from 'qrcode'
import { text, zhText } from './text'
import { trackOnboarding } from './telemetry'

export type Device = 'iphone' | 'android' | 'desktop'
export function visitorDevice(userAgent = navigator.userAgent): { device: Device; inWechat: boolean } {
  return { device: /iPhone|iPad|iPod/i.test(userAgent) ? 'iphone' : /Android/i.test(userAgent) ? 'android' : 'desktop', inWechat: /MicroMessenger/i.test(userAgent) }
}
function installURL(raw: unknown) {
  if (typeof raw !== 'string' || !raw.trim()) return null
  try { const url = new URL(raw.trim()); return url.protocol === 'https:' && !url.username && !url.password ? url.href : null } catch { return null }
}
export function installationLinks() {
  return { iphone: installURL(import.meta.env.VITE_CN_TESTFLIGHT_URL), android: installURL(import.meta.env.VITE_CN_ANDROID_URL) }
}
export async function copyText(value: string) {
  if (navigator.clipboard?.writeText) {
    try { await navigator.clipboard.writeText(value); return } catch { /* HTTP / denied clipboard: try explicit user-gesture fallback */ }
  }
  const field = document.createElement('textarea')
  field.value = value; field.setAttribute('readonly', ''); field.style.position = 'fixed'; field.style.opacity = '0'
  const focused = document.activeElement as HTMLElement | null
  document.body.appendChild(field); field.select()
  try { if (!document.execCommand('copy')) throw new Error('CLIPBOARD_UNAVAILABLE') }
  finally { field.remove(); focused?.focus() }
}
export function QrImage({ value, label, downloadable = false, downloadLabel, downloadContainer }: { value: string; label: string; downloadable?: boolean; downloadLabel?: string; downloadContainer?: HTMLElement | null }) {
  const [url, setUrl] = useState('')
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    let cancelled = false; setUrl(''); setFailed(false)
    void QRCode.toString(value, { type: 'svg', margin: 4, errorCorrectionLevel: 'M' }).then(svg => {
      if (!cancelled) setUrl(`data:image/svg+xml;base64,${btoa(svg)}`)
    }, () => { if (!cancelled) setFailed(true) })
    return () => { cancelled = true }
  }, [value])
  const download = downloadable && url ? <a href={url} download="meetpr-invite.svg">{downloadLabel ?? text('保存二维码图片', 'Save QR image')}</a> : null
  return <div className="onboarding-qr">{url ? <img src={url} alt={label} width={192} height={192} /> : <span>{failed ? text('二维码暂不可用，请复制链接。', 'QR unavailable. Copy the link instead.') : text('正在生成二维码…', 'Generating QR…')}</span>}{downloadContainer ? createPortal(download, downloadContainer) : download}</div>
}
export function InstallOptions({ code }: { code?: string }) {
  const { device, inWechat } = visitorDevice()
  const links = installationLinks()
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  async function install(target: 'iphone' | 'android') {
    const url = links[target]
    if (!url) return
    setError(''); setBusy(true)
    try {
      if (code) await copyText(code)
      trackOnboarding('install_clicked', { device: target })
      window.location.assign(url)
    } catch { setError(text('无法自动复制。请先手动复制上方邀请码，再继续安装。', 'Could not copy. Copy the invite code above, then continue to install.')) }
    finally { setBusy(false) }
  }
  return <>
    {inWechat ? <p role="status">{text('点右上角 ··· 选「在浏览器打开」，再安装 App。', 'Tap ··· in the top-right corner and choose “Open in browser” to install the app.')}</p>
      : device === 'desktop' ? <div className="onboarding-qr-grid">{(['iphone', 'android'] as const).map(target => <div key={target}><h2>{target === 'iphone' ? 'iPhone' : text('安卓', 'Android')}</h2>{links[target] ? <QrImage value={links[target]!} label={text(zhText`用${target === 'iphone' ? ' iPhone ' : text('安卓手机', 'Android')}扫码安装`, `Scan with ${target === 'iphone' ? 'iPhone' : 'Android'} to install`)} /> : <p>{text('安装链接暂未开放，请联系教练或管理员。', 'Installation is not available yet. Contact your coach or administrator.')}</p>}</div>)}</div>
        : device === 'iphone' && links.iphone ? <>
          <p>{text('已安装 TestFlight 可直接进行第 2 步。', 'Already have TestFlight? Go straight to step 2.')}</p>
          <ol>
            <li><p>{text('先从 App Store 下载 TestFlight。', 'First, download TestFlight from the App Store.')}</p><a className="onboarding-button" href="https://apps.apple.com/cn/app/testflight/id899247664" target="_blank" rel="noopener noreferrer">{text('去 App Store 下载 TestFlight', 'Get TestFlight on the App Store')}</a></li>
            <li><p>{text('安装后回到本页，打开测试邀请，在 TestFlight 中安装 MeetPR。', 'After installing, return to this page, open the invitation, and install MeetPR in TestFlight.')}</p><button className="onboarding-primary" disabled={busy} onClick={() => void install('iphone')}>{code ? text('复制邀请码并去安装', 'Copy invite code and install') : text('打开测试邀请，安装 MeetPR', 'Open invitation and install MeetPR')}</button></li>
          </ol>
        </>
        : links[device] ? <button className="onboarding-primary" disabled={busy} onClick={() => void install(device)}>{code ? text('复制邀请码并去安装', 'Copy invite code and install') : text('安装 App', 'Install the app')}</button>
          : <p role="status">{text('安装链接暂未开放，请联系教练或管理员。', 'Installation is not available yet. Contact your coach or administrator.')}</p>}
    {error && <><p role="alert" className="onboarding-error">{error}</p>{device !== 'desktop' && links[device] && <a className="onboarding-button" href={links[device]!} onClick={() => trackOnboarding('install_clicked', { device })}>{text('我已手动复制，继续安装', 'I copied the code; continue to install')}</a>}</>}
    <p className="onboarding-footnote">{text('请用这条链接里的按钮安装国内版。iPhone 需先安装 Apple TestFlight；测试构建 90 天后过期，新版本首次外部测试需经苹果审核，公开测试最多 10,000 人。安卓首次安装需允许「安装未知应用」，网盘页面可能需要多点一两步。', 'Use these buttons to install the China version. iPhone requires Apple TestFlight; builds expire after 90 days, the first external build of each version needs Apple review, and public tests allow up to 10,000 testers. Android requires permission to install unknown apps; the cloud download may take a few extra taps.')}</p>
  </>
}
