import { ApiException } from '../../api/client'

export type SaveFailureKind = 'network' | 'session' | 'rateLimited' | 'rejected' | 'serverError' | 'internal'
export interface SaveFailure { kind: SaveFailureKind; tech: string }

// Diagnostics are screenshot-safe: never serialize details, issue messages or thrown objects.
// Error messages can include URLs, credentials or payloads; strip these before truncating.
function safeDiagnostic(text: string): string {
  return text
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/"[^"\n]*"|'[^'\n]*'/g, '[redacted]')
    .replace(/[\[{][\s\S]*/g, '[redacted]')
    .replace(/https?:\/\/\S+/gi, '[redacted]')
    .replace(/\b(?:bearer\s+\S+|(?:[\w-]*token|authorization|password|request\s*body|payload)(?:\s*[:=]\s*|\s+).*)/gi, '[redacted]')
    .replace(/\+?\d[\d ()-]{8,}\d/g, '[redacted]')
    .replace(/\b[A-Za-z0-9_-]{16,}\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g, '[redacted]')
    .trim()
}

export function classifySaveFailure(error: unknown): SaveFailure {
  if (error instanceof ApiException) {
    const { status, code, details } = error
    const kind = status === 401 ? 'session'
      : status === 429 ? 'rateLimited'
        : status >= 400 && status < 500 ? 'rejected'
          : status >= 500 ? 'serverError' : 'internal'
    const firstIssue: unknown = Array.isArray(details.issues) ? details.issues[0] : undefined
    const path = firstIssue && typeof firstIssue === 'object' && 'path' in firstIssue
      ? firstIssue.path : undefined
    const pathText = Array.isArray(path) && path.every((part) => typeof part === 'string' || typeof part === 'number')
      ? safeDiagnostic(path.join('.')).slice(0, 80) : ''
    return { kind, tech: `${status} ${safeDiagnostic(code)}${pathText ? ` · ${pathText}` : ''}` }
  }
  const diagnosticError = error instanceof Error || (typeof DOMException !== 'undefined' && error instanceof DOMException)
    ? error : null
  const network = diagnosticError !== null && (
    diagnosticError.name === 'NetworkError'
    || (error instanceof TypeError && /^(Failed to fetch|Load failed|NetworkError when attempting to fetch resource\.?|Network request failed)$/i.test(error.message))
  )
  const tech = diagnosticError
    ? safeDiagnostic(`${diagnosticError.name}: ${diagnosticError.message}`).slice(0, 80) : 'Unknown error'
  return { kind: network ? 'network' : 'internal', tech }
}
