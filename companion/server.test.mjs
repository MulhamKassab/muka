import { test, before, after } from 'node:test'
import assert from 'node:assert'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import http from 'node:http'
import { createServer } from './server.mjs'

let dir, server, port
const write = (name, obj, mtimeAgoMs = 0) => {
  const f = path.join(dir, name + '.json')
  fs.writeFileSync(f, typeof obj === 'string' ? obj : JSON.stringify(obj))
  if (mtimeAgoMs) {
    const t = new Date(Date.now() - mtimeAgoMs)
    fs.utimesSync(f, t, t)
  }
}
// Raw request so we can set Host and odd paths without client normalisation.
const req = (p, { method = 'GET', host } = {}) =>
  new Promise((resolve, reject) => {
    const r = http.request({ host: '127.0.0.1', port, path: p, method, headers: { Host: host ?? 'localhost:' + port } }, (res) => {
      const chunks = []
      res.on('data', (c) => chunks.push(c))
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks).toString('utf8') }))
    })
    r.on('error', reject)
    r.end()
  })

before(async () => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'muka-live-'))
  server = createServer({ liveDir: dir })
  await new Promise((r) => server.listen(0, '127.0.0.1', r))
  port = server.address().port
})
after(() => {
  server.close()
  fs.rmSync(dir, { recursive: true, force: true })
})

test('empty dir lists no sessions', async () => {
  const r = await req('/api/sessions')
  assert.equal(r.status, 200)
  assert.deepEqual(JSON.parse(r.body).sessions, [])
})

test('list sorts newest first, filters older than 48 h, summary only', async () => {
  write('old', { sessionId: 'old', project: 'p-old', updatedAt: 1, isWorking: false }, 49 * 3600 * 1000)
  write('a', { sessionId: 'a', project: 'pa', updatedAt: 1000, isWorking: false, prompt: 'x', main: { costUsd: 1.5 }, score: { score: 80, grade: 'B', pillars: [] }, activity: [{ at: 1 }] })
  write('b', { sessionId: 'b', project: 'pb', updatedAt: 3000, isWorking: true })
  write('c', { sessionId: 'c', project: 'pc', updatedAt: 2000, isWorking: false })
  const r = await req('/api/sessions')
  assert.equal(r.status, 200)
  const list = JSON.parse(r.body).sessions
  assert.deepEqual(list.map((s) => s.sessionId), ['b', 'c', 'a'])
  assert.equal(list[2].costUsd, 1.5)
  assert.deepEqual(list[2].score, { score: 80, grade: 'B' })
  assert.equal(list[2].activity, undefined)
  assert.equal(r.headers['cache-control'], 'no-store')
})

test('session route serves the file; 404 when missing; 400 for bad id', async () => {
  const ok = await req('/api/session/a')
  assert.equal(ok.status, 200)
  assert.equal(JSON.parse(ok.body).project, 'pa')
  assert.equal((await req('/api/session/nope')).status, 404)
  assert.equal((await req('/api/session/bad%20id')).status, 400)
  assert.equal((await req('/api/session/..%2f..%2fsecret')).status, 400)
  assert.equal((await req('/api/session/' + 'x'.repeat(129))).status, 400)
  assert.equal((await req('/api/session/a.json')).status, 400)
})

test('unknown /api path is 404', async () => {
  assert.equal((await req('/api/other')).status, 404)
})

test('torn JSON: list skips it, session serves last good copy, else 503', async () => {
  write('t', { sessionId: 't', project: 'pt', updatedAt: 5000, isWorking: false })
  assert.equal((await req('/api/session/t')).status, 200) // caches good copy
  write('t', '{"sessionId":"t","proj')
  const list = JSON.parse((await req('/api/sessions')).body).sessions
  assert.ok(!list.some((s) => s.sessionId === 't'))
  const r = await req('/api/session/t')
  assert.equal(r.status, 200)
  assert.equal(JSON.parse(r.body).project, 'pt')
  write('never', '{"half')
  const r2 = await req('/api/session/never')
  assert.equal(r2.status, 503)
  assert.deepEqual(JSON.parse(r2.body), { error: 'updating' })
})

test('only GET and HEAD are allowed', async () => {
  for (const method of ['POST', 'PUT', 'DELETE', 'PATCH']) {
    assert.equal((await req('/', { method })).status, 405, method)
    assert.equal((await req('/api/sessions', { method })).status, 405, method)
  }
  const h = await req('/api/sessions', { method: 'HEAD' })
  assert.equal(h.status, 200)
  assert.equal(h.body, '')
})

test('host allow-list', async () => {
  for (const host of ['localhost', 'localhost:4791', '127.0.0.1:9', '[::1]:4791', 'my-pc.tail1234.ts.net', 'my-pc.tail1234.ts.net:443']) {
    assert.equal((await req('/api/sessions', { host })).status, 200, host)
  }
  for (const host of ['evil.com', 'evil.com:4791', 'localhost.evil.com', 'ts.net.evil.com', 'x.ts.net.evil.com', '10.0.0.5']) {
    assert.equal((await req('/api/sessions', { host })).status, 403, host)
  }
})

test('static files have the right content types and security headers', async () => {
  const cases = [
    ['/', 'text/html'],
    ['/index.html', 'text/html'],
    ['/app.js', 'text/javascript'],
    ['/app.css', 'text/css'],
    ['/manifest.webmanifest', 'application/manifest+json'],
    ['/icon.svg', 'image/svg+xml'],
    ['/icon-180.png', 'image/png'],
    ['/icon-512.png', 'image/png'],
  ]
  for (const [p, type] of cases) {
    const r = await req(p)
    assert.equal(r.status, 200, p)
    assert.ok(r.headers['content-type'].startsWith(type), p + ' ' + r.headers['content-type'])
    assert.equal(r.headers['x-content-type-options'], 'nosniff')
    assert.equal(r.headers['referrer-policy'], 'no-referrer')
    const csp = r.headers['content-security-policy']
    assert.ok(csp.includes("default-src 'self'") && csp.includes("style-src 'self'") && csp.includes("img-src 'self' data:"), p)
    assert.ok(!csp.includes('unsafe-inline'))
  }
})

test('missing files, directories and listings are 404', async () => {
  assert.equal((await req('/nope.js')).status, 404)
  assert.equal((await req('/sub/')).status, 404)
  assert.equal((await req('/server.mjs')).status, 404)
  assert.equal((await req('/README.md')).status, 404)
})

test('path traversal attempts never leak files', async () => {
  const attempts = [
    '/..%2f..%2fetc',
    '/..%2fserver.mjs',
    '/public/../server.mjs',
    '/../server.mjs',
    '/%2e%2e/server.mjs',
    '/%2e%2e%2fserver.mjs',
    '/..%5cserver.mjs',
    '/app.js/../../server.mjs',
    '/%00',
    '/sample/live-sample.json',
  ]
  for (const p of attempts) {
    const r = await req(p)
    assert.ok([400, 404].includes(r.status), p + ' -> ' + r.status)
    assert.ok(!r.body.includes('createServer'), p)
  }
})
