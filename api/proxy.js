import http from 'node:http'
import https from 'node:https'

const TARGET = process.env.BACKEND_TARGET ?? 'http://121.40.160.241:3000'
const UPSTREAM_TIMEOUT_MS = 12000
const UPSTREAM_ATTEMPTS = 2

const HOP_BY_HOP_HEADERS = new Set([
  'connection',
  'content-length',
  'expect',
  'host',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade',
])

function asArray(value) {
  if (Array.isArray(value)) return value
  if (value == null) return []
  return [value]
}

function targetUrl(req) {
  const path = asArray(req.query.path).join('/')
  const url = new URL(`${TARGET}/${String(path).split('/').filter(Boolean).map(encodeURIComponent).join('/')}`)
  for (const [key, value] of Object.entries(req.query)) {
    if (key === 'path') continue
    for (const item of asArray(value)) url.searchParams.append(key, String(item))
  }
  return url
}

function bodyFor(req) {
  const method = req.method ?? 'GET'
  if (method === 'GET' || method === 'HEAD') return undefined
  if (req.body == null) return undefined
  if (Buffer.isBuffer(req.body) || typeof req.body === 'string') return req.body
  return JSON.stringify(req.body)
}

function headerObject(headers) {
  const out = {}
  headers.forEach((value, key) => { out[key] = value })
  return out
}

function requestUpstream(req, headers, body) {
  return new Promise((resolve, reject) => {
    const url = targetUrl(req)
    const client = url.protocol === 'https:' ? https : http
    let settled = false
    let timeout
    let upstreamReq

    const finish = (callback) => {
      if (settled) return
      settled = true
      clearTimeout(timeout)
      callback()
    }

    timeout = setTimeout(() => {
      upstreamReq?.destroy(new Error('UPSTREAM_TIMEOUT'))
    }, UPSTREAM_TIMEOUT_MS)

    upstreamReq = client.request(url, {
      method: req.method,
      headers: headerObject(headers),
      agent: false,
    }, (upstreamRes) => {
      upstreamRes.setTimeout(UPSTREAM_TIMEOUT_MS, () => {
        upstreamReq.destroy(new Error('UPSTREAM_TIMEOUT'))
      })
      upstreamRes.on('error', (error) => finish(() => reject(error)))
      const chunks = []
      upstreamRes.on('data', (chunk) => chunks.push(Buffer.from(chunk)))
      upstreamRes.on('end', () => {
        finish(() => resolve({
          statusCode: upstreamRes.statusCode ?? 502,
          headers: upstreamRes.headers,
          body: Buffer.concat(chunks),
        }))
      })
    })

    upstreamReq.setTimeout(UPSTREAM_TIMEOUT_MS, () => {
      upstreamReq.destroy(new Error('UPSTREAM_TIMEOUT'))
    })
    upstreamReq.on('error', (error) => finish(() => reject(error)))
    if (body !== undefined) upstreamReq.write(body)
    upstreamReq.end()
  })
}

export default async function handler(req, res) {
  const headers = new Headers()
  for (const [key, value] of Object.entries(req.headers)) {
    const lower = key.toLowerCase()
    if (HOP_BY_HOP_HEADERS.has(lower)) continue
    for (const item of asArray(value)) headers.append(key, item)
  }
  if (req.body != null && !headers.has('content-type')) headers.set('content-type', 'application/json')

  try {
    let upstream = null
    let lastError = null
    const method = req.method ?? 'GET'
    const attempts = method === 'GET' || method === 'HEAD' ? UPSTREAM_ATTEMPTS : 1
    const body = bodyFor(req)
    for (let attempt = 1; attempt <= attempts; attempt++) {
      try {
        upstream = await requestUpstream(req, headers, body)
        break
      } catch (error) {
        lastError = error
        if (attempt === attempts) throw error
      }
    }
    if (!upstream) throw lastError ?? new Error('No upstream response')

    res.statusCode = upstream.statusCode
    for (const [key, value] of Object.entries(upstream.headers)) {
      if (!HOP_BY_HOP_HEADERS.has(key.toLowerCase())) res.setHeader(key, value)
    }
    res.send(upstream.body)
  } catch (error) {
    const name = error instanceof Error ? error.name : 'UnknownError'
    const message = error instanceof Error ? error.message : String(error)
    console.error('backend_proxy_unreachable', {
      target: TARGET,
      path: asArray(req.query.path).join('/'),
      error: name,
      message,
    })
    res.status(502).json({ error: 'BACKEND_PROXY_UNREACHABLE', reason: name })
  }
}
