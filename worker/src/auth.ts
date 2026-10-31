/**
 * Simple password protection for the whole app (no Cloudflare Access needed).
 *
 * - The password is the Worker secret APP_PASSWORD (`npm run set-password`).
 * - After logging in, the browser keeps a signed cookie for a year; changing the password
 *   signs everyone out, because the signing key is derived from the password.
 * - If APP_PASSWORD isn't set, the app stays open (handy for `wrangler dev`).
 */

const COOKIE = 'vanity_auth'
const MAX_AGE = 365 * 24 * 60 * 60 // seconds

/** Files the phone needs for "Add to Home Screen" even before logging in */
const PUBLIC_PATHS = new Set(['/login', '/manifest.webmanifest', '/icon-192.png', '/icon-512.png', '/apple-touch-icon.png', '/favicon.ico'])

const enc = new TextEncoder()

async function hmacKey(password: string) {
  return crypto.subtle.importKey('raw', enc.encode('vanity-session:' + password), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify'])
}

const b64url = (buf: ArrayBuffer) =>
  btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')

async function sign(password: string, payload: string) {
  return b64url(await crypto.subtle.sign('HMAC', await hmacKey(password), enc.encode(payload)))
}

async function makeToken(password: string) {
  const expires = String(Math.floor(Date.now() / 1000) + MAX_AGE)
  return `${expires}.${await sign(password, expires)}`
}

async function validToken(password: string, token: string | undefined) {
  if (!token) return false
  const [expires, sig] = token.split('.')
  if (!expires || !sig || Number(expires) < Date.now() / 1000) return false
  return sameString(sig, await sign(password, expires))
}

/** Constant-time comparison (hash both so lengths match) */
async function sameString(a: string, b: string) {
  const [ha, hb] = await Promise.all([crypto.subtle.digest('SHA-256', enc.encode(a)), crypto.subtle.digest('SHA-256', enc.encode(b))])
  return crypto.subtle.timingSafeEqual(ha, hb)
}

function readCookie(req: Request, name: string) {
  const header = req.headers.get('cookie') ?? ''
  for (const part of header.split(';')) {
    const [k, ...v] = part.trim().split('=')
    if (k === name) return v.join('=')
  }
  return undefined
}

function cookie(value: string, maxAge: number, secure: boolean) {
  return `${COOKIE}=${value}; Path=/; Max-Age=${maxAge}; HttpOnly; SameSite=Lax${secure ? '; Secure' : ''}`
}

const loginPage = (error: boolean) => `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="theme-color" content="#f6f1ec">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-title" content="Vanity">
<link rel="manifest" href="/manifest.webmanifest">
<link rel="apple-touch-icon" href="/apple-touch-icon.png">
<title>Vanity · Sign in</title>
<style>
  :root { --bg:#f6f1ec; --surface:#fffdfb; --ink:#2a2321; --ink3:#a3958e; --line:#e4d9d1; --accent:#a8394d; --danger:#b3261e; }
  @media (prefers-color-scheme: dark) { :root { --bg:#1b1716; --surface:#25201e; --ink:#f2ebe7; --ink3:#85766f; --line:#3a322f; --accent:#e07b8c; --danger:#ff8a80; } }
  * { box-sizing: border-box; }
  body { margin:0; min-height:100dvh; display:grid; place-items:center; background:var(--bg); color:var(--ink);
    font-family:-apple-system,BlinkMacSystemFont,"PingFang SC","Segoe UI",Roboto,sans-serif; padding:24px; }
  form { width:100%; max-width:340px; background:var(--surface); border-radius:20px; padding:28px 22px;
    box-shadow:0 1px 2px rgba(60,40,30,.06),0 6px 20px rgba(60,40,30,.08); display:flex; flex-direction:column; gap:14px; }
  .logo { display:grid; grid-template-columns:repeat(2,22px); gap:4px; margin:0 auto 4px; }
  .logo i { width:22px; height:22px; border-radius:6px; }
  h1 { margin:0; text-align:center; font-size:26px; }
  p { margin:0; text-align:center; color:var(--ink3); font-size:14px; }
  input { font:inherit; font-size:17px; padding:12px 14px; border-radius:12px; border:1px solid var(--line); background:var(--bg); color:var(--ink); }
  input:focus { outline:2px solid color-mix(in srgb, var(--accent) 50%, transparent); border-color:transparent; }
  button { font:inherit; font-size:17px; font-weight:600; padding:12px; border:0; border-radius:12px; background:var(--accent); color:#fff; cursor:pointer; }
  .err { color:var(--danger); font-size:14px; text-align:center; }
</style>
</head>
<body>
<form method="post" action="/login">
  <div class="logo"><i style="background:#b84458"></i><i style="background:#d68078"></i><i style="background:#965646"></i><i style="background:#e8b6a0"></i></div>
  <h1>Vanity</h1>
  <p>Enter your password</p>
  <input type="password" name="password" autocomplete="current-password" autofocus required aria-label="Password">
  ${error ? '<div class="err">Wrong password</div>' : ''}
  <button type="submit">Sign in</button>
</form>
</body>
</html>`

const html = (body: string, status = 200, headers: HeadersInit = {}) =>
  new Response(body, { status, headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store', ...headers } })

/**
 * Returns a Response when the request is handled here (login/logout pages, or blocked because not signed in),
 * or null when it may continue to the app.
 */
export async function checkAuth(req: Request, password: string | undefined): Promise<Response | null> {
  if (!password) return null
  const url = new URL(req.url)
  const secure = url.protocol === 'https:'

  if (url.pathname === '/logout') {
    return new Response(null, { status: 302, headers: { location: '/login', 'set-cookie': cookie('', 0, secure) } })
  }

  if (url.pathname === '/login') {
    if (req.method === 'POST') {
      const form = await req.formData()
      const given = String(form.get('password') ?? '')
      if (await sameString(given, password)) {
        return new Response(null, { status: 303, headers: { location: '/', 'set-cookie': cookie(await makeToken(password), MAX_AGE, secure) } })
      }
      await new Promise(r => setTimeout(r, 800)) // slow down guessing
      return html(loginPage(true), 401)
    }
    // already signed in → go to the app
    if (await validToken(password, readCookie(req, COOKIE))) return new Response(null, { status: 302, headers: { location: '/' } })
    return html(loginPage(false))
  }

  if (PUBLIC_PATHS.has(url.pathname)) return null
  if (await validToken(password, readCookie(req, COOKIE))) return null

  // not signed in
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/images/')) {
    return new Response(JSON.stringify({ error: 'Please sign in' }), { status: 401, headers: { 'content-type': 'application/json' } })
  }
  return new Response(null, { status: 302, headers: { location: '/login', 'cache-control': 'no-store' } })
}
