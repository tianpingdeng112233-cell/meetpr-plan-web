import { useEffect, useRef } from 'react'

export interface GlobalKeyboardContext {
  event: KeyboardEvent
  editable: boolean
  video: boolean
}

export type GlobalKeyboardHandler = (context: GlobalKeyboardContext) => boolean | void

interface Registration {
  priority: number
  handler: GlobalKeyboardHandler
}

const registrations = new Set<Registration>()
let listening = false

export function isEditableTarget(target: EventTarget | null): boolean {
  const element = target instanceof HTMLElement ? target : null
  return !!element && (
    element instanceof HTMLInputElement
    || element instanceof HTMLTextAreaElement
    || element instanceof HTMLSelectElement
    || element.isContentEditable
  )
}

function dispatchGlobalKeydown(event: KeyboardEvent) {
  if (event.defaultPrevented || event.isComposing || event.keyCode === 229) return
  const context: GlobalKeyboardContext = {
    event,
    editable: isEditableTarget(event.target),
    video: event.target instanceof HTMLVideoElement,
  }
  const ordered = [...registrations].sort((left, right) => right.priority - left.priority)
  for (const registration of ordered) {
    if (registration.handler(context)) return
  }
}

function syncListener() {
  if (typeof window === 'undefined') return
  if (registrations.size > 0 && !listening) {
    window.addEventListener('keydown', dispatchGlobalKeydown)
    listening = true
  } else if (registrations.size === 0 && listening) {
    window.removeEventListener('keydown', dispatchGlobalKeydown)
    listening = false
  }
}

/**
 * Registers one screen/layer with the app-wide keydown dispatcher. The module
 * owns the only window keydown listener; callbacks stay fresh without
 * repeatedly changing listener order as components render.
 */
export function useGlobalKeyboardHandler(handler: GlobalKeyboardHandler, priority = 0) {
  const handlerRef = useRef(handler)
  handlerRef.current = handler

  useEffect(() => {
    const registration: Registration = {
      priority,
      handler: (context) => handlerRef.current(context),
    }
    registrations.add(registration)
    syncListener()
    return () => {
      registrations.delete(registration)
      syncListener()
    }
  }, [priority])
}
