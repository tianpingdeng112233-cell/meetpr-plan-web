import { useEffect, useState } from 'react'
import { monitorBuildUpdates } from './buildUpdate'
import { isReloadBlocked } from './reloadSafety'
import { S } from './i18n/strings'

export function BuildUpdateGuard() {
  const [waitingForSafeReload, setWaitingForSafeReload] = useState(false)

  useEffect(() => monitorBuildUpdates(() => {
    if (!isReloadBlocked()) {
      window.location.reload()
      return
    }
    setWaitingForSafeReload(true)
  }), [])

  useEffect(() => {
    if (!waitingForSafeReload) return
    const timer = window.setInterval(() => {
      if (!isReloadBlocked()) window.location.reload()
    }, 1000)
    return () => window.clearInterval(timer)
  }, [waitingForSafeReload])

  if (!waitingForSafeReload) return null
  return (
    <aside className="build-update-banner" role="alert">
      <div>
        <strong>{S.app.updateReadyTitle}</strong>
        <span>{S.app.updateWaitingForSave}</span>
      </div>
      <button type="button" onClick={() => window.location.reload()}>{S.app.reloadNow}</button>
    </aside>
  )
}
