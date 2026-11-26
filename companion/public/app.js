// Muka Phone: read-only viewer. No framework. All text goes through textContent.
'use strict'
const POLL_MS = 3000
const STALE_MS = 90 * 1000
const view = document.getElementById('view')
const backEl = document.getElementById('back')
const connEl = document.getElementById('conn')
const SVGNS = 'http://www.w3.org/2000/svg'

let lastOk = 0 // ms epoch of the last successful fetch
let timer = null
let seq = 0

function h(tag, cls, text) {
  const e = document.createElement(tag)
  if (cls) e.className = cls
  if (text != null) e.textContent = String(text)
  return e
}
function add(parent, ...kids) {
  for (const k of kids) if (k) parent.appendChild(k)
  return parent
}
const isNum = (n) => typeof n === 'number' && isFinite(n)
const pad2 = (n) => String(n).padStart(2, '0')
function clock(ms) {
  const d = new Date(ms)
  return pad2(d.getHours()) + ':' + pad2(d.getMinutes())
}
function ago(ms, now) {
  if (!isNum(ms)) return '—'
  const s = Math.max(0, Math.round((now - ms) / 1000))
  if (s < 60) return s + ' s ago'
  if (s < 3600) return Math.floor(s / 60) + ' min ago'
  if (s < 86400) return Math.floor(s / 3600) + ' h ago'
  return Math.floor(s / 86400) + ' d ago'
}
function money(n) {
  return isNum(n) ? '$' + n.toFixed(n < 10 ? 2 : 1) : '—'
}
function tone(pct, invert) {
  if (!isNum(pct)) return ''
  const p = invert ? 100 - pct : pct
  return p >= 85 ? 'bad' : p >= 65 ? 'warn' : ''
}

function ring(pct, label, kind) {
  const r = 26
  const c = 2 * Math.PI * r
  const svg = document.createElementNS(SVGNS, 'svg')
  svg.setAttribute('viewBox', '0 0 64 64')
  svg.setAttribute('width', '64')
  svg.setAttribute('height', '64')
  svg.setAttribute('class', 'ring ' + (kind || ''))
  const mk = (cls) => {
    const el = document.createElementNS(SVGNS, 'circle')
    el.setAttribute('cx', '32')
    el.setAttribute('cy', '32')
    el.setAttribute('r', String(r))
    el.setAttribute('fill', 'none')
    el.setAttribute('stroke-width', '6')
    el.setAttribute('class', cls)
    return el
  }
  svg.appendChild(mk('tr'))
  const fg = mk('fg')
  const frac = isNum(pct) ? Math.max(0, Math.min(100, pct)) / 100 : 0
  fg.setAttribute('stroke-linecap', 'round')
  fg.setAttribute('stroke-dasharray', (c * frac).toFixed(1) + ' ' + c.toFixed(1))
  fg.setAttribute('transform', 'rotate(-90 32 32)')
  svg.appendChild(fg)
  const t = document.createElementNS(SVGNS, 'text')
  t.setAttribute('x', '32')
  t.setAttribute('y', '37')
  t.setAttribute('text-anchor', 'middle')
  t.textContent = label
  svg.appendChild(t)
  return svg
}
function ringBox(svg, caption) {
  return add(h('div', 'rings-item'), svg, h('div', 'meta', caption))
}

function barRow(label, value, kind) {
  const row = h('div', 'bar-row')
  const track = h('div', 'track')
  const fill = h('div', 'fill' + (kind ? ' ' + kind : ''))
  fill.style.width = (isNum(value) ? Math.max(0, Math.min(100, value)) : 0) + '%'
  track.appendChild(fill)
  return add(row, h('span', 'lbl', label), track, h('span', 'num', isNum(value) ? Math.round(value) : '—'))
}

function pill(text, cls) {
  return h('span', 'pill' + (cls ? ' ' + cls : ''), text)
}

/* ---------- views ---------- */

function renderHome(data) {
  const now = data.now || Date.now()
  const frag = document.createDocumentFragment()
  const list = data.sessions || []
  if (!list.length) {
    add(frag, h('p', 'muted pad', 'No recent sessions. Start a Claude session with Muka on and it shows up here.'))
  }
  for (const s of list) {
    const a = h('a', 'card')
    a.href = '#/s/' + encodeURIComponent(s.id || s.sessionId)
    const top = add(h('div', 'row between'),
      add(h('div', 'row grow'), h('span', 'dot' + (s.isWorking ? ' work' : '')), h('span', 'title', s.project || 'session')),
      s.score && s.score.grade ? pill(s.score.grade + (isNum(s.score.score) ? ' ' + Math.round(s.score.score) : ''), 'ok') : null)
    const stale = s.isWorking && now - s.updatedAt > STALE_MS
    const meta = add(h('div', 'row between wrap meta'),
      h('span', '', (s.isWorking ? 'Working' : 'Idle') + ' · ' + money(s.costUsd)),
      add(h('span', 'row'), stale ? h('span', 'badge', 'stale') : null, h('span', '', 'updated ' + ago(s.updatedAt, now))))
    add(a, top, h('div', 'prompt', s.prompt || '—'), meta)
    frag.appendChild(a)
  }
  view.replaceChildren(frag)
}

function section(title, body) {
  const f = document.createDocumentFragment()
  f.appendChild(h('h2', '', title))
  f.appendChild(body)
  return f
}

function renderSession(d, now) {
  const m = d.main || {}
  const frag = document.createDocumentFragment()
  const stale = d.isWorking && now - d.updatedAt > STALE_MS

  // header
  const head = h('div', 'panel')
  add(head,
    add(h('div', 'row between'),
      add(h('div', 'row grow'), h('span', 'dot' + (d.isWorking ? ' work' : '')), h('span', 'title', d.project || 'session')),
      add(h('span', 'row'), stale ? h('span', 'badge', 'stale') : null, pill(d.isWorking ? 'Working' : 'Idle', d.isWorking ? 'ok' : ''))),
    h('div', 'prompt', d.prompt || '—'))
  const rings = h('div', 'rings')
  const ctx = isNum(m.ctxPercent) ? m.ctxPercent : null
  rings.appendChild(ringBox(ring(ctx, ctx == null ? '—' : Math.round(ctx) + '%', tone(ctx)), 'context'))
  const st = h('div', 'grow')
  add(st,
    h('div', '', 'prompt ' + money(m.promptCostUsd) + (isNum(m.promptBudget) ? ' of ' + money(m.promptBudget) : '')),
    h('div', 'meta', 'session ' + money(m.costUsd)),
    h('div', 'meta', [m.model, isNum(m.stepCount) ? m.stepCount + ' steps' : null, m.verify].filter(Boolean).join(' · ') || '—'),
    m.current ? h('div', 'meta', 'now: ' + (m.current.tool || '') + ' ' + (m.current.label || '')) : null,
    h('div', 'meta', 'updated ' + ago(d.updatedAt, now)))
  rings.appendChild(st)
  head.appendChild(rings)
  if (Array.isArray(m.limits) && m.limits.length) {
    const lim = h('div', 'stat')
    for (const l of m.limits) lim.appendChild(h('span', 'meta', (l.kind || 'limit') + ' ' + (isNum(l.percent) ? Math.round(l.percent) + '%' : '—')))
    head.appendChild(lim)
  }
  frag.appendChild(head)

  // score
  const sc = d.score || {}
  const scBox = h('div', 'panel rings')
  const sv = isNum(sc.score) ? sc.score : null
  scBox.appendChild(ringBox(ring(sv, sv == null ? '—' : sc.grade || Math.round(sv), tone(sv, true)), 'score' + (sv != null ? ' ' + Math.round(sv) : '')))
  const bars = h('div', 'bars')
  const pillars = Array.isArray(sc.pillars) ? sc.pillars : []
  for (const p of pillars) bars.appendChild(barRow(p.label || p.key, p.value, tone(p.value, true)))
  if (!pillars.length) bars.appendChild(h('div', 'meta', 'No score yet'))
  scBox.appendChild(bars)
  frag.appendChild(section('Score', scBox))

  // plan
  if (Array.isArray(m.plan) && m.plan.length) {
    const ul = h('ul', 'plan')
    for (const p of m.plan) {
      const done = p.status === 'completed'
      const now_ = p.status === 'in_progress'
      add(ul, add(h('li'), h('span', 'mark', done ? '✓' : now_ ? '▸' : '○'), h('span', done ? 'done' : now_ ? 'now' : '', p.content)))
    }
    frag.appendChild(section('Plan', add(h('div', 'panel'), ul)))
  }

  // helpers
  if (Array.isArray(d.helpers) && d.helpers.length) {
    const box = h('div', 'panel tight')
    for (const x of d.helpers) {
      const cls = x.status === 'running' ? 'run' : x.status === 'done' ? 'ok' : x.status === 'failed' ? 'bad' : 'warn'
      const it = h('div', 'item')
      add(it,
        add(h('div', 'row between'), h('span', 'title', x.type || 'helper'), pill(x.status || '?', cls)),
        h('div', 'prompt', x.description || ''),
        h('div', 'meta', [x.model, x.effort, isNum(x.stepCount) ? x.stepCount + ' steps' : null].filter(Boolean).join(' · ')),
        x.status === 'running' && x.current ? h('div', 'meta', 'now: ' + (x.current.tool || '') + ' ' + (x.current.label || '')) : null)
      box.appendChild(it)
    }
    frag.appendChild(section('Helpers', box))
  }

  // activity, newest first
  if (Array.isArray(d.activity) && d.activity.length) {
    const box = h('div', 'panel tight')
    for (const a of d.activity.slice().reverse()) {
      const it = h('div', 'item')
      const out = a.outcome ? h('span', 'pill ' + (a.outcome === 'denied' ? 'warn' : 'bad'), a.outcome) : null
      add(it,
        add(h('div', 'row between'), h('span', '', (a.tool || '') + ' · ' + (a.agent || '')), add(h('span', 'row'), out, h('span', 'meta', clock(a.at)))),
        h('div', 'meta', a.label || ''))
      box.appendChild(it)
    }
    frag.appendChild(section('Activity', box))
  }

  // tools
  if (Array.isArray(d.tools) && d.tools.length) {
    const max = Math.max(...d.tools.map((t) => t.count || 0), 1)
    const box = h('div', 'panel')
    for (const t of d.tools) {
      const row = barRow(t.tool, ((t.count || 0) / max) * 100, t.errors ? 'warn' : '')
      row.lastChild.textContent = String(t.count || 0) + (t.errors ? ' (' + t.errors + ' err)' : '')
      box.appendChild(row)
    }
    frag.appendChild(section('Tools', box))
  }

  // changes
  if (Array.isArray(d.changes) && d.changes.length) {
    const box = h('div', 'panel tight')
    for (const c of d.changes) {
      box.appendChild(add(h('div', 'item'),
        add(h('div', 'row between'), h('span', '', c.path), h('span', 'meta', '×' + (c.count || 1))),
        h('div', 'meta', (Array.isArray(c.agents) ? c.agents.join(', ') : '') + (isNum(c.at) ? ' · ' + clock(c.at) : ''))))
    }
    frag.appendChild(section('Changes', box))
  }

  // alerts
  if (Array.isArray(d.alerts) && d.alerts.length) {
    const box = h('div', 'panel tight')
    for (const a of d.alerts.slice().reverse()) {
      box.appendChild(add(h('div', 'item'),
        add(h('div', 'row between'), add(h('span', 'row'), pill(a.kind || 'alert', 'warn'), h('span', 'meta', a.agent || '')), h('span', 'meta', clock(a.at))),
        h('div', '', a.text || '')))
    }
    frag.appendChild(section('Alerts', box))
  }

  view.replaceChildren(frag)
}

function renderMessage(text, cls) {
  view.replaceChildren(h('p', cls || 'muted pad', text))
}

/* ---------- data + routing ---------- */

function route() {
  const m = /^#\/s\/([^/]+)$/.exec(location.hash)
  if (m) {
    let id = ''
    try { id = decodeURIComponent(m[1]) } catch { id = '' }
    return { kind: 'session', id }
  }
  return { kind: 'home' }
}

function setOffline(on) {
  let bar = document.getElementById('offline')
  if (!on) {
    if (bar) bar.remove()
    connEl.hidden = true
    return
  }
  const text = 'PC not reachable (asleep or offline).' + (lastOk ? ' Last update ' + clock(lastOk) : '')
  if (!bar) {
    bar = h('div', 'offline')
    bar.id = 'offline'
    view.parentNode.insertBefore(bar, view)
  }
  bar.textContent = text
}

async function getJson(url) {
  const r = await fetch(url, { cache: 'no-store' })
  if (!r.ok) {
    const e = new Error('http ' + r.status)
    e.status = r.status
    throw e
  }
  return r.json()
}

async function refresh() {
  const my = ++seq
  const rt = route()
  backEl.hidden = rt.kind === 'home'
  try {
    if (rt.kind === 'home') {
      const data = await getJson('api/sessions')
      if (my !== seq) return
      lastOk = Date.now()
      setOffline(false)
      renderHome(data)
    } else {
      const data = await getJson('api/session/' + encodeURIComponent(rt.id))
      if (my !== seq) return
      lastOk = Date.now()
      setOffline(false)
      renderSession(data, Date.now())
    }
  } catch (e) {
    if (my !== seq) return
    if (e && e.status === 404) { setOffline(false); renderMessage('Session not found. It may be older than 48 hours.'); return }
    if (e && e.status === 503) { return } // file mid-write: keep what is shown, retry next tick
    if (e && e.status) { setOffline(false); renderMessage('Server error (' + e.status + ').', 'err pad'); return }
    setOffline(true)
  }
}

function start() {
  stop()
  refresh()
  timer = setInterval(refresh, POLL_MS)
}
function stop() {
  if (timer) clearInterval(timer)
  timer = null
}

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') start()
  else stop()
})
window.addEventListener('hashchange', () => {
  window.scrollTo(0, 0)
  view.replaceChildren(h('p', 'muted pad', 'Loading...'))
  if (document.visibilityState === 'visible') start()
})
if (document.visibilityState === 'visible') start()
