// Muka Phone: read-only companion server. Node built-ins only.
import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const PUBLIC = path.join(HERE, 'public')
const WINDOW_MS = 48 * 3600 * 1000
const ID_RE = /^[A-Za-z0-9_-]{1,128}$/
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
}
const CSP = "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'"

export function hostAllowed(host) {
  if (!host) return false
  let h = String(host).toLowerCase()
  if (h.startsWith('[')) {
    const end = h.indexOf(']')
    if (end < 0) return false
    h = h.slice(0, end + 1)
  } else {
    h = h.replace(/:\d+$/, '')
  }
  return h === 'localhost' || h === '127.0.0.1' || h === '[::1]' || /^[a-z0-9-]+(\.[a-z0-9-]+)*\.ts\.net$/.test(h)
}

function baseHeaders(extra = {}) {
  return {
    'Content-Security-Policy': CSP,
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
    ...extra,
  }
}

export function createServer({ liveDir } = {}) {
  const dir = liveDir || process.env.MUKA_LIVE_DIR || path.join(os.homedir(), '.claude', 'muka', 'live')
  const lastGood = new Map()

  function send(req, res, status, body, headers) {
    res.writeHead(status, baseHeaders(headers))
    res.end(req.method === 'HEAD' ? undefined : body)
  }
  function json(req, res, status, obj) {
    send(req, res, status, JSON.stringify(obj), { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' })
  }
  const text = (req, res, status, msg) => send(req, res, status, msg, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' })

  function readSession(id) {
    const file = path.join(dir, id + '.json')
    let raw
    try { raw = fs.readFileSync(file, 'utf8') } catch { return { missing: true } }
    try {
      const obj = JSON.parse(raw)
      if (obj && typeof obj === 'object') { lastGood.set(id, obj); return { data: obj } }
    } catch { /* torn write */ }
    return { torn: true }
  }

  function list() {
    let names
    try { names = fs.readdirSync(dir) } catch { return [] }
    const now = Date.now()
    const out = []
    for (const n of names) {
      if (!n.endsWith('.json')) continue
      const id = n.slice(0, -5)
      if (!ID_RE.test(id)) continue
      let st
      try { st = fs.statSync(path.join(dir, n)) } catch { continue }
      if (!st.isFile() || now - st.mtimeMs > WINDOW_MS) continue
      const r = readSession(id)
      if (!r.data) continue
      const d = r.data
      out.push({
        id,
        sessionId: typeof d.sessionId === 'string' ? d.sessionId : id,
        project: d.project,
        prompt: d.prompt,
        isWorking: !!d.isWorking,
        updatedAt: typeof d.updatedAt === 'number' ? d.updatedAt : Math.round(st.mtimeMs),
        costUsd: d.main && d.main.costUsd,
        score: d.score ? { score: d.score.score, grade: d.score.grade } : undefined,
      })
    }
    out.sort((a, b) => b.updatedAt - a.updatedAt)
    return out
  }

  function serveStatic(req, res, pathname) {
    let rel
    try { rel = decodeURIComponent(pathname) } catch { return text(req, res, 400, 'bad request') }
    if (rel.includes('\0') || rel.includes('\\')) return text(req, res, 400, 'bad request')
    if (rel === '/') rel = '/index.html'
    const segs = rel.split('/').filter(Boolean)
    if (segs.some((s) => s === '..' || s === '.')) return text(req, res, 404, 'not found')
    const full = path.join(PUBLIC, ...segs)
    if (!full.startsWith(PUBLIC + path.sep)) return text(req, res, 404, 'not found')
    const type = TYPES[path.extname(full).toLowerCase()]
    if (!type) return text(req, res, 404, 'not found')
    let st
    try { st = fs.statSync(full) } catch { return text(req, res, 404, 'not found') }
    if (!st.isFile()) return text(req, res, 404, 'not found')
    send(req, res, 200, fs.readFileSync(full), { 'Content-Type': type, 'Cache-Control': 'no-cache' })
  }

  return http.createServer((req, res) => {
    try {
      if (!hostAllowed(req.headers.host)) return text(req, res, 403, 'forbidden host')
      if (req.method !== 'GET' && req.method !== 'HEAD') {
        res.setHeader('Allow', 'GET, HEAD')
        return text(req, res, 405, 'method not allowed')
      }
      const pathname = (req.url || '/').split('?')[0].split('#')[0]
      if (pathname === '/api/sessions') return json(req, res, 200, { sessions: list(), now: Date.now() })
      if (pathname.startsWith('/api/session/')) {
        let id
        try { id = decodeURIComponent(pathname.slice('/api/session/'.length)) } catch { return json(req, res, 400, { error: 'bad id' }) }
        if (!ID_RE.test(id)) return json(req, res, 400, { error: 'bad id' })
        const r = readSession(id)
        if (r.data) return json(req, res, 200, r.data)
        if (r.torn) {
          const g = lastGood.get(id)
          return g ? json(req, res, 200, g) : json(req, res, 503, { error: 'updating' })
        }
        return json(req, res, 404, { error: 'not found' })
      }
      if (pathname.startsWith('/api/')) return json(req, res, 404, { error: 'not found' })
      serveStatic(req, res, pathname)
    } catch {
      try { text(req, res, 500, 'error') } catch { /* ignore */ }
    }
  })
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.MUKA_PHONE_PORT) || 4791
  createServer({}).listen(port, '127.0.0.1', () => console.log('Muka Phone on http://127.0.0.1:' + port))
}
