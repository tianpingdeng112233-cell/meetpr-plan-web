// Local UI evidence only: never sends mail or changes a real account/password.
// Start with node <this file>; point Vite MEETPR_DEV_BACKEND_TARGET at port 3095.
const http = require('node:http')
http.createServer(async (request, response) => {
  const chunks = []
  for await (const chunk of request) chunks.push(chunk)
  let body = {}
  try { body = JSON.parse(Buffer.concat(chunks).toString() || '{}') } catch {}
  if (request.method === 'POST' && request.url === '/auth/email/forgot') {
    response.writeHead(204).end()
  } else if (request.method === 'POST' && request.url === '/auth/email/reset') {
    if (body.code === '123456') response.writeHead(204).end()
    else response.writeHead(401, { 'Content-Type': 'application/json' }).end(JSON.stringify({ error: 'AUTH_INVALID_RESET_CODE' }))
  } else response.writeHead(404).end()
}).listen(3095, '127.0.0.1', () => console.log('Synthetic recovery fixture: 127.0.0.1:3095'))
