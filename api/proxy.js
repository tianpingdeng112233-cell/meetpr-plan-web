const TARGET = 'http://121.40.160.241:3000'

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

export default async function handler(req, res) {
  const headers = new Headers()
  for (const [key, value] of Object.entries(req.headers)) {
    const lower = key.toLowerCase()
    if (HOP_BY_HOP_HEADERS.has(lower)) continue
    for (const item of asArray(value)) headers.append(key, item)
  }
  if (req.body != null && !headers.has('content-type')) headers.set('content-type', 'application/json')

  try {
    const upstream = await fetch(targetUrl(req), {
      method: req.method,
      headers,
      body: bodyFor(req),
      redirect: 'manual',
    })

    res.statusCode = upstream.status
    upstream.headers.forEach((value, key) => {
      if (!HOP_BY_HOP_HEADERS.has(key.toLowerCase())) res.setHeader(key, value)
    })
    res.send(Buffer.from(await upstream.arrayBuffer()))
  } catch {
    res.status(502).json({ error: 'BACKEND_PROXY_UNREACHABLE' })
  }
}
