// Cloudflare Pages Function — proxy /api/* to the MeetPR backend.
// The site is served over HTTPS but the backend is HTTP (121.40.160.241:3000);
// browsers block HTTPS->HTTP (mixed content), so we proxy server-side at the edge
// (same role the Vite dev proxy plays locally). Edit BACKEND when the backend
// gets a domain/HTTPS.
const BACKEND = 'http://121.40.160.241:3000'

export async function onRequest(context: { request: Request }): Promise<Response> {
  const { request } = context
  const url = new URL(request.url)
  const target = BACKEND + url.pathname.replace(/^\/api/, '') + url.search
  // Cloning the Request copies method, headers and body (incl. streamed bodies).
  return fetch(new Request(target, request))
}
