// Claude Code status line: model · context · session cost · usage limits.
// Claude Code pipes a JSON description of the session on stdin and shows the
// first line this prints. Set up in ~/.claude/settings.json as
//   "statusLine": { "type": "command", "command": "node ~/.claude/statusline.js" }

const two = n => String(n).padStart(2, '0')

const resetAt = value => {
  if (value === undefined || value === null || value === '') return ''
  // resets_at may be an ISO string or epoch seconds.
  const d = typeof value === 'number' ? new Date(value * 1000) : new Date(value)
  if (Number.isNaN(d.getTime())) return ''
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
  const hm = `${two(d.getHours())}:${two(d.getMinutes())}`
  return d.getTime() - Date.now() < 20 * 3600 * 1000 ? hm : `${days[d.getDay()]} ${hm}`
}

const line = s => {
  const parts = []
  const model = s.model && (s.model.display_name || s.model.id)
  if (model) parts.push(model)

  const ctx = s.context_window && s.context_window.used_percentage
  if (typeof ctx === 'number') parts.push(`ctx ${Math.round(ctx)}%`)

  const cost = s.cost && s.cost.total_cost_usd
  if (typeof cost === 'number') parts.push(cost > 0 && cost < 0.01 ? '<$0.01' : `$${cost.toFixed(2)}`)

  const limits = s.rate_limits || {}
  const names = { five_hour: '5h', seven_day: 'week', spend_limit: 'spend' }
  for (const key of Object.keys(names)) {
    const l = limits[key]
    if (!l || typeof l.used_percentage !== 'number') continue
    const at = key === 'five_hour' ? resetAt(l.resets_at) : ''
    parts.push(`${names[key]} ${Math.round(l.used_percentage)}%${at ? ` (resets ${at})` : ''}`)
  }
  return parts.join(' · ')
}

let input = ''
process.stdin.setEncoding('utf8')
process.stdin.on('data', chunk => (input += chunk))
process.stdin.on('end', () => {
  try {
    process.stdout.write(line(JSON.parse(input || '{}')))
  } catch {
    process.stdout.write('')
  }
})
